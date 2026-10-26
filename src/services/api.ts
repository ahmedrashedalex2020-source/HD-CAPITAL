import { getAccessToken } from './googleAuth';
import { Lead } from '../types/crm';
import {
  handleCloudFallbackRequest,
  recordEmployeeInCloud,
  syncBootstrapWithCloud,
  loadCloudWorkspaceState,
} from './cloudStore';

let currentUserId = localStorage.getItem('propsphere_user_id') || 'usr_admin';
let currentSessionToken = localStorage.getItem('propsphere_session_token') || '';
const recentCredentialsMap: Record<string, string> = {};

const CLOUD_BACKEND_URLS = [
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

  if (currentSessionToken && !currentSessionToken.startsWith('cloud_tok_')) {
    headers['x-session-token'] = currentSessionToken;
  }

  if (googleToken) {
    headers['x-google-access-token'] = googleToken;
    headers['Authorization'] = `Bearer ${googleToken}`;
  } else if (currentSessionToken && !currentSessionToken.startsWith('cloud_tok_')) {
    headers['Authorization'] = `Bearer ${currentSessionToken}`;
  }

  const method = (options.method || 'GET').toUpperCase();
  const parsedBody =
    options.body && typeof options.body === 'string'
      ? (() => {
          try {
            return JSON.parse(options.body as string);
          } catch {
            return {};
          }
        })()
      : {};

  // Build candidate URLs: local relative path first, then cloud backend URLs if hosted on external static host
  const candidateUrls = [path];
  if (
    typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.endsWith('.run.app')
  ) {
    CLOUD_BACKEND_URLS.forEach((base) => candidateUrls.push(`${base}${path}`));
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
        // Sync newly created or updated employees with Cloud Firestore so mobile devices can log in immediately
        if (path === '/api/users' && method === 'POST' && data.user) {
          if (parsedBody.username && parsedBody.password) {
            recentCredentialsMap[String(parsedBody.username).toLowerCase()] = String(
              parsedBody.password
            );
          }
          await recordEmployeeInCloud(data.user, parsedBody.password);
        } else if (path.startsWith('/api/users/') && method === 'PUT' && data.user) {
          await recordEmployeeInCloud(data.user, parsedBody.password);
        } else if (path === '/api/bootstrap' && method === 'GET') {
          const synced = await syncBootstrapWithCloud(data, recentCredentialsMap);
          return synced as T;
        } else if (path === '/api/auth/accounts-preview' && method === 'GET') {
          const cloud = await loadCloudWorkspaceState();
          const map = new Map<string, any>();
          (data.accounts || []).forEach((a: any) => map.set(a.username.toLowerCase(), a));
          (cloud.users || []).forEach((u: any) => {
            const key = String(u.username || '').toLowerCase();
            if (!map.has(key)) {
              const role = (cloud.roles || []).find((r: any) => r.id === u.roleId);
              map.set(key, {
                id: u.id,
                username: u.username,
                fullName: u.fullName,
                jobTitle: u.jobTitle,
                jobTitleAr: u.jobTitleAr,
                avatarUrl: u.avatarUrl,
                roleId: u.roleId,
                roleName: role?.name || 'Employee',
                roleNameAr: role?.nameAr || 'موظف',
              });
            }
          });
          return { accounts: Array.from(map.values()) } as T;
        }
        return data as T;
      }

      // If user was created on another device/container and server returned 401/404 on login or switch-account, check Cloud Firestore!
      if (
        (path === '/api/auth/login' || path === '/api/auth/switch-account') &&
        (res.status === 401 || res.status === 404)
      ) {
        try {
          const cloudAuth = await handleCloudFallbackRequest(path, options, currentUserId);
          // Also auto-provision this employee onto the current server instance in the background!
          if (cloudAuth?.user && parsedBody.password) {
            fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...cloudAuth.user,
                password: parsedBody.password,
              }),
            }).catch(() => {});
          }
          return cloudAuth as T;
        } catch (cloudErr: any) {
          lastErrorMsg = data.error || cloudErr.message;
        }
      } else if (data.error) {
        lastErrorMsg = data.error;
        // If it's a real application validation error (400, 403, 409), break and throw it
        if (res.status !== 404 && res.status !== 502 && res.status !== 503) {
          break;
        }
      }
    } catch (netErr: any) {
      lastErrorMsg = netErr.message || '';
    }
  }

  // If the server returned 404 (e.g., static hosting on InfinityFree / GitHub Pages or cross-instance user) or network error, resolve via Cloud Firestore!
  if (lastStatus === 404 || lastStatus === 0 || lastStatus >= 500) {
    const cloudResult = await handleCloudFallbackRequest(path, options, currentUserId);
    return cloudResult as T;
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
