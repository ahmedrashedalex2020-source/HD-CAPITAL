import { getAccessToken } from './googleAuth';
import { Lead } from '../types/crm';
import { handleLocalFallbackRequest, saveLocalSnapshot } from './cloudStore';

function isValidSignedTokenFormat(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  if (token.startsWith('cloud_tok_') || token.startsWith('local_tok_')) return false;
  const parts = token.trim().split('.');
  return parts.length === 2 && parts[0].length > 10 && parts[1].length > 10;
}

let currentUserId = localStorage.getItem('propsphere_user_id') || 'usr_admin';
let rawSavedToken = localStorage.getItem('propsphere_session_token') || '';
if (rawSavedToken && !isValidSignedTokenFormat(rawSavedToken)) {
  localStorage.removeItem('propsphere_session_token');
  rawSavedToken = '';
}
let currentSessionToken = rawSavedToken;

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

export function setCurrentApiUser(userId: string, token?: string) {
  if (currentUserId !== userId) {
    currentUserId = userId;
    localStorage.setItem('propsphere_user_id', userId);
  }
  if (token && isValidSignedTokenFormat(token)) {
    currentSessionToken = token;
    localStorage.setItem('propsphere_session_token', token);
  }
}

export function setSessionToken(token: string) {
  if (token && isValidSignedTokenFormat(token)) {
    currentSessionToken = token;
    localStorage.setItem('propsphere_session_token', token);
  } else {
    currentSessionToken = '';
    localStorage.removeItem('propsphere_session_token');
  }
}

export function getSessionToken(): string {
  return currentSessionToken;
}

export function clearSessionAuth() {
  currentSessionToken = '';
  localStorage.removeItem('propsphere_session_token');
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
  try {
    res = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    return (await handleLocalFallbackRequest(path, options, currentUserId)) as T;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  // If the server returned a non-JSON 404/405/502 (e.g. static hosting / ais-pre preview), use the live snapshot engine
  if (!res.ok && !data.error && [404, 405, 502, 503, 504].includes(res.status)) {
    return (await handleLocalFallbackRequest(path, options, currentUserId)) as T;
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  if (path === '/api/bootstrap' && data && data.currentUser) {
    saveLocalSnapshot(data);
  }

  return data as T;
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
