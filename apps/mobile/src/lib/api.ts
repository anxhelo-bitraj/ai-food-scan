// PATH: apps/mobile/src/lib/api.ts

// src/lib/api.ts
// NOTE: Do NOT default to localhost. On a real device that breaks and causes placeholder UI.
const RAW = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();
export const API_URL = RAW.replace(/\/$/, "");

if (!API_URL) {
  console.warn(
    "[api] Missing EXPO_PUBLIC_API_URL. Set it to your backend base URL (e.g. https://xxxx.trycloudflare.com)."
  );
} else {
  console.log("[api] API_URL =", API_URL);
}

function assertApiUrl() {
  if (!API_URL) {
    throw new Error(
      "Missing EXPO_PUBLIC_API_URL. Set it to your backend base URL (e.g. https://xxxx.trycloudflare.com)."
    );
  }
}

function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  assertApiUrl();
  const url = joinUrl(API_URL, path);

  console.log("[api] REQUEST", (init.method || "GET"), url);

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url} :: ${txt.slice(0, 300)}`);
    }
    return res;
  } catch (e) {
    console.warn("[api] FETCH_ERROR", String(e), "@", url);
    throw e;
  }
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  return (await res.json()) as T;
}

// -----------------------------
// Backwards-compatible helpers
// Many screens expect: api.get("/products/..")
// -----------------------------
export async function get<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  return await apiJson<T>(path, { ...init, method: "GET" });
}

export async function postJson<T = any>(
  path: string,
  body: any,
  init: RequestInit = {}
): Promise<T> {
  return await apiJson<T>(path, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

// -----------------------------
// AI Recognize (multipart upload)
// POST /ai/recognize?k=5 (form field name: "image")
// -----------------------------

export type AiRecognizeMatch = {
  code: string; // barcode
  product_name?: string;
  main_category?: string;
  image_file?: string;
  distance?: number;
  i?: number;
};

export type AiRecognizeResponse = {
  ok: boolean;
  k: number;
  results: AiRecognizeMatch[];
};

export async function aiRecognizeImage(uri: string, k = 5): Promise<AiRecognizeResponse> {
  assertApiUrl();

  // joinUrl expects a path like "/ai/recognize?..."
  const url = joinUrl(API_URL, `/ai/recognize?k=${k}`);

  const form = new FormData();
  form.append(
    "image",
    {
      uri,
      name: "capture.jpg",
      type: "image/jpeg",
    } as any
  );

  const res = await fetch(url, {
    method: "POST",
    // IMPORTANT: do NOT set Content-Type for multipart in React Native
    headers: { Accept: "application/json" },
    body: form,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, raw: text };
  }

  if (!res.ok) {
    throw new Error(`aiRecognizeImage failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return data as AiRecognizeResponse;
}

