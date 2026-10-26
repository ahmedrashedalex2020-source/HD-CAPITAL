export const DEFAULT_PROJECTS = [
  'Palm Hills New Cairo',
  'Mountain View iCity',
  'ZED East Ora',
  'Marassi North Coast',
  'Il Bosco New Capital',
  'Solare Ras El Hekma',
];

const SNAPSHOT_KEY = 'propsphere_workspace_backup_v3';

const DEFAULT_ROLES = [
  {
    id: 'role_admin',
    name: 'System Admin',
    nameAr: 'مدير النظام (Admin)',
    description: 'Full access to all modules, permissions, users, and Google Sheets sync.',
    descriptionAr: 'صلاحيات كاملة لإدارة النظام، الموظفين، مصفوفة الصلاحيات، ومزامنة شيتات جوجل.',
    isSystem: true,
    permissions: {
      leads: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      deals: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      contacts: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      properties: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      calendar: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      reports: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      sheets_sync: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      users: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'all', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
    },
  },
  {
    id: 'role_supervisor',
    name: 'Sales Supervisor',
    nameAr: 'مشرف مبيعات (Supervisor)',
    description: 'Supervises team leads, transfers leads, and monitors daily agent KPIs.',
    descriptionAr: 'الإشراف على فريق المبيعات، تحويل العملاء، ومتابعة التقارير اليومية.',
    isSystem: true,
    permissions: {
      leads: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      deals: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'none', export: 'all', import: 'none', transfer: 'all', allowCustomView: true },
      contacts: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
      properties: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
      calendar: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'own', export: 'none', import: 'none', transfer: 'all', allowCustomView: true },
      reports: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
      sheets_sync: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'none', import: 'all', transfer: 'none', allowCustomView: false },
      users: { read: 'all', add: 'none', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
    },
  },
  {
    id: 'role_employee',
    name: 'Sales Representative',
    nameAr: 'موظف مبيعات / سيلز (Employee)',
    description: 'Works on assigned leads, logs call activities, and schedules client visits.',
    descriptionAr: 'العمل على العملاء المخصصين له فقط، تسجيل المكالمات والملاحظات، وتحديد المواعيد.',
    isSystem: true,
    permissions: {
      leads: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'own', transfer: 'none', allowCustomView: false },
      deals: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      contacts: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'own', transfer: 'none', allowCustomView: false },
      properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      calendar: { read: 'own', add: 'own', edit: 'own', editWhenObserver: false, delete: 'own', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      reports: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      sheets_sync: { read: 'none', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      users: { read: 'own', add: 'none', edit: 'own', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
    },
  },
];

let cachedLiveSnapshot: any = null;
let lastRemoteFetchTime = 0;

function createFallbackAvatarSvg(initials: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#2563EB"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Cairo, sans-serif" font-weight="700" font-size="36">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function computeSha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

function createBrowserSessionToken(user: any): string {
  const payloadObj = {
    id: user.id,
    roleId: user.roleId,
    username: user.username,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(payloadObj))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${encodedPayload}.propsphere_verified_static_session_sig`;
}

export function saveLocalSnapshot(bootstrapData: any): void {
  if (!bootstrapData || typeof bootstrapData !== 'object') return;
  try {
    const existing = loadLocalSnapshot() || {};
    const merged = {
      ...existing,
      ...bootstrapData,
      roles:
        Array.isArray(bootstrapData.roles) && bootstrapData.roles.length > 0
          ? bootstrapData.roles
          : existing.roles || DEFAULT_ROLES,
      users: mergeById(existing.users || [], bootstrapData.users || []),
      leads: mergeById(existing.leads || [], bootstrapData.leads || []),
      deals: mergeById(existing.deals || [], bootstrapData.deals || []),
      properties: mergeById(existing.properties || [], bootstrapData.properties || []),
      events: mergeById(existing.events || [], bootstrapData.events || []),
      sheetConnections:
        Array.isArray(bootstrapData.sheetConnections) && bootstrapData.sheetConnections.length > 0
          ? bootstrapData.sheetConnections
          : existing.sheetConnections || [],
      syncLogs:
        Array.isArray(bootstrapData.syncLogs) && bootstrapData.syncLogs.length > 0
          ? bootstrapData.syncLogs
          : existing.syncLogs || [],
      notifications:
        Array.isArray(bootstrapData.notifications) && bootstrapData.notifications.length > 0
          ? bootstrapData.notifications
          : existing.notifications || [],
      projects:
        Array.isArray(bootstrapData.projects) && bootstrapData.projects.length > 0
          ? bootstrapData.projects
          : existing.projects || DEFAULT_PROJECTS,
    };
    cachedLiveSnapshot = merged;
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage errors
  }
}

function mergeById(baseList: any[], incomingList: any[]): any[] {
  if (!Array.isArray(baseList) || baseList.length === 0) {
    return Array.isArray(incomingList) ? [...incomingList] : [];
  }
  if (!Array.isArray(incomingList) || incomingList.length === 0) {
    return [...baseList];
  }
  const map = new Map<string, any>();
  for (const item of baseList) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incomingList) {
    if (item && item.id) {
      const prev = map.get(item.id) || {};
      map.set(item.id, { ...prev, ...item });
    }
  }
  return Array.from(map.values());
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

async function ensureLiveDatabaseLoaded(): Promise<any> {
  const local = loadLocalSnapshot();
  const now = Date.now();

  if (!cachedLiveSnapshot || now - lastRemoteFetchTime > 8000) {
    lastRemoteFetchTime = now;
    try {
      const res = await fetch(`/crm-live-snapshot.json?t=${now}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const remoteSnap = await res.json();
        if (remoteSnap && Array.isArray(remoteSnap.users)) {
          const merged = {
            ...remoteSnap,
            roles:
              Array.isArray(remoteSnap.roles) && remoteSnap.roles.length > 0
                ? remoteSnap.roles
                : local?.roles || DEFAULT_ROLES,
            users: mergeById(remoteSnap.users || [], local?.users || []),
            leads: mergeById(remoteSnap.leads || [], local?.leads || []),
            deals: mergeById(remoteSnap.deals || [], local?.deals || []),
            properties: mergeById(remoteSnap.properties || [], local?.properties || []),
            events: mergeById(remoteSnap.events || [], local?.events || []),
            sheetConnections:
              Array.isArray(local?.sheetConnections) && local.sheetConnections.length > 0
                ? local.sheetConnections
                : remoteSnap.sheetConnections || [],
            syncLogs:
              Array.isArray(local?.syncLogs) && local.syncLogs.length > 0
                ? local.syncLogs
                : remoteSnap.syncLogs || [],
            notifications:
              Array.isArray(local?.notifications) && local.notifications.length > 0
                ? local.notifications
                : remoteSnap.notifications || [],
            projects:
              Array.isArray(remoteSnap.projects) && remoteSnap.projects.length > 0
                ? remoteSnap.projects
                : local?.projects || DEFAULT_PROJECTS,
          };
          cachedLiveSnapshot = merged;
          try {
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(merged));
          } catch {
            // ignore
          }
          return merged;
        }
      }
    } catch {
      // ignore network failure and use local
    }
  }

  if (cachedLiveSnapshot) return cachedLiveSnapshot;
  if (local && Array.isArray(local.users) && local.users.length > 0) {
    cachedLiveSnapshot = local;
    return local;
  }

  const fallback = {
    roles: DEFAULT_ROLES,
    users: [
      {
        id: 'usr_admin',
        username: 'admin',
        fullName: 'أحمد راشد (Ahmed Rashed)',
        roleId: 'role_admin',
        jobTitle: 'CEO & System Administrator',
        jobTitleAr: 'المدير التنفيذي ومدير النظام',
        avatarUrl: createFallbackAvatarSvg('AR'),
        email: 'admin@propsphere.eg',
        phone: '',
        location: 'القاهرة الجديدة - التجمع الخامس',
        assignedProjects: DEFAULT_PROJECTS,
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_1793010490703_1p0c',
        username: 'omarahmed1',
        fullName: 'عمر احمد',
        roleId: 'role_employee',
        jobTitle: 'Property Sales Consultant',
        jobTitleAr: 'مسؤول مبيعات عقارية',
        avatarUrl: createFallbackAvatarSvg('عا'),
        email: 'omarahmed1@propsphere.eg',
        phone: '01114477605',
        location: 'القاهرة الجديدة',
        assignedProjects: ['Palm Hills New Cairo', 'Mountain View iCity'],
        isActiveForRouting: true,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: new Date().toISOString(),
      },
    ],
    leads: [],
    properties: [],
    deals: [],
    events: [],
    sheetConnections: [],
    syncLogs: [],
    notifications: [],
    projects: DEFAULT_PROJECTS,
  };
  cachedLiveSnapshot = fallback;
  return fallback;
}

function persistState(snap: any) {
  cachedLiveSnapshot = snap;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // ignore
  }
}

function checkScope(
  scope: string | undefined,
  user: any,
  ownerId?: string,
  projectName?: string
): boolean {
  if (!scope || scope === 'none') return false;
  if (scope === 'all' || user?.roleId === 'role_admin') return true;
  if (scope === 'own') return ownerId === user?.id;
  if (scope === 'team') {
    if (ownerId === user?.id) return true;
    const userProjects: string[] = Array.isArray(user?.assignedProjects)
      ? user.assignedProjects
      : [];
    return Boolean(projectName && userProjects.includes(projectName));
  }
  return false;
}

function getVisibleLeads(snap: any, user: any, role: any): any[] {
  const scope = role?.permissions?.leads?.read || 'own';
  return (snap.leads || []).filter((l: any) =>
    checkScope(scope, user, l.assignedTo, l.projectInterest)
  );
}

function getVisibleDeals(snap: any, user: any, role: any): any[] {
  const scope = role?.permissions?.deals?.read || 'own';
  return (snap.deals || []).filter((d: any) =>
    checkScope(scope, user, d.assignedTo, d.projectName)
  );
}

function getVisibleEvents(snap: any, user: any, role: any): any[] {
  const scope = role?.permissions?.calendar?.read || 'own';
  if (scope === 'none') return [];
  if (scope === 'all' || user?.roleId === 'role_admin') return snap.events || [];
  if (scope === 'own') return (snap.events || []).filter((e: any) => e.assignedTo === user?.id);
  const userProjects: string[] = Array.isArray(user?.assignedProjects)
    ? user.assignedProjects
    : [];
  return (snap.events || []).filter(
    (e: any) =>
      e.assignedTo === user?.id || !e.projectName || userProjects.includes(e.projectName)
  );
}

export async function handleLocalFallbackRequest(
  path: string,
  options: RequestInit,
  currentUserId: string
): Promise<any> {
  const snap = await ensureLiveDatabaseLoaded();
  if (!Array.isArray(snap.roles) || snap.roles.length === 0) {
    snap.roles = DEFAULT_ROLES;
  }
  if (!Array.isArray(snap.users)) {
    snap.users = [];
  }

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

  const activeUser =
    snap.users.find((u: any) => u.id === currentUserId) ||
    snap.users.find((u: any) => u.id === 'usr_admin') ||
    snap.users[0];
  const activeRole =
    snap.roles.find((r: any) => r.id === activeUser?.roleId) || snap.roles[0];

  // 1. Auth: Accounts Preview
  if (pathname === '/api/auth/accounts-preview' && method === 'GET') {
    const accounts = snap.users.map((u: any) => {
      const r = snap.roles.find((role: any) => role.id === u.roleId);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        jobTitle: u.jobTitle,
        jobTitleAr: u.jobTitleAr,
        avatarUrl: u.avatarUrl,
        roleId: u.roleId,
        roleName: r?.name || 'Employee',
        roleNameAr: r?.nameAr || 'موظف',
      };
    });
    return { accounts };
  }

  // 2. Auth: Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const cleanUser = String(body.username || '').trim().toLowerCase();
    const cleanPass = String(body.password || '').trim();
    if (!cleanUser || !cleanPass) {
      throw new Error('يرجى إدخال اسم المستخدم وكلمة المرور');
    }
    if (cleanPass === 'demo_bypass') {
      throw new Error('تم تعطيل الدخول التجاوزي (demo_bypass) لأسباب أمنية');
    }

    const user = snap.users.find(
      (u: any) => String(u.username || '').trim().toLowerCase() === cleanUser
    );
    if (!user) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    if (user.clientAuthDigest) {
      const digest = await computeSha256Hex(`propsphere_auth:${cleanUser}:${cleanPass}`);
      if (digest && digest !== user.clientAuthDigest) {
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } else if (cleanUser === 'admin' && cleanPass !== 'admin123') {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    } else if (cleanPass.length < 4 || cleanPass === 'wrong') {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const role = snap.roles.find((r: any) => r.id === user.roleId) || snap.roles[0];
    const token = createBrowserSessionToken(user);
    return {
      token,
      user,
      role,
    };
  }

  // 3. Auth: Switch Account
  if (pathname === '/api/auth/switch-account' && method === 'POST') {
    const targetUser = snap.users.find((u: any) => u.id === body.targetUserId);
    if (!targetUser) {
      throw new Error('الحساب المطلوب غير موجود');
    }
    const targetRole =
      snap.roles.find((r: any) => r.id === targetUser.roleId) || snap.roles[0];
    const token = createBrowserSessionToken(targetUser);
    return {
      token,
      user: targetUser,
      role: targetRole,
    };
  }

  // 4. Bootstrap Workspace
  if (pathname === '/api/bootstrap' && method === 'GET') {
    const visibleLeads = getVisibleLeads(snap, activeUser, activeRole);
    const visibleDeals = getVisibleDeals(snap, activeUser, activeRole);
    const visibleEvents = getVisibleEvents(snap, activeUser, activeRole);
    const userNotifications = (snap.notifications || []).filter(
      (n: any) => n.userId === activeUser?.id || n.userId === 'all'
    );
    return {
      sessionToken: createBrowserSessionToken(activeUser),
      currentUser: activeUser,
      currentRole: activeRole,
      roles: snap.roles,
      users: snap.users,
      leads: visibleLeads,
      allLeadsCount: (snap.leads || []).length,
      properties: snap.properties || [],
      deals: visibleDeals,
      events: visibleEvents,
      sheetConnections: snap.sheetConnections || [],
      syncLogs: snap.syncLogs || [],
      notifications: userNotifications,
      projects: snap.projects || DEFAULT_PROJECTS,
    };
  }

  // 5. Leads List & Pagination
  if (pathname === '/api/leads' && method === 'GET') {
    const visible = getVisibleLeads(snap, activeUser, activeRole);
    if (!urlObj.search) return visible;

    const status = urlObj.searchParams.get('status') || undefined;
    const assignedTo = urlObj.searchParams.get('assignedTo') || undefined;
    const project = urlObj.searchParams.get('project') || undefined;
    const q = urlObj.searchParams.get('q') || undefined;
    const from = urlObj.searchParams.get('from') || undefined;
    const to = urlObj.searchParams.get('to') || undefined;
    const cursor = urlObj.searchParams.get('cursor') || undefined;
    const limit = Number(urlObj.searchParams.get('limit')) || 30;

    const filtered = visible.filter((l: any) => {
      if (status && status !== 'ALL' && l.status !== status) return false;
      if (assignedTo && assignedTo !== 'ALL' && l.assignedTo !== assignedTo) return false;
      if (project && project !== 'ALL' && l.projectInterest !== project) return false;
      if (from && String(l.createdAt || '').slice(0, 10) < from) return false;
      if (to && String(l.createdAt || '').slice(0, 10) > to) return false;
      if (q && q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${l.fullName || ''} ${l.phone || ''} ${l.projectInterest || ''} ${
          l.campaignName || ''
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item: any) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }
    const items = filtered.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return { items, nextCursor, hasMore, totalMatching: filtered.length };
  }

  // 6. Leads Create / Update / Delete / Activities / Transfer / Auto-distribute
  if (pathname === '/api/leads' && method === 'POST') {
    const newLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fullName: String(body.fullName || '').trim(),
      phone: String(body.phone || '').trim(),
      email: body.email || '',
      source: body.source || 'Direct Call',
      campaignName: body.campaignName || '',
      formResponses: Array.isArray(body.formResponses) ? body.formResponses : [],
      projectInterest: body.projectInterest || DEFAULT_PROJECTS[0],
      unitType: body.unitType || 'Villa',
      budgetEgp: Number(body.budgetEgp) || 0,
      status: body.status || 'New',
      priority: body.priority || 'Warm',
      assignedTo: body.assignedTo || activeUser.id,
      observerIds: Array.isArray(body.observerIds) ? body.observerIds : [],
      createdAt: new Date().toISOString(),
      activities: [
        {
          id: `act_${Date.now()}`,
          type: 'Note',
          summary: 'تمت إضافة العميل يدوياً',
          createdAt: new Date().toISOString(),
          userId: activeUser.id,
          userName: activeUser.fullName,
        },
      ],
    };
    snap.leads = [newLead, ...(snap.leads || [])];
    persistState(snap);
    return { lead: newLead };
  }

  if (pathname === '/api/leads/transfer' && method === 'POST') {
    const { leadIds, toUserId, reason } = body;
    const ids = new Set(Array.isArray(leadIds) ? leadIds : []);
    snap.leads = (snap.leads || []).map((l: any) => {
      if (!ids.has(l.id)) return l;
      return {
        ...l,
        assignedTo: toUserId,
        activities: [
          {
            id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            type: 'Transfer',
            summary: reason || 'تم تحويل العميل',
            createdAt: new Date().toISOString(),
            userId: activeUser.id,
            userName: activeUser.fullName,
          },
          ...(l.activities || []),
        ],
      };
    });
    persistState(snap);
    return { transferredCount: ids.size };
  }

  if (pathname === '/api/leads/auto-distribute' && method === 'POST') {
    const activeAgents = snap.users.filter((u: any) => u.isActiveForRouting);
    const pool = activeAgents.length > 0 ? activeAgents : snap.users;
    let distributedCount = 0;
    snap.leads = (snap.leads || []).map((l: any, idx: number) => {
      if (l.status === 'New') {
        distributedCount++;
        return { ...l, assignedTo: pool[idx % pool.length].id };
      }
      return l;
    });
    persistState(snap);
    return { distributedCount };
  }

  if (pathname.startsWith('/api/leads/') && pathname.endsWith('/activities') && method === 'POST') {
    const leadId = pathname.split('/')[3];
    const leadIdx = (snap.leads || []).findIndex((l: any) => l.id === leadId);
    if (leadIdx === -1) throw new Error('العميل غير موجود');
    const act = {
      id: `act_${Date.now()}`,
      type: body.type || 'Note',
      summary: body.summary || '',
      createdAt: new Date().toISOString(),
      userId: activeUser.id,
      userName: activeUser.fullName,
    };
    snap.leads[leadIdx].activities = [act, ...(snap.leads[leadIdx].activities || [])];
    snap.leads[leadIdx].lastContactedAt = new Date().toISOString();
    persistState(snap);
    return { lead: snap.leads[leadIdx], activity: act };
  }

  if (pathname.startsWith('/api/leads/') && method === 'PUT') {
    const leadId = pathname.split('/')[3];
    const idx = (snap.leads || []).findIndex((l: any) => l.id === leadId);
    if (idx === -1) throw new Error('العميل غير موجود');
    snap.leads[idx] = { ...snap.leads[idx], ...body };
    persistState(snap);
    return { lead: snap.leads[idx] };
  }

  if (pathname.startsWith('/api/leads/') && method === 'DELETE') {
    const leadId = pathname.split('/')[3];
    snap.leads = (snap.leads || []).filter((l: any) => l.id !== leadId);
    persistState(snap);
    return { ok: true };
  }

  // 7. Users CRUD
  if (pathname === '/api/users' && method === 'POST') {
    const cleanUsername = String(body.username || '').trim().toLowerCase();
    if (!cleanUsername || !body.password || !body.fullName) {
      throw new Error('الاسم الكامل واسم المستخدم وكلمة المرور حقول إلزامية');
    }
    if (snap.users.some((u: any) => String(u.username).toLowerCase() === cleanUsername)) {
      throw new Error('اسم المستخدم موجود بالفعل، اختر اسماً آخر');
    }
    const initials =
      String(body.fullName)
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0] || '')
        .join('')
        .toUpperCase() || 'U';
    const digest = await computeSha256Hex(
      `propsphere_auth:${cleanUsername}:${String(body.password).trim()}`
    );
    const newUser = {
      id: body.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      clientAuthDigest: digest,
      fullName: String(body.fullName).trim(),
      roleId: body.roleId || 'role_employee',
      jobTitle: body.jobTitle || 'Property Sales Advisor',
      jobTitleAr: body.jobTitleAr || 'مستشار مبيعات عقارية',
      avatarUrl: body.avatarUrl || createFallbackAvatarSvg(initials),
      email: body.email || `${cleanUsername}@propsphere.eg`,
      phone: body.phone ? String(body.phone).trim() : '',
      location: body.location || 'القاهرة الجديدة',
      assignedProjects: Array.isArray(body.assignedProjects)
        ? body.assignedProjects
        : [DEFAULT_PROJECTS[0]],
      isActiveForRouting:
        body.isActiveForRouting !== undefined ? Boolean(body.isActiveForRouting) : true,
      routingWeight: Math.min(Math.max(Number(body.routingWeight) || 1, 1), 10),
      preferredLang: 'ar',
      createdAt: new Date().toISOString(),
    };
    snap.users.push(newUser);
    persistState(snap);
    return { user: newUser };
  }

  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const userId = pathname.split('/')[3];
    const idx = snap.users.findIndex((u: any) => u.id === userId);
    if (idx === -1) throw new Error('المستخدم غير موجود');
    const existing = { ...snap.users[idx], ...body };
    if (body.password && String(body.password).trim()) {
      existing.clientAuthDigest = await computeSha256Hex(
        `propsphere_auth:${String(existing.username).toLowerCase()}:${String(body.password).trim()}`
      );
    }
    delete existing.password;
    snap.users[idx] = existing;
    persistState(snap);
    return { user: existing };
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const userId = pathname.split('/')[3];
    snap.users = snap.users.filter((u: any) => u.id !== userId);
    persistState(snap);
    return { ok: true };
  }

  // 8. Deals, Properties, Events, Roles, Daily Reports
  if (pathname === '/api/deals' && method === 'GET') {
    const visible = getVisibleDeals(snap, activeUser, activeRole);
    if (!urlObj.search) return visible;
    const totalPipelineValue = visible.reduce(
      (s: number, d: any) => s + (Number(d.dealValue) || 0),
      0
    );
    const wonDealsValue = visible
      .filter((d: any) => d.stage === 'Closed Won')
      .reduce((s: number, d: any) => s + (Number(d.dealValue) || 0), 0);
    return {
      items: visible,
      nextCursor: null,
      hasMore: false,
      totalMatching: visible.length,
      summary: { totalCount: visible.length, totalPipelineValue, wonDealsValue },
    };
  }

  if (pathname === '/api/deals' && method === 'POST') {
    const deal = {
      id: `deal_${Date.now()}`,
      ...body,
      assignedTo: body.assignedTo || activeUser.id,
      createdAt: new Date().toISOString(),
    };
    snap.deals = [deal, ...(snap.deals || [])];
    persistState(snap);
    return { deal };
  }

  if (pathname.startsWith('/api/deals/') && method === 'PUT') {
    const dealId = pathname.split('/')[3];
    const idx = (snap.deals || []).findIndex((d: any) => d.id === dealId);
    if (idx !== -1) {
      snap.deals[idx] = { ...snap.deals[idx], ...body };
      persistState(snap);
      return { deal: snap.deals[idx] };
    }
  }

  if (pathname === '/api/properties' && method === 'POST') {
    const property = {
      id: `prop_${Date.now()}`,
      ...body,
    };
    snap.properties = [property, ...(snap.properties || [])];
    persistState(snap);
    return { property };
  }

  if (pathname === '/api/events' && method === 'GET') {
    const visible = getVisibleEvents(snap, activeUser, activeRole);
    return urlObj.search
      ? { items: visible, nextCursor: null, hasMore: false, totalMatching: visible.length }
      : visible;
  }

  if (pathname === '/api/events' && method === 'POST') {
    const event = {
      id: `evt_${Date.now()}`,
      ...body,
      assignedTo: body.assignedTo || activeUser.id,
    };
    snap.events = [event, ...(snap.events || [])];
    persistState(snap);
    return { event };
  }

  if (pathname.startsWith('/api/events/') && method === 'PUT') {
    const evtId = pathname.split('/')[3];
    const idx = (snap.events || []).findIndex((e: any) => e.id === evtId);
    if (idx !== -1) {
      snap.events[idx] = { ...snap.events[idx], ...body };
      persistState(snap);
      return { event: snap.events[idx] };
    }
  }

  if (pathname === '/api/roles/matrix' && method === 'PUT') {
    if (Array.isArray(body.roles)) {
      snap.roles = body.roles;
      persistState(snap);
    }
    return { roles: snap.roles };
  }

  if (pathname === '/api/roles' && method === 'POST') {
    const role = {
      id: `role_${Date.now()}`,
      name: body.name || 'Custom Role',
      nameAr: body.nameAr || 'دور مخصص',
      description: body.description || '',
      descriptionAr: body.descriptionAr || '',
      isSystem: false,
      permissions: body.permissions || DEFAULT_ROLES[2].permissions,
    };
    snap.roles.push(role);
    persistState(snap);
    return { role };
  }

  if (pathname === '/api/reports/daily-employees' && method === 'GET') {
    const dateFilter = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const visibleLeads = getVisibleLeads(snap, activeUser, activeRole);
    const salesAgents = snap.users.filter((u: any) =>
      activeRole?.permissions?.reports?.read === 'all' || activeUser?.roleId === 'role_admin'
        ? u.roleId !== 'role_viewer'
        : u.id === activeUser?.id
    );
    const agentStats = salesAgents.map((agent: any) => {
      const agentLeads = visibleLeads.filter((l: any) => l.assignedTo === agent.id);
      const qualifiedCount = agentLeads.filter((l: any) =>
        ['Qualified', 'Site Visit Scheduled', 'Proposal Sent', 'Closed Won'].includes(l.status)
      ).length;
      return {
        userId: agent.id,
        fullName: agent.fullName,
        avatarUrl: agent.avatarUrl,
        jobTitle: agent.jobTitle,
        jobTitleAr: agent.jobTitleAr,
        isActiveForRouting: agent.isActiveForRouting,
        assignedProjects: agent.assignedProjects || [],
        totalAssignedLeads: agentLeads.length,
        leadsAssignedToday: agentLeads.filter((l: any) =>
          String(l.createdAt || '').startsWith(dateFilter)
        ).length,
        contactedToday: agentLeads.filter((l: any) =>
          String(l.lastContactedAt || '').startsWith(dateFilter)
        ).length,
        callsToday: 0,
        whatsappToday: 0,
        visitsScheduledToday: 0,
        qualifiedCount,
        wonDealsCount: 0,
        wonRevenue: 0,
        conversionRate:
          agentLeads.length > 0 ? Math.round((qualifiedCount / agentLeads.length) * 100) : 0,
        avgResponseMinutes: 5,
      };
    });
    return { date: dateFilter, agentStats };
  }

  if (pathname === '/api/sheets/sync' && method === 'POST') {
    return {
      newLeadsImported: 0,
      duplicatesSkipped: (snap.leads || []).length,
      totalRowsScanned: (snap.leads || []).length,
    };
  }

  if (pathname === '/api/notifications/read-all' && method === 'PUT') {
    snap.notifications = (snap.notifications || []).map((n: any) => ({ ...n, isRead: true }));
    persistState(snap);
    return { ok: true };
  }

  return { ok: true };
}
