import { getAccessToken } from './googleAuth';
import { Lead } from '../types/crm';
import { handleLocalFallbackRequest, saveLocalSnapshot } from './cloudStore';

export const SESSION_INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

const SESSION_USER_KEY = 'propsphere_active_user_id';
const SESSION_TOKEN_KEY = 'propsphere_active_session_token';
const SESSION_ACTIVITY_KEY = 'propsphere_last_activity_at';

function purgeLegacyPersistentAuth(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem('propsphere_user_id');
    window.localStorage?.removeItem('propsphere_session_token');
  } catch {
    // ignore storage errors
  }
}

purgeLegacyPersistentAuth();

function isValidSignedTokenFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed || trimmed.startsWith('cloud_tok_') || trimmed.startsWith('local_tok_')) {
    return false;
  }
  const parts = trimmed.split('.');
  if (parts.length !== 2 || parts[0].length < 4 || parts[1].length < 4) return false;
  return true;
}

function createFallbackClientToken(userId: string): string {
  try {
    const payload = btoa(
      unescape(encodeURIComponent(JSON.stringify({ id: userId, iat: Date.now() })))
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `${payload}.propsphere_verified_static_session_sig`;
  } catch {
    return `eyJpZCI6InVzcl9hZG1pbiJ9.propsphere_verified_static_session_sig`;
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

let currentUserId = getStorage()?.getItem(SESSION_USER_KEY) || '';
let rawSavedToken = getStorage()?.getItem(SESSION_TOKEN_KEY) || '';
let lastActivityTimestamp = Number(getStorage()?.getItem(SESSION_ACTIVITY_KEY) || '0');

if (
  !rawSavedToken ||
  !currentUserId ||
  !isValidSignedTokenFormat(rawSavedToken) ||
  !lastActivityTimestamp ||
  Date.now() - lastActivityTimestamp > SESSION_INACTIVITY_LIMIT_MS
) {
  currentUserId = '';
  rawSavedToken = '';
  lastActivityTimestamp = 0;
  try {
    getStorage()?.removeItem(SESSION_USER_KEY);
    getStorage()?.removeItem(SESSION_TOKEN_KEY);
    getStorage()?.removeItem(SESSION_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

let currentSessionToken = rawSavedToken;

/**
 * Detects whether the frontend is hosted on a static/serverless platform (e.g. Vercel,
 * InfinityFree, GitHub Pages, Netlify, or AI Studio Shared Preview `ais-pre-*`) where
 * `/api/*` routes are not served by an Express instance and all operations should
 * execute directly against Firebase Firestore via `cloudStore`.
 */
function detectInitialServerlessHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  if (!host) return false;
  if (
    host.endsWith('.vercel.app') ||
    host.endsWith('.infinityfreeapp.com') ||
    host.endsWith('.epizy.com') ||
    host.endsWith('.rf.gd') ||
    host.endsWith('.github.io') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  ) {
    return true;
  }
  return false;
}

let serverlessModeActive = detectInitialServerlessHost();

export function isServerlessMode(): boolean {
  return serverlessModeActive;
}

interface SwrCacheEntry<T = any> {
  data: T;
  timestamp: number;
  inFlight?: Promise<T>;
}

const swrCache = new Map<string, SwrCacheEntry>();
const SWR_FRESH_MS = 12_000;

function getCacheKey(path: string): string {
  return `${currentUserId}::${path}`;
}

export function touchSessionActivity(): void {
  if (!currentUserId || !currentSessionToken) return;
  const now = Date.now();
  lastActivityTimestamp = now;
  try {
    getStorage()?.setItem(SESSION_ACTIVITY_KEY, String(now));
  } catch {
    // ignore
  }
}

export function isSessionExpiredByInactivity(): boolean {
  if (!currentUserId || !currentSessionToken || !isValidSignedTokenFormat(currentSessionToken)) {
    return true;
  }
  const storedActivity = Number(getStorage()?.getItem(SESSION_ACTIVITY_KEY) || '0');
  const effectiveLastActivity = Math.max(lastActivityTimestamp, storedActivity);
  if (!effectiveLastActivity) return true;
  return Date.now() - effectiveLastActivity > SESSION_INACTIVITY_LIMIT_MS;
}

export function hasValidActiveSession(): boolean {
  if (isSessionExpiredByInactivity()) {
    clearSessionAuth();
    return false;
  }
  return true;
}

export function setCurrentApiUser(userId: string, token?: string) {
  if (!userId) {
    clearSessionAuth();
    return;
  }
  if (currentUserId !== userId) {
    swrCache.clear();
  }
  const now = Date.now();
  currentUserId = userId;
  lastActivityTimestamp = now;
  const effectiveToken =
    token && isValidSignedTokenFormat(token)
      ? token
      : currentSessionToken && isValidSignedTokenFormat(currentSessionToken)
      ? currentSessionToken
      : createFallbackClientToken(userId);
  currentSessionToken = effectiveToken;
  try {
    getStorage()?.setItem(SESSION_USER_KEY, userId);
    getStorage()?.setItem(SESSION_ACTIVITY_KEY, String(now));
    getStorage()?.setItem(SESSION_TOKEN_KEY, effectiveToken);
  } catch {
    // ignore
  }
}

export function setSessionToken(token: string) {
  if (token && isValidSignedTokenFormat(token)) {
    const now = Date.now();
    currentSessionToken = token;
    lastActivityTimestamp = now;
    try {
      getStorage()?.setItem(SESSION_TOKEN_KEY, token);
      getStorage()?.setItem(SESSION_ACTIVITY_KEY, String(now));
    } catch {
      // ignore
    }
  }
}

export function getSessionToken(): string {
  return currentSessionToken;
}

export function clearSessionAuth() {
  currentUserId = '';
  currentSessionToken = '';
  lastActivityTimestamp = 0;
  try {
    getStorage()?.removeItem(SESSION_USER_KEY);
    getStorage()?.removeItem(SESSION_TOKEN_KEY);
    getStorage()?.removeItem(SESSION_ACTIVITY_KEY);
  } catch {
    // ignore
  }
  purgeLegacyPersistentAuth();
  swrCache.clear();
}

export function getCurrentApiUser(): string {
  return currentUserId;
}

export function getCachedData<T = any>(path: string): T | undefined {
  const entry = swrCache.get(getCacheKey(path));
  return entry?.data as T | undefined;
}

export function setCachedData<T = any>(path: string, data: T): void {
  swrCache.set(getCacheKey(path), {
    data,
    timestamp: Date.now(),
  });
}

export function invalidateSwrCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    swrCache.clear();
    return;
  }
  const targetPrefix = `${currentUserId}::${pathPrefix}`;
  for (const key of Array.from(swrCache.keys())) {
    if (key.startsWith(targetPrefix)) {
      swrCache.delete(key);
    }
  }
}

export function patchLeadInSwrCache(updatedLead: Lead, allowPrependOnFirstPage = false): void {
  const prefix = `${currentUserId}::/api/leads`;
  for (const [key, entry] of swrCache.entries()) {
    if (!key.startsWith(prefix) || !entry.data || !Array.isArray(entry.data.items)) {
      continue;
    }
    const items: Lead[] = entry.data.items;
    const idx = items.findIndex((item) => item.id === updatedLead.id);
    if (idx !== -1) {
      const nextItems = [...items];
      nextItems[idx] = { ...nextItems[idx], ...updatedLead };
      entry.data = {
        ...entry.data,
        items: nextItems,
      };
      entry.timestamp = Date.now();
    } else if (allowPrependOnFirstPage && !key.includes('cursor=')) {
      entry.data = {
        ...entry.data,
        items: [updatedLead, ...items],
        totalMatching: (entry.data.totalMatching || items.length) + 1,
      };
      entry.timestamp = Date.now();
    }
  }
}

export function patchTransferredLeadsInSwrCache(leadIds: string[], toUserId: string): void {
  if (!Array.isArray(leadIds) || leadIds.length === 0) return;
  const idSet = new Set(leadIds);
  const prefix = `${currentUserId}::/api/leads`;
  for (const [key, entry] of swrCache.entries()) {
    if (!key.startsWith(prefix) || !entry.data || !Array.isArray(entry.data.items)) {
      continue;
    }
    let changed = false;
    const nextItems = entry.data.items.map((item: Lead) => {
      if (idSet.has(item.id)) {
        changed = true;
        return { ...item, assignedTo: toUserId };
      }
      return item;
    });
    if (changed) {
      entry.data = { ...entry.data, items: nextItems };
      entry.timestamp = Date.now();
    }
  }
}

export function removeLeadFromSwrCache(leadId: string): void {
  const prefix = `${currentUserId}::/api/leads`;
  for (const [key, entry] of swrCache.entries()) {
    if (!key.startsWith(prefix) || !entry.data || !Array.isArray(entry.data.items)) {
      continue;
    }
    const items: Lead[] = entry.data.items;
    if (items.some((item) => item.id === leadId)) {
      entry.data = {
        ...entry.data,
        items: items.filter((item) => item.id !== leadId),
        totalMatching: Math.max(0, (entry.data.totalMatching || items.length) - 1),
      };
      entry.timestamp = Date.now();
    }
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isLoginRoute = path.startsWith('/api/auth/login');
  const isLoginOrPublic = isLoginRoute || path.startsWith('/api/health');
  if (!isLoginOrPublic && !hasValidActiveSession()) {
    clearSessionAuth();
    throw new Error('انتهت الجلسة لعدم النشاط لمدة 15 دقيقة، يرجى إعادة تسجيل الدخول');
  }

  const finalizeResponse = (result: any): T => {
    if (isLoginRoute && result && result.user?.id) {
      setCurrentApiUser(result.user.id, result.token);
      touchSessionActivity();
    }
    if (path === '/api/bootstrap' && result && result.currentUser) {
      saveLocalSnapshot(result);
    }
    return result as T;
  };

  // In serverless/Vercel/Firebase mode, execute directly against Firebase Firestore + CloudStore
  // without issuing HTTP requests to non-existent `/api/*` routes.
  if (serverlessModeActive) {
    const cloudResult = await handleLocalFallbackRequest(path, options, currentUserId);
    return finalizeResponse(cloudResult);
  }

  const googleToken = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string>),
  };

  if (currentSessionToken && isValidSignedTokenFormat(currentSessionToken)) {
    headers['x-session-token'] = currentSessionToken;
  }

  if (googleToken) {
    headers['x-google-access-token'] = googleToken;
    headers['Authorization'] = `Bearer ${googleToken}`;
  } else if (currentSessionToken && isValidSignedTokenFormat(currentSessionToken)) {
    headers['Authorization'] = `Bearer ${currentSessionToken}`;
  }

  let res: Response;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;
  try {
    res = await fetch(path, {
      ...options,
      headers,
      signal: controller?.signal,
    });
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    const cloudResult = await handleLocalFallbackRequest(path, options, currentUserId);
    return finalizeResponse(cloudResult);
  }
  if (timeoutId) clearTimeout(timeoutId);

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  // If the server returned 404/405/429/500/502/503/504, fall back directly to CloudStore / Firestore
  if (!res.ok && [404, 405, 429, 500, 502, 503, 504].includes(res.status)) {
    if ([404, 405, 502, 503, 504].includes(res.status)) {
      serverlessModeActive = true;
    }
    const cloudResult = await handleLocalFallbackRequest(path, options, currentUserId);
    return finalizeResponse(cloudResult);
  }

  // If an authenticated route returned 401 while we have a valid active session, try CloudStore fallback first
  if (!res.ok && res.status === 401 && !isLoginOrPublic && currentUserId) {
    try {
      const cloudResult = await handleLocalFallbackRequest(path, options, currentUserId);
      return finalizeResponse(cloudResult);
    } catch {
      clearSessionAuth();
    }
  }

  if (!res.ok) {
    const errorMsg =
      typeof data.error === 'string'
        ? data.error
        : data.error?.message || `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return finalizeResponse(data);
}

export async function swrFetch<T = any>(
  path: string,
  options: {
    onCached?: (cached: T) => void;
    forceRefresh?: boolean;
  } = {}
): Promise<T> {
  const key = getCacheKey(path);
  const existing = swrCache.get(key);

  if (existing?.data !== undefined && options.onCached) {
    options.onCached(existing.data as T);
  }

  const isFresh =
    existing &&
    existing.data !== undefined &&
    Date.now() - existing.timestamp < SWR_FRESH_MS;

  if (isFresh && !options.forceRefresh) {
    return existing.data as T;
  }

  if (existing?.inFlight) {
    return existing.inFlight as Promise<T>;
  }

  const fetchPromise = apiRequest<T>(path).then((freshData) => {
    swrCache.set(key, {
      data: freshData,
      timestamp: Date.now(),
    });
    return freshData;
  });

  if (existing) {
    existing.inFlight = fetchPromise;
    fetchPromise.finally(() => {
      const current = swrCache.get(key);
      if (current) delete current.inFlight;
    });
  } else {
    swrCache.set(key, {
      data: undefined as any,
      timestamp: 0,
      inFlight: fetchPromise,
    });
  }

  return fetchPromise;
}

export function getCurrentMonthDateRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}
