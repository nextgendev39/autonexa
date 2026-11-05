/**
 * fetch for server-side Supabase clients that gives up after `ms`, so a stalled
 * connection fails the request instead of holding it open. Keeps any caller signal.
 */
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}
