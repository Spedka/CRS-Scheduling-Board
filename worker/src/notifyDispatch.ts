// Pushes a live "refresh" to crs-dispatch's warehouse TV calendar the
// moment a tech creates/counters/edits/withdraws a schedule request --
// mirrors crs-dispatch's own notifyBoard.js (which does the same thing in
// the other direction for the tech app) almost exactly. Fire-and-forget: a
// delivery failure here must never break the caller's own successful
// Salesforce write.
export async function notifyDispatchTv(env: any, reason: string): Promise<void> {
  if (!env.DISPATCH) return;
  try {
    // Path matters here -- has to match crs-dispatch's registered route
    // (POST /internal/tv-notify) exactly, not just hit some placeholder host.
    const res = await env.DISPATCH.fetch(new Request('https://dispatch/internal/tv-notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Internal-Secret': env.DISPATCH_TV_NOTIFY_SECRET },
      body: JSON.stringify({ reason }),
    }));
    console.log('[notifyDispatchTv]', reason, res.status);
  } catch (err) {
    console.error('[notifyDispatchTv] failed', reason, (err as Error).message);
  }
}
