export type FetchJsonResult = {
  ok: boolean;
  status: number;
  json: any;
  text: string;
};

/**
 * Fetch with abort after `ms`. Use for blob/stream responses (e.g. PDF export).
 * Returns the Response; caller must read body (e.g. res.blob(), res.json()).
 */
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 15000
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fail-closed fetch helper:
 * - Aborts after `ms`
 * - Always returns a structured result (even for non-JSON / HTML error bodies)
 */
export async function fetchJsonWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 15000
): Promise<FetchJsonResult> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON body (e.g., HTML error page)
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(id);
  }
}

