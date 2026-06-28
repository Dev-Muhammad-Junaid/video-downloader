// Shared client for our JSON API routes. Replaces the repeated
//   const res = await fetch(path, ...);
//   const data = await res.json();
//   if (!res.ok) throw new Error(data.error || ...);
// boilerplate with one typed helper that throws a useful Error on failure.
//
// Adopt incrementally: existing raw fetch calls keep working; new/refactored
// code should use these. Not for non-JSON responses (blobs, text, streams) —
// keep raw fetch there.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
        const msg =
            (data && (data.error || data.details)) ||
            res.statusText ||
            `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data as T;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
    get:   <T = unknown>(path: string) => request<T>(path),
    post:  <T = unknown>(path: string, body?: unknown) => request<T>(path, jsonInit("POST", body)),
    patch: <T = unknown>(path: string, body?: unknown) => request<T>(path, jsonInit("PATCH", body)),
    del:   <T = unknown>(path: string, body?: unknown) => request<T>(path, jsonInit("DELETE", body)),
};

/** Low-level escape hatch when you need custom init but still want the
 *  parse + throw-on-error behaviour. */
export const apiFetch = request;
