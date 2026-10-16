import { localizeData, tServer } from './i18n.js';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(tServer(message));
    this.status = status;
    this.fields = Object.fromEntries(Object.entries(details?.fields ?? {}).map(([k, v]) => [k, tServer(v)]));
  }
}

export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      window.dispatchEvent(new Event('avm:unauthorized'));
    }
    throw new ApiError(res.status, data?.error || res.statusText || 'Request failed', data?.details);
  }
  if (method !== 'GET') window.dispatchEvent(new Event('avm:changed'));
  return localizeData(data);
}

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path, params) => request('DELETE', path + qs(params)),
};
