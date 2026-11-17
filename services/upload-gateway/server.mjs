// Konvertt upload gateway.
//
// Browsers send large files here in fixed-size chunks through the Cloudflare
// tunnel (each request stays far below the proxy body cap). Chunks are written
// to disk, reassembled on completion, then forwarded to the SnapOtter engine
// as multipart. Nothing is kept longer than RETENTION_MS.
//
// No dependencies. Node >= 20.

import { createServer } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const PORT = Number(process.env.PORT ?? 8790);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const ENGINE_URL = (process.env.ENGINE_URL ?? "http://127.0.0.1:1349").replace(/\/$/, "");
const ENGINE_API_KEY = process.env.ENGINE_API_KEY ?? "";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 8 * 1024 * 1024);
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES ?? 1024 * 1024 * 1024);
const RETENTION_MS = Number(process.env.RETENTION_MS ?? 60 * 60 * 1000);
const ANON_DAILY_FILES = Number(process.env.ANON_DAILY_FILES ?? 25);
const ANON_DAILY_BYTES = Number(process.env.ANON_DAILY_BYTES ?? 200 * 1024 * 1024);
const ID_RE = /^[0-9a-f-]{36}$/;

// Per-IP daily quota (in-memory; resets on restart). Replaced by account
// credits once accounts are wired in.
const usage = new Map(); // ip -> { day, files, bytes }

function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || req.socket.remoteAddress || "unknown";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function quotaFor(ip) {
  const day = today();
  let u = usage.get(ip);
  if (!u || u.day !== day) {
    u = { day, files: 0, bytes: 0 };
    usage.set(ip, u);
  }
  return u;
}

function send(res, status, body, headers = {}) {
  const isJson = !(body instanceof Uint8Array) && typeof body !== "string";
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "content-type": isJson ? "application/json" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(Object.assign(new Error("invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function dirFor(id) {
  return join(DATA_DIR, id);
}

async function loadMeta(id) {
  if (!ID_RE.test(id)) throw Object.assign(new Error("bad id"), { status: 400 });
  try {
    return JSON.parse(await readFile(join(dirFor(id), "meta.json"), "utf8"));
  } catch {
    throw Object.assign(new Error("upload not found"), { status: 404 });
  }
}

async function handleInit(req, res) {
  const body = await readJson(req);
  const size = Number(body.size);
  const name = String(body.name ?? "file").slice(0, 200);
  if (!Number.isFinite(size) || size <= 0) return send(res, 400, { error: "size required" });
  if (size > MAX_FILE_BYTES) return send(res, 413, { error: "file too large", maxBytes: MAX_FILE_BYTES });

  const q = quotaFor(clientIp(req));
  if (q.files + 1 > ANON_DAILY_FILES || q.bytes + size > ANON_DAILY_BYTES) {
    return send(res, 429, { error: "daily limit reached", code: "quota_exceeded" });
  }
  q.files += 1;
  q.bytes += size;

  const id = randomUUID();
  const chunks = Math.max(1, Math.ceil(size / CHUNK_SIZE));
  await mkdir(dirFor(id), { recursive: true });
  await writeFile(
    join(dirFor(id), "meta.json"),
    JSON.stringify({ id, name, size, chunks, chunkSize: CHUNK_SIZE, createdAt: Date.now() }),
  );
  return send(res, 201, { id, chunkSize: CHUNK_SIZE, chunks });
}

async function handleChunk(req, res, id, n) {
  const meta = await loadMeta(id);
  if (!Number.isInteger(n) || n < 0 || n >= meta.chunks) {
    return send(res, 400, { error: "chunk index out of range" });
  }
  const expected = n === meta.chunks - 1 ? meta.size - meta.chunkSize * (meta.chunks - 1) : meta.chunkSize;
  const declared = Number(req.headers["content-length"]);
  if (declared !== expected) {
    return send(res, 400, { error: "chunk size mismatch", expected });
  }
  const target = join(dirFor(id), `chunk-${String(n).padStart(6, "0")}`);
  let received = 0;
  const counter = async function* (source) {
    for await (const piece of source) {
      received += piece.length;
      if (received > expected) throw Object.assign(new Error("too large"), { status: 400 });
      yield piece;
    }
  };
  await pipeline(counter(req), createWriteStream(target));
  if (received !== expected) {
    await rm(target, { force: true });
    return send(res, 400, { error: "short chunk", received, expected });
  }
  return send(res, 204, "");
}

async function assemble(id, meta) {
  const out = join(dirFor(id), "file");
  const ws = createWriteStream(out);
  for (let i = 0; i < meta.chunks; i++) {
    const part = join(dirFor(id), `chunk-${String(i).padStart(6, "0")}`);
    await pipeline(createReadStream(part), ws, { end: false });
  }
  ws.end();
  await new Promise((r) => ws.on("finish", r));
  const s = await stat(out);
  if (s.size !== meta.size) throw Object.assign(new Error("assembled size mismatch"), { status: 500 });
  return out;
}

async function handleComplete(res, id) {
  const meta = await loadMeta(id);
  for (let i = 0; i < meta.chunks; i++) {
    try {
      await stat(join(dirFor(id), `chunk-${String(i).padStart(6, "0")}`));
    } catch {
      return send(res, 409, { error: "missing chunk", index: i });
    }
  }
  await assemble(id, meta);
  return send(res, 200, { id, size: meta.size, name: meta.name });
}

async function handleRun(req, res, id, section, toolId) {
  const meta = await loadMeta(id);
  const file = join(dirFor(id), "file");
  try {
    await stat(file);
  } catch {
    return send(res, 409, { error: "upload not completed" });
  }
  if (!ENGINE_API_KEY) return send(res, 500, { error: "engine key not configured" });
  const body = await readJson(req, 256 * 1024);
  const settings = body.settings ?? {};

  const form = new FormData();
  form.append("file", new Blob([await readFile(file)]), meta.name);
  form.append("settings", JSON.stringify(settings));
  // The engine tracks live progress (SSE) under this id; keep it intact.
  if (typeof body.clientJobId === "string" && body.clientJobId.length <= 100) {
    form.append("clientJobId", body.clientJobId);
  }

  const upstream = await fetch(
    `${ENGINE_URL}/api/v1/tools/${encodeURIComponent(section)}/${encodeURIComponent(toolId)}`,
    { method: "POST", headers: { authorization: `Bearer ${ENGINE_API_KEY}` }, body: form },
  );
  const headers = {};
  for (const h of ["content-type", "content-disposition", "x-job-id"]) {
    const v = upstream.headers.get(h);
    if (v) headers[h] = v;
  }
  res.writeHead(upstream.status, { ...headers, "cache-control": "no-store" });
  if (upstream.body) {
    await pipeline(upstream.body, res);
  } else {
    res.end();
  }
}

async function sweep() {
  try {
    const now = Date.now();
    for (const name of await readdir(DATA_DIR)) {
      if (!ID_RE.test(name)) continue;
      const dir = join(DATA_DIR, name);
      try {
        const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
        if (now - meta.createdAt > RETENTION_MS) await rm(dir, { recursive: true, force: true });
      } catch {
        await rm(dir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.error("sweep failed", err);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const path = url.pathname;
    if (req.method === "GET" && path === "/health") return send(res, 200, { status: "ok", chunkSize: CHUNK_SIZE });
    if (req.method === "POST" && path === "/u/init") return await handleInit(req, res);

    let m = path.match(/^\/u\/([0-9a-f-]{36})\/(\d+)$/);
    if (req.method === "PUT" && m) return await handleChunk(req, res, m[1], Number(m[2]));

    m = path.match(/^\/u\/([0-9a-f-]{36})\/complete$/);
    if (req.method === "POST" && m) return await handleComplete(res, m[1]);

    m = path.match(/^\/u\/([0-9a-f-]{36})\/run\/([a-z-]+)\/([a-z0-9-]+)$/);
    if (req.method === "POST" && m) return await handleRun(req, res, m[1], m[2], m[3]);

    return send(res, 404, { error: "not found" });
  } catch (err) {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status >= 500 ? "internal error" : err.message });
    else res.end();
  }
});

await mkdir(DATA_DIR, { recursive: true });
setInterval(sweep, 10 * 60 * 1000).unref();
server.listen(PORT, "127.0.0.1", () => console.log(`upload-gateway on ${PORT}`));
