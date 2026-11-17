// Drop-in replacement for `fetch` on tool POSTs that carry a FormData body.
//
// Uses XHR so the browser reports real upload bytes, and publishes them to a
// small store that <UploadProgressBar /> renders. Any other request is passed
// straight to `fetch`, so callers can swap it in without behaviour changes.

import { useSyncExternalStore } from "react";

export interface ActiveUpload {
  id: number;
  /** "uploading" while bytes are leaving the browser, "processing" after. */
  phase: "uploading" | "processing";
  /** 0-100 for the upload phase. */
  percent: number;
}

let active: ActiveUpload[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: ActiveUpload[]) {
  active = next;
  for (const l of listeners) l();
}

function update(id: number, patch: Partial<ActiveUpload>) {
  publish(active.map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

function remove(id: number) {
  publish(active.filter((u) => u.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveUploads(): ActiveUpload[] {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => active,
  );
}

function headersToObject(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

// Live previews and inspect/analyze calls fire while the user edits; showing
// a bar for each would flicker, so only real runs get the global indicator.
const QUIET_PATH = /\/(preview|analyze|inspect)(\/|$|\?)/;

export function uploadFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!(init.body instanceof FormData) || QUIET_PATH.test(input)) {
    return fetch(input, init);
  }
  const signal = init.signal ?? undefined;
  const method = (init.method ?? "POST").toUpperCase();

  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = nextId++;
    publish([...active, { id, phase: "uploading", percent: 0 }]);

    const xhr = new XMLHttpRequest();
    xhr.open(method, input);
    xhr.responseType = "arraybuffer";
    for (const [k, v] of Object.entries(headersToObject(init.headers))) {
      xhr.setRequestHeader(k, v);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      remove(id);
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        update(id, { percent: Math.min(100, Math.round((e.loaded / e.total) * 100)) });
      }
    };
    xhr.upload.onload = () => update(id, { phase: "processing", percent: 100 });

    xhr.onload = () => {
      finish();
      const headers = new Headers();
      xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/)
        .forEach((line) => {
          const idx = line.indexOf(":");
          if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
        });
      const nullBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
      resolve(
        new Response(nullBody ? null : (xhr.response as ArrayBuffer), {
          status: xhr.status,
          statusText: xhr.statusText,
          headers,
        }),
      );
    };
    xhr.onerror = () => {
      finish();
      reject(new TypeError("Failed to fetch"));
    };
    xhr.onabort = () => {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.send(init.body as XMLHttpRequestBodyInit);
  });
}
