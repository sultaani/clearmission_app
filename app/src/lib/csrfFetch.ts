'use client';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
let installed = false;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Patches the global fetch once per page load so every existing `fetch(...)`
 * call across the app (there are dozens, one per page) automatically sends
 * the CSRF header without each one needing to be edited individually. Only
 * touches same-origin requests using a mutating method; GETs and
 * cross-origin requests pass through untouched.
 */
export function installCsrfFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isSameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);

    if (MUTATING_METHODS.has(method) && isSameOrigin) {
      const csrfToken = readCookie('csrf_token');
      if (csrfToken) {
        const headers = new Headers(init?.headers);
        headers.set('X-CSRF-Token', csrfToken);
        return originalFetch(input, { ...init, headers });
      }
    }
    return originalFetch(input, init);
  };
}
