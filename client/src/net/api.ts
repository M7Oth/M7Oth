// REST client for the game server. VITE_SERVER_URL lets the static client (Vercel/Netlify) talk to a separately hosted server.
const BASE: string = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function serverBase() { return BASE || window.location.origin; }
export function wsUrl(token: string) {
  const b = serverBase().replace(/^http/, 'ws');
  return `${b}/ws?token=${encodeURIComponent(token)}`;
}

export function getToken() { try { return localStorage.getItem('fls.token'); } catch { return null; } }
export function setToken(t: string | null) { try { if (t) localStorage.setItem('fls.token', t); else localStorage.removeItem('fls.token'); } catch { /* ignore */ } }

export class ApiError extends Error { constructor(public status: number, public l10n: { ar: string; en: string }) { super(l10n.en); } }

export async function api<T = any>(path: string, method = 'GET', body?: any): Promise<T> {
  const tok = getToken();
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { ar: 'تعذر الاتصال بالخادم', en: 'Could not reach the server' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error ?? { ar: 'خطأ', en: 'Error' });
  return data as T;
}

export async function serverAvailable() {
  try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2500) }); return r.ok; } catch { return false; }
}
