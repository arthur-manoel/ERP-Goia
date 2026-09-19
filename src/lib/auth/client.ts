"use client";

let refreshPromise: Promise<boolean> | null = null;
async function checkAndRefresh() {
  const current = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
  if (current.ok) return true;
  if (current.status !== 401) return false;
  const result = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  return result.ok;
}
// Uma rotação por vez, inclusive entre abas que suportam Web Locks.
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    const refresh = async (): Promise<boolean> => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return await navigator.locks.request("erp-session-refresh", checkAndRefresh);
      }
      return checkAndRefresh();
    };
    refreshPromise = refresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
export async function authFetch(input: string, init?: RequestInit) {
  const url = new URL(input, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
    throw new Error("authFetch aceita apenas APIs da mesma origem.");
  }
  const request = new Request(url, { ...init, credentials: "same-origin" });
  const retry = request.clone();
  const response = await fetch(request);
  if (response.status !== 401 || url.pathname.startsWith("/api/auth/")) return response;
  if (!await refreshSession()) return response;
  return fetch(retry);
}
