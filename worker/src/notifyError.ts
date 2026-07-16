// Emails an error alert via Resend whenever a route handler catches an
// exception -- see CLAUDE.md's "Task: Error visibility for field techs".
// Fire-and-forget in spirit (mirrors notifyDispatch.ts's pattern of being
// awaited inline but never throwing outward): a failure here must never
// break the response the caller is already sending back.
//
// Dedup is best-effort and per-isolate only (plain in-memory Map, no
// KV/DO) -- a burst of the same error within DEDUPE_WINDOW_MS sends once,
// but a fresh isolate (cold start, different edge PoP) won't know about an
// alert another isolate already sent. Acceptable here: worst case is an
// occasional duplicate email, never a missed one.
const sentAt = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export async function reportError(
  env: any,
  message: string,
  opts: { stack?: string; context?: string } = {}
): Promise<void> {
  if (!env?.RESEND_API_KEY || !env?.ERROR_ALERT_TO) return;

  const key = `${opts.context ?? ''}:${message}`;
  const now = Date.now();
  const last = sentAt.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  sentAt.set(key, now);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'onboarding@resend.dev',
        to: env.ERROR_ALERT_TO,
        subject: `[Chalkboard error] ${opts.context ? opts.context + ': ' : ''}${message}`.slice(0, 200),
        text: [
          `Context: ${opts.context ?? '(none)'}`,
          `Message: ${message}`,
          '',
          opts.stack ?? '(no stack trace)',
          '',
          `Time: ${new Date().toISOString()}`,
        ].join('\n'),
      }),
    });
    if (!res.ok) console.error('[reportError] Resend send failed', res.status, await res.text());
  } catch (err) {
    console.error('[reportError] failed to send alert', (err as Error).message);
  }
}