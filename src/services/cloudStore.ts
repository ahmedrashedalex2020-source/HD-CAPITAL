export const DEFAULT_PROJECTS = [
  'Palm Hills New Cairo',
  'Mountain View iCity',
  'ZED East Ora',
  'Marassi North Coast',
  'Il Bosco New Capital',
  'Solare Ras El Hekma',
];

const SNAPSHOT_KEY = 'propsphere_workspace_backup_v2';

export function saveLocalSnapshot(bootstrapData: any): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(bootstrapData));
  } catch {
    // ignore storage errors
  }
}

export function loadLocalSnapshot(): any {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

export function handleLocalFallbackRequest(
  path: string,
  options: RequestInit,
  currentUserId: string
): any {
  const snap = loadLocalSnapshot() || {
    roles: [],
    users: [],
    leads: [],
    properties: [],
    deals: [],
    events: [],
    sheetConnections: [],
    syncLogs: [],
    notifications: [],
    projects: DEFAULT_PROJECTS,
  };

  const method = (options.method || 'GET').toUpperCase();
  const body =
    options.body && typeof options.body === 'string'
      ? (() => {
          try {
            return JSON.parse(options.body as string);
          } catch {
            return {};
          }
        })()
      : {};
  const urlObj = new URL(path, 'http://localhost');
  const pathname = urlObj.pathname;

  if (pathname === '/api/auth/login' && method === 'POST') {
    const cleanUser = String(body.username || '').trim().toLowerCase();
    const user =
      (snap.users || []).find(
        (u: any) => String(u.username || '').toLowerCase() === cleanUser
      ) || snap.currentUser;
    if (!user) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    const role =
      (snap.roles || []).find((r: any) => r.id === user.roleId) || snap.currentRole;
    return {
      token: `local_tok_${user.id}`,
      user,
      role,
    };
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const user =
      (snap.users || []).find((u: any) => u.id === currentUserId) ||
      snap.currentUser ||
      (snap.users || [])[0];
    const role =
      (snap.roles || []).find((r: any) => r.id === user?.roleId) ||
      snap.currentRole ||
      (snap.roles || [])[0];
    return {
      ...snap,
      currentUser: user,
      currentRole: role,
    };
  }

  if (pathname === '/api/leads' && method === 'GET') {
    const items = snap.leads || [];
    return urlObj.search
      ? { items, nextCursor: null, hasMore: false, totalMatching: items.length }
      : items;
  }

  if (pathname === '/api/deals' && method === 'GET') {
    const items = snap.deals || [];
    return urlObj.search
      ? {
          items,
          nextCursor: null,
          hasMore: false,
          totalMatching: items.length,
          summary: { totalCount: items.length, totalPipelineValue: 0, wonDealsValue: 0 },
        }
      : items;
  }

  if (pathname === '/api/events' && method === 'GET') {
    const items = snap.events || [];
    return urlObj.search
      ? { items, nextCursor: null, hasMore: false, totalMatching: items.length }
      : items;
  }

  return { ok: true };
}
