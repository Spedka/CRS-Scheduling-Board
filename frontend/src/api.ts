import { getDeviceToken } from './auth';

// In-flight GET de-dup: several components can independently fire the same
// GET in the same tick (e.g. App.tsx's badge count and RequestsScreen's own
// list, both keyed off refreshKey bumping). Collapsing genuinely concurrent
// identical requests into one network call cuts subrequest volume with no
// staleness risk -- the map entry is cleared the instant the request
// settles, so anything fetched afterwards (e.g. right after a mutation)
// always goes to the network fresh, never a stale cached response. POSTs
// (mutations) are never deduped.
const inFlight = new Map<string, Promise<Response>>();

export const api = (path: string, init: RequestInit = {}) => {
  const doFetch = () => fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${getDeviceToken() ?? ''}`, 'Content-Type': 'application/json', ...init.headers },
  });

  if ((init.method ?? 'GET').toUpperCase() !== 'GET') return doFetch();

  let promise = inFlight.get(path);
  if (!promise) {
    promise = doFetch().finally(() => inFlight.delete(path));
    inFlight.set(path, promise);
  }
  // Each caller gets its own clone -- Response bodies can only be read once,
  // and every caller here (including whichever call actually triggered the
  // fetch) independently calls .json()/.text() on what it gets back.
  return promise.then((res) => res.clone());
};
