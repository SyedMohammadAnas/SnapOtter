// Shared chunked uploader for the Konvertt upload gateway (/u/*).
//
// Large files are sent in fixed-size chunks so each request stays small
// (the Cloudflare proxy caps single bodies). Progress is reported per byte
// sent, so every tool can show a real upload bar and a loading state.

export interface UploadProgress {
  phase: "uploading" | "assembling";
  /** Bytes confirmed by the gateway so far. */
  loaded: number;
  total: number;
  /** 0-100, based on confirmed bytes. */
  percent: number;
}

export interface ChunkedUploadOptions {
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
  /** Parallel chunk requests. 3 keeps throughput up without flooding the tunnel. */
  concurrency?: number;
  /** Retries per chunk on network errors or 5xx. */
  retries?: number;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const GATEWAY = "/u";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code: string | undefined;
    let message = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // non-JSON error body: keep the generic message
    }
    throw new UploadError(message, res.status, code);
  }
  return (await res.json()) as T;
}

/** Send one chunk with XHR so the browser reports byte progress. */
function sendChunk(
  url: string,
  blob: Blob,
  signal: AbortSignal | undefined,
  onBytes: (sent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onBytes(e.loaded);
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onBytes(blob.size);
        resolve();
      } else {
        reject(new UploadError(`Chunk rejected (${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new UploadError("Network error while uploading", 0));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    xhr.send(blob);
  });
}

/**
 * Upload a file to the gateway. Resolves with the gateway upload id, which
 * is then passed to `runTool` (see `runUploadedTool`).
 */
export async function uploadFileChunked(
  file: File,
  opts: ChunkedUploadOptions = {},
): Promise<{ id: string; size: number }> {
  const { signal, onProgress, concurrency = 3, retries = 2 } = opts;

  const init = await fetch(`${GATEWAY}/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
    signal,
  });
  const { id, chunkSize, chunks } = await jsonOrThrow<{
    id: string;
    chunkSize: number;
    chunks: number;
  }>(init);

  const sentPerChunk = new Array<number>(chunks).fill(0);
  const report = () => {
    const loaded = sentPerChunk.reduce((a, b) => a + b, 0);
    onProgress?.({
      phase: "uploading",
      loaded,
      total: file.size,
      percent: file.size ? Math.min(100, Math.round((loaded / file.size) * 100)) : 100,
    });
  };
  report();

  const uploadOne = async (n: number) => {
    const start = n * chunkSize;
    const blob = file.slice(start, Math.min(file.size, start + chunkSize));
    for (let attempt = 0; ; attempt++) {
      try {
        await sendChunk(`${GATEWAY}/${id}/${n}`, blob, signal, (sent) => {
          sentPerChunk[n] = sent;
          report();
        });
        return;
      } catch (err) {
        const retriable = err instanceof UploadError && (err.status === 0 || err.status >= 500);
        if (!retriable || attempt >= retries || signal?.aborted) throw err;
        sentPerChunk[n] = 0;
        report();
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  };

  // Simple worker pool: `concurrency` chunks in flight at a time.
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, chunks) }, async () => {
    while (next < chunks) {
      const n = next++;
      await uploadOne(n);
    }
  });
  await Promise.all(workers);

  onProgress?.({ phase: "assembling", loaded: file.size, total: file.size, percent: 100 });
  const done = await fetch(`${GATEWAY}/${id}/complete`, { method: "POST", signal });
  await jsonOrThrow(done);
  return { id, size: file.size };
}
