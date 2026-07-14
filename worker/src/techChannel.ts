// Holds a live WebSocket per tech, keyed by the tech's exact name (same
// identity model as the rest of this app -- see CLAUDE.md's "Identity is
// the tech's name" note). crs-dispatch pushes a "refresh" message here (via
// index.ts's /internal/notify route) the moment it saves a change that
// matters to that tech, so an already-open tab updates without the tech
// touching anything. Uses the WebSocket Hibernation API so the DO doesn't
// stay pinned (and billed) in memory while a socket just sits idle.
export class TechChannel {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Plain POST forwarded from index.ts's /internal/notify route.
    const body = await request.json().catch(() => ({}) as { reason?: string });
    const reason = (body as { reason?: string })?.reason ?? null;
    const sockets = this.state.getWebSockets();
    const message = JSON.stringify({ type: 'refresh', reason });
    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch {
        // Socket already closed/broken -- the client reconnects on its own
        // and does a catch-up refetch, so a dropped push here is harmless.
      }
    }
    return new Response(JSON.stringify({ ok: true, delivered: sockets.length }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // Push-only channel -- the client never needs to send anything back.
  async webSocketMessage() {}
  async webSocketClose() {}
  async webSocketError() {}
}
