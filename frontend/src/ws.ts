// Live push: crs-dispatch notifies crs-board the moment it changes
// something that affects a tech (approve/counter/deny, assignment
// create/edit/cancel), and crs-board pushes a "refresh" message down this
// socket so an already-open screen updates without the tech touching
// anything. See CLAUDE.md's "Live push to the tech app" section.
import { getDeviceToken } from './auth';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// Returns a cleanup function. Call once auth is established; the caller is
// responsible for tearing it down (e.g. on unmount).
export function connectLiveUpdates(onRefresh: () => void): () => void {
  let socket: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const scheduleReconnect = () => {
    if (stopped) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect() {
    if (stopped) return;
    const token = getDeviceToken();
    if (!token) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      reconnectAttempt = 0;
      console.log('[ws] connected');
      // Covers both the first connect and any reconnect after a gap (phone
      // waking from lock, a network blip) -- either way we may have missed
      // a push while not connected, so treat (re)connecting itself as a
      // signal to refetch once.
      onRefresh();
    };
    socket.onmessage = (event) => {
      console.log('[ws] message', event.data);
      try {
        const data = JSON.parse(event.data);
        if (data?.type === 'refresh') onRefresh();
      } catch {
        // Ignore malformed messages.
      }
    };
    socket.onclose = () => {
      console.log('[ws] closed, reconnecting');
      scheduleReconnect();
    };
    socket.onerror = () => socket?.close();
  }

  // Mobile Safari/PWA aggressively kills backgrounded WebSocket connections
  // -- reconnect as soon as the tab/app is foregrounded again rather than
  // waiting on the (possibly long) backoff timer from a background close.
  const handleWake = () => {
    if (document.visibilityState === 'visible' && (!socket || socket.readyState === WebSocket.CLOSED)) {
      reconnectAttempt = 0;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connect();
    }
  };

  connect();
  document.addEventListener('visibilitychange', handleWake);
  window.addEventListener('online', handleWake);

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    document.removeEventListener('visibilitychange', handleWake);
    window.removeEventListener('online', handleWake);
    socket?.close();
  };
}
