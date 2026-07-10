const STORAGE_KEY = 'chalkboard_device_token';
const NAME_STORAGE_KEY = 'chalkboard_tech_name';

export const getDeviceToken = (): string | null => localStorage.getItem(STORAGE_KEY);
export const getTechName = (): string | null => localStorage.getItem(NAME_STORAGE_KEY);

export const initialsOf = (name: string | null): string =>
  name
    ? name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    : '?';

export async function redeemTokenFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    try {
      const res = await fetch(`/auth/redeem?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(STORAGE_KEY, data.deviceToken);
        localStorage.setItem(NAME_STORAGE_KEY, data.techName);
      }
    } catch (err) {
      console.error('Failed to redeem magic link:', err);
    }
    // Strip the token from the URL either way so it doesn't linger in
    // browser history or get bookmarked.
    params.delete('token');
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
  }
}
