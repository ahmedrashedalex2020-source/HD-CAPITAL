import { getAccessToken } from './googleAuth';
import { Lead } from '../types/crm';
import { handleLocalFallbackRequest, saveLocalSnapshot } from './cloudStore';

let currentUserId = localStorage.getItem('propsphere_user_id') || 'usr_admin';
let currentSessionToken = localStorage.getItem('propsphere_session_token') || '';

const REMOTE_BACKEND_URLS = [
  'https://ais-dev-q63kgi2aijebcyoq7vajhz-23209438678.europe-west2.run.app',
  'https://ais-pre-q63kgi2aijebcyoq7vajhz-23209438678.europe-west2.run.app',
];

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
  if (token) {
    currentSessionToken = token;
    localStorage.setItem('propsphere_session_token', token);
  }
}

export function setSessionToken(token: string) {
  currentSessionToken = token;
  if (token) {
    localStorage.setItem('propsphere_session_token', token);
  } else {
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

  if (currentSessionToken && !currentSessionToken.startsWith('local_tok_')) {
    headers['x-session-token'] = currentSessionToken;
  }

  if (googleToken) {
    headers['x-google-access-token'] = googleToken;
    headers['Authorization'] = `Bearer ${googleToken}`;
  } else if (currentSessionToken && !currentSessionToken.startsWith('local_tok_')) {
    headers['Authorization'] = `Bearer ${currentSessionToken}`;
  }

  // Try current origin first; if on external static host or if 404/401 occurs across instances, try remote backend URLs
  const candidateUrls: string[] = [path];
  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    REMOTE_BACKEND_URLS.forEach((base) => {
      if (base !== currentOrigin) {
        candidateUrls.push(`${base}${path}`);
      }
    });
  }

  let lastStatus = 0;
  let lastErrorMsg = '';

  for (const targetUrl of candidateUrls) {
    try {
      const res = await fetch(targetUrl, {
        ...options,
        headers,
      });

      lastStatus = res.status;
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await res.json().catch(() => ({})) : {};

      if (res.ok && isJson) {
        if (path === '/api/bootstrap') {
          saveLocalSnapshot(data);
        }
        return data as T;
      }

      if (data?.error) {
        lastErrorMsg = data.error;
      }

      // If it's a validation error (400, 403, 409) on the primary server, stop and report it immediately
      if (res.status === 400 || res.status === 403 || res.status === 409) {
        break;
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || '';
    }
  }

  // If all HTTP endpoints returned 404 or network failure (e.g. static hosting), use instantaneous local fallback
  if (lastStatus === 404 || lastStatus === 0 || lastStatus >= 500) {
    return handleLocalFallbackRequest(path, options, currentUserId) as T;
  }

  throw new Error(lastErrorMsg || `Request failed with status ${lastStatus}`);
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
