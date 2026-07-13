const STORAGE_KEY = 'chalkboard_device_token';
const NAME_STORAGE_KEY = 'chalkboard_tech_name';

export const getDeviceToken = (): string | null => localStorage.getItem(STORAGE_KEY);
export const getTechName = (): string | null => localStorage.getItem(NAME_STORAGE_KEY);

export const initialsOf = (name: string | null): string =>
  name
    ? name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    : '?';

async function redeemToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`/auth/redeem?token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(STORAGE_KEY, data.deviceToken);
      localStorage.setItem(NAME_STORAGE_KEY, data.techName);
      return true;
    }
  } catch (err) {
    console.error('Failed to redeem magic link:', err);
  }
  return false;
}

export async function redeemTokenFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    await redeemToken(token);
    // Strip the token from the URL either way so it doesn't linger in
    // browser history or get bookmarked.
    params.delete('token');
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
  }
}

// Handles the iOS home-screen case: a standalone PWA has its own storage
// context separate from Safari, so a magic link opened in regular Safari
// never reaches this app's localStorage. This lets a tech paste the same
// link (or just the raw token) directly into the app to redeem it there.
export async function redeemTokenFromPastedInput(input: string): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed) return false;

  let token = trimmed;
  try {
    const url = new URL(trimmed);
    token = url.searchParams.get('token') ?? trimmed;
  } catch {
    // Not a full URL -- treat the whole pasted string as the raw token.
  }

  return redeemToken(token);
}