import { getDeviceToken } from './auth';

export const api = (path: string, init: RequestInit = {}) =>
  fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${getDeviceToken() ?? ''}`, 'Content-Type': 'application/json', ...init.headers },
  });
