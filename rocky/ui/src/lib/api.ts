/** Backend base URL. In dev Vite proxies /api → :6070; in production the
 *  Tauri webview has no proxy so we call the loopback server directly. */
export const API_BASE = import.meta.env.DEV ? '' : 'http://127.0.0.1:6070'

/** Build a full URL for a backend endpoint. Accepts `/api/...` paths. */
export const api = (path: string) => `${API_BASE}${path}`
