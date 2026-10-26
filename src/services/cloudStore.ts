import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const WORKSPACE_DOC_REF = doc(firestore, 'crm_state', 'workspace');

export const DEFAULT_PROJECTS = [
  'Palm Hills New Cairo',
  'Mountain View iCity',
  'ZED East Ora',
  'Marassi North Coast',
  'Il Bosco New Capital',
  'Solare Ras El Hekma',
];

function createAvatarSvg(initials: string, bgStart: string, bgEnd: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgStart}" />
        <stop offset="100%" stop-color="${bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="60" fill="url(#g)" />
    <circle cx="60" cy="44" r="20" fill="rgba(255,255,255,0.22)" />
    <path d="M24 106 C24 78, 96 78, 96 106" fill="rgba(255,255,255,0.22)" />
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Plus Jakarta Sans, Cairo, sans-serif" font-weight="700" font-size="34">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getDefaultCloudState() {
  const nowIso = new Date().toISOString();
  const roles = [
    {
      id: 'role_admin',
      name: 'Administrator',
      nameAr: 'مدير النظام (Admin)',
      description: 'Full control over all modules, permissions, users, and Google Sheets routing',
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
      name: 'Supervisor',
      nameAr: 'مشرف مبيعات (Supervisor)',
      description: 'Supervises sales team, views all leads & daily reports, and can transfer leads',
      isSystem: true,
      permissions: {
        leads: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'team', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        deals: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        contacts: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: true },
        properties: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
        calendar: { read: 'all', add: 'all', edit: 'all', editWhenObserver: true, delete: 'own', export: 'all', import: 'none', transfer: 'all', allowCustomView: true },
        reports: { read: 'all', add: 'all', edit: 'none', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: true },
        sheets_sync: { read: 'all', add: 'all', edit: 'all', editWhenObserver: false, delete: 'none', export: 'all', import: 'all', transfer: 'all', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'team', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
    {
      id: 'role_deputy',
      name: 'Deputy supervisor',
      nameAr: 'نائب المشرف (Deputy)',
      description: 'Assists supervisor with team items, pipeline follow-up, and lead routing',
      isSystem: true,
      permissions: {
        leads: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'team', transfer: 'team', allowCustomView: true },
        deals: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'none', transfer: 'team', allowCustomView: true },
        contacts: { read: 'team', add: 'team', edit: 'team', editWhenObserver: false, delete: 'none', export: 'team', import: 'team', transfer: 'none', allowCustomView: true },
        properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'all', import: 'none', transfer: 'none', allowCustomView: false },
        calendar: { read: 'team', add: 'team', edit: 'own', editWhenObserver: false, delete: 'own', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        reports: { read: 'team', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'team', import: 'none', transfer: 'none', allowCustomView: false },
        sheets_sync: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'all', transfer: 'none', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
    {
      id: 'role_employee',
      name: 'Employee',
      nameAr: 'مسؤول مبيعات (Sales)',
      description: 'Works on own assigned leads, logs calls & visits, and closes deals',
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
    {
      id: 'role_observer',
      name: 'Observer',
      nameAr: 'مراقب (Observer)',
      description: 'Read-only visibility into assigned items and analytics without mutation access',
      isSystem: true,
      permissions: {
        leads: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        deals: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        contacts: { read: 'own', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        properties: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        calendar: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        reports: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        sheets_sync: { read: 'none', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
        users: { read: 'all', add: 'none', edit: 'none', editWhenObserver: false, delete: 'none', export: 'none', import: 'none', transfer: 'none', allowCustomView: false },
      },
    },
  ];

  const users = [
    {
      id: 'usr_admin',
      username: 'admin',
      passwordPlain: 'admin123',
      fullName: 'أحمد راشد (Ahmed Rashed)',
      roleId: 'role_admin',
      jobTitle: 'CEO & System Administrator',
      jobTitleAr: 'المدير التنفيذي ومدير النظام',
      avatarUrl: createAvatarSvg('AR', '#1D4ED8', '#3B82F6'),
      email: 'ahmedrashedalex2020@gmail.com',
      phone: '',
      location: 'القاهرة الجديدة · التجمع الخامس',
      assignedProjects: [...DEFAULT_PROJECTS],
      isActiveForRouting: false,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-01-10T09:00:00.000Z',
    },
    {
      id: 'usr_supervisor',
      username: 'tarek',
      passwordPlain: '123456',
      fullName: 'طارق المنشاوي (Tarek El-Menshawy)',
      roleId: 'role_supervisor',
      jobTitle: 'Sales Team Director',
      jobTitleAr: 'مدير فريق المبيعات العقارية',
      avatarUrl: createAvatarSvg('TM', '#0F766E', '#14B8A6'),
      email: 'tarek.sales@propsphere.eg',
      phone: '',
      location: 'الشيخ زايد · الجيزة',
      assignedProjects: ['Palm Hills New Cairo', 'ZED East Ora', 'Marassi North Coast'],
      isActiveForRouting: true,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-02-01T10:00:00.000Z',
    },
    {
      id: 'usr_sales1',
      username: 'sara',
      passwordPlain: '123456',
      fullName: 'سارة جلال (Sara Galal)',
      roleId: 'role_employee',
      jobTitle: 'Senior Property Consultant',
      jobTitleAr: 'مستشار عقاري أول',
      avatarUrl: createAvatarSvg('SG', '#4F46E5', '#818CF8'),
      email: 'sara.galal@propsphere.eg',
      phone: '',
      location: 'القاهرة الجديدة',
      assignedProjects: ['Palm Hills New Cairo', 'Mountain View iCity', 'ZED East Ora'],
      isActiveForRouting: true,
      routingWeight: 2,
      preferredLang: 'ar',
      createdAt: '2026-02-15T10:00:00.000Z',
    },
    {
      id: 'usr_sales2',
      username: 'omar',
      passwordPlain: '123456',
      fullName: 'عمر الكيلاني (Omar El-Kilany)',
      roleId: 'role_employee',
      jobTitle: 'Luxury Property Advisor',
      jobTitleAr: 'مستشار عقارات فاخرة وساحلي',
      avatarUrl: createAvatarSvg('OK', '#0369A1', '#38BDF8'),
      email: 'omar.kilany@propsphere.eg',
      phone: '',
      location: 'الساحل الشمالي · العلمين',
      assignedProjects: ['Marassi North Coast', 'Solare Ras El Hekma', 'ZED East Ora'],
      isActiveForRouting: true,
      routingWeight: 2,
      preferredLang: 'ar',
      createdAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'usr_sales3',
      username: 'nour',
      passwordPlain: '123456',
      fullName: 'نور عبد الرحمن (Nour Abdelrahman)',
      roleId: 'role_employee',
      jobTitle: 'New Capital Specialist',
      jobTitleAr: 'مسؤولة مبيعات العاصمة الإدارية',
      avatarUrl: createAvatarSvg('NA', '#B45309', '#F59E0B'),
      email: 'nour.capital@propsphere.eg',
      phone: '',
      location: 'العاصمة الإدارية الجديدة',
      assignedProjects: ['Il Bosco New Capital', 'Mountain View iCity', 'Palm Hills New Cairo'],
      isActiveForRouting: true,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-03-12T10:00:00.000Z',
    },
    {
      id: 'usr_deputy',
      username: 'karim',
      passwordPlain: '123456',
      fullName: 'كريم الشافعي (Karim El-Shafei)',
      roleId: 'role_deputy',
      jobTitle: 'Deputy Sales Supervisor',
      jobTitleAr: 'نائب مشرف المبيعات',
      avatarUrl: createAvatarSvg('KS', '#7E22CE', '#A855F7'),
      email: 'karim.shafei@propsphere.eg',
      phone: '',
      location: 'التجمع الخامس',
      assignedProjects: ['Palm Hills New Cairo', 'Il Bosco New Capital'],
      isActiveForRouting: true,
      routingWeight: 1,
      preferredLang: 'ar',
      createdAt: '2026-03-20T10:00:00.000Z',
    },
  ];

  const sheetConnections = [
    {
      id: 'sheet_conn_1',
      name: 'CRM1 (المصدر الأساسي لبيانات العملاء - Google Drive)',
      driveFileName: 'CRM1',
      spreadsheetId: '',
      spreadsheetUrl: '',
      sheetTabName: 'CRM1',
      routingMode: 'project_then_round_robin',
      defaultProject: 'Palm Hills New Cairo',
      campaignTag: 'CRM1_GoogleDrive_Form',
      autoSyncEnabled: true,
      syncIntervalMinutes: 15,
      ignoreIdColumns: true,
      columnMapping: {
        fullName: 'الاسم',
        phone: 'رقم التليفون',
        email: 'email',
        projectInterest: 'المشروع المطلوب',
        campaignName: 'campaign_name',
        propertyType: 'ما هو نوع الوحدة المفضلة؟',
        budgetMax: 'ما هي الميزانية التقريبية أو المقدم المتاح؟',
        notes: 'ملاحظات إضافية',
      },
      lastSyncedAt: '',
      totalImportedCount: 0,
      createdAt: nowIso,
    },
  ];

  return {
    roles,
    users,
    leads: [] as any[],
    properties: [] as any[],
    deals: [] as any[],
    events: [] as any[],
    sheetConnections,
    syncLogs: [] as any[],
    notifications: [] as any[],
    projects: [...DEFAULT_PROJECTS],
    roundRobinCursor: 0,
  };
}

let cachedCloudState: any = null;

export async function loadCloudWorkspaceState(): Promise<any> {
  try {
    const snap = await getDoc(WORKSPACE_DOC_REF);
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.users) && Array.isArray(data.roles)) {
        cachedCloudState = data;
        localStorage.setItem('propsphere_workspace_backup', JSON.stringify(data));
        return data;
      }
    }
  } catch {
    // fallback to localStorage if offline
  }

  try {
    const localRaw = localStorage.getItem('propsphere_workspace_backup');
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && Array.isArray(parsed.users)) {
        cachedCloudState = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  if (!cachedCloudState) {
    cachedCloudState = getDefaultCloudState();
    await saveCloudWorkspaceState(cachedCloudState);
  }
  return cachedCloudState;
}

export async function saveCloudWorkspaceState(state: any): Promise<void> {
  cachedCloudState = state;
  try {
    localStorage.setItem('propsphere_workspace_backup', JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
  try {
    const clean = JSON.parse(JSON.stringify(state));
    await setDoc(WORKSPACE_DOC_REF, clean, { merge: true });
  } catch {
    // ignore transient offline error
  }
}

/**
 * Merges server bootstrap response with Cloud Firestore state so employees or leads
 * created on one device/instance are immediately available on all mobile/web devices.
 */
export async function syncBootstrapWithCloud(
  serverBootstrap: any,
  recentCredentialsMap: Record<string, string>
): Promise<any> {
  const cloud = await loadCloudWorkspaceState();
  let cloudChanged = false;

  // Merge users from server -> cloud and cloud -> server
  const userMap = new Map<string, any>();
  (cloud.users || []).forEach((u: any) => {
    userMap.set(u.username.toLowerCase(), u);
  });

  (serverBootstrap.users || []).forEach((su: any) => {
    const key = String(su.username || '').toLowerCase();
    const existing = userMap.get(key);
    const knownPass =
      recentCredentialsMap[key] ||
      existing?.passwordPlain ||
      (key === 'admin' ? 'admin123' : '123456');
    const mergedUser = {
      ...existing,
      ...su,
      passwordPlain: knownPass,
    };
    if (!existing) cloudChanged = true;
    userMap.set(key, mergedUser);
  });

  cloud.users = Array.from(userMap.values());

  // Merge leads by ID
  if (Array.isArray(serverBootstrap.leads) && serverBootstrap.leads.length > 0) {
    const leadMap = new Map<string, any>();
    (cloud.leads || []).forEach((l: any) => leadMap.set(l.id, l));
    serverBootstrap.leads.forEach((l: any) => {
      if (!leadMap.has(l.id)) cloudChanged = true;
      leadMap.set(l.id, l);
    });
    cloud.leads = Array.from(leadMap.values());
  }

  if (cloudChanged) {
    await saveCloudWorkspaceState(cloud);
  }

  return {
    ...serverBootstrap,
    users: cloud.users.map(({ passwordPlain: _pp, ...rest }: any) => rest),
  };
}

export async function recordEmployeeInCloud(userObj: any, plainPassword?: string) {
  const cloud = await loadCloudWorkspaceState();
  const cleanUsername = String(userObj.username || '').trim().toLowerCase();
  const idx = (cloud.users || []).findIndex(
    (u: any) => u.id === userObj.id || String(u.username || '').toLowerCase() === cleanUsername
  );
  const record = {
    ...(idx !== -1 ? cloud.users[idx] : {}),
    ...userObj,
    username: cleanUsername,
    passwordPlain:
      plainPassword && plainPassword.trim()
        ? plainPassword.trim()
        : idx !== -1
        ? cloud.users[idx].passwordPlain
        : '123456',
  };
  if (idx !== -1) {
    cloud.users[idx] = record;
  } else {
    cloud.users.push(record);
  }
  await saveCloudWorkspaceState(cloud);
}

/**
 * Complete Cloud/Serverless API Handler used whenever the mobile or static web host
 * returns 404 or when an employee created on another device logs in on mobile.
 */
export async function handleCloudFallbackRequest(
  path: string,
  options: RequestInit,
  currentUserId: string
): Promise<any> {
  const state = await loadCloudWorkspaceState();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const urlObj = new URL(path, 'http://localhost');
  const pathname = urlObj.pathname;

  const currentUser =
    state.users.find((u: any) => u.id === currentUserId) || state.users[0];
  const currentRole =
    state.roles.find((r: any) => r.id === currentUser?.roleId) || state.roles[0];

  // 1. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const cleanUser = String(body.username || '').trim().toLowerCase();
    const pass = String(body.password || '').trim();
    const user = state.users.find(
      (u: any) => String(u.username || '').toLowerCase() === cleanUser
    );
    if (!user) {
      throw new Error('اسم المستخدم غير مسجل في النظام');
    }
    const expectedPass =
      user.passwordPlain || (cleanUser === 'admin' ? 'admin123' : '123456');
    if (pass !== expectedPass) {
      throw new Error('كلمة المرور غير صحيحة');
    }
    const role = state.roles.find((r: any) => r.id === user.roleId) || state.roles[0];
    const { passwordPlain: _pp, ...safeUser } = user;
    return {
      token: `cloud_tok_${user.id}_${Date.now()}`,
      user: safeUser,
      role,
    };
  }

  // 2. Accounts Preview
  if (pathname === '/api/auth/accounts-preview' && method === 'GET') {
    const accounts = state.users.map((u: any) => {
      const role = state.roles.find((r: any) => r.id === u.roleId);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        jobTitle: u.jobTitle,
        jobTitleAr: u.jobTitleAr,
        avatarUrl: u.avatarUrl,
        roleId: u.roleId,
        roleName: role?.name || 'Employee',
        roleNameAr: role?.nameAr || 'موظف',
      };
    });
    return { accounts };
  }

  // 3. Switch Account
  if (pathname === '/api/auth/switch-account' && method === 'POST') {
    const targetUser = state.users.find((u: any) => u.id === body.targetUserId);
    if (!targetUser) {
      throw new Error('الحساب المطلوب غير موجود');
    }
    const targetRole =
      state.roles.find((r: any) => r.id === targetUser.roleId) || state.roles[0];
    const { passwordPlain: _pp, ...safeUser } = targetUser;
    return {
      token: `cloud_tok_${targetUser.id}_${Date.now()}`,
      user: safeUser,
      role: targetRole,
    };
  }

  // 4. Bootstrap
  if (pathname === '/api/bootstrap' && method === 'GET') {
    const leadScope = currentRole?.permissions?.leads?.read || 'own';
    const userProjects: string[] = Array.isArray(currentUser.assignedProjects)
      ? currentUser.assignedProjects
      : [];
    const visibleLeads = (state.leads || []).filter((l: any) => {
      if (leadScope === 'none') return false;
      if (leadScope === 'all') return true;
      if (leadScope === 'own') return l.assignedTo === currentUser.id;
      return l.assignedTo === currentUser.id || userProjects.includes(l.projectInterest);
    });

    const { passwordPlain: _pp, ...safeUser } = currentUser;
    return {
      sessionToken: `cloud_tok_${currentUser.id}_${Date.now()}`,
      currentUser: safeUser,
      currentRole,
      roles: state.roles,
      users: state.users.map(({ passwordPlain: _p, ...rest }: any) => rest),
      leads: visibleLeads,
      allLeadsCount: (state.leads || []).length,
      properties: state.properties || [],
      deals: state.deals || [],
      events: state.events || [],
      sheetConnections: state.sheetConnections || [],
      syncLogs: state.syncLogs || [],
      notifications: state.notifications || [],
      projects: state.projects || DEFAULT_PROJECTS,
    };
  }

  // 5. Create User (`POST /api/users`)
  if (pathname === '/api/users' && method === 'POST') {
    const cleanUsername = String(body.username || '').trim().toLowerCase();
    if (!cleanUsername || !body.password || !body.fullName) {
      throw new Error('الاسم الكامل واسم المستخدم وكلمة المرور حقول إلزامية');
    }
    if (
      state.users.some(
        (u: any) => String(u.username || '').toLowerCase() === cleanUsername
      )
    ) {
      throw new Error('اسم المستخدم موجود بالفعل، اختر اسماً آخر');
    }
    const initials =
      String(body.fullName)
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0] || '')
        .join('')
        .toUpperCase() || 'U';

    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      passwordPlain: String(body.password).trim(),
      fullName: String(body.fullName).trim(),
      roleId: body.roleId || 'role_employee',
      jobTitle: body.jobTitle || 'Property Sales Advisor',
      jobTitleAr: body.jobTitleAr || 'مستشار مبيعات عقارية',
      avatarUrl: body.avatarUrl || createAvatarSvg(initials, '#2563EB', '#60A5FA'),
      email: body.email || `${cleanUsername}@propsphere.eg`,
      phone: body.phone ? String(body.phone).trim() : '',
      location: body.location || 'القاهرة الجديدة',
      assignedProjects: Array.isArray(body.assignedProjects)
        ? body.assignedProjects
        : [DEFAULT_PROJECTS[0]],
      isActiveForRouting:
        body.isActiveForRouting !== undefined ? Boolean(body.isActiveForRouting) : true,
      routingWeight: Number(body.routingWeight) || 1,
      preferredLang: 'ar',
      createdAt: new Date().toISOString(),
    };
    state.users.push(newUser);
    await saveCloudWorkspaceState(state);
    const { passwordPlain: _pp, ...safeUser } = newUser;
    return { user: safeUser };
  }

  // 6. Update User (`PUT /api/users/:id`)
  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const targetId = pathname.split('/').pop()!;
    const idx = state.users.findIndex((u: any) => u.id === targetId);
    if (idx === -1) throw new Error('المستخدم غير موجود');
    const existing = state.users[idx];
    const updated = {
      ...existing,
      ...body,
      username: body.username
        ? String(body.username).trim().toLowerCase()
        : existing.username,
      passwordPlain:
        body.password && String(body.password).trim()
          ? String(body.password).trim()
          : existing.passwordPlain,
    };
    delete updated.password;
    state.users[idx] = updated;
    await saveCloudWorkspaceState(state);
    const { passwordPlain: _pp, ...safeUser } = updated;
    return { user: safeUser };
  }

  // 7. Delete User (`DELETE /api/users/:id`)
  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const targetId = pathname.split('/').pop()!;
    state.users = state.users.filter((u: any) => u.id !== targetId);
    await saveCloudWorkspaceState(state);
    return { ok: true };
  }

  // 8. Paginated or flat GET /api/leads, /api/deals, /api/events
  if (pathname === '/api/leads' && method === 'GET') {
    const items = state.leads || [];
    if (urlObj.search) {
      return { items, nextCursor: null, hasMore: false, totalMatching: items.length };
    }
    return items;
  }
  if (pathname === '/api/deals' && method === 'GET') {
    const items = state.deals || [];
    if (urlObj.search) {
      return {
        items,
        nextCursor: null,
        hasMore: false,
        totalMatching: items.length,
        summary: { totalCount: items.length, totalPipelineValue: 0, wonDealsValue: 0 },
      };
    }
    return items;
  }
  if (pathname === '/api/events' && method === 'GET') {
    const items = state.events || [];
    if (urlObj.search) {
      return { items, nextCursor: null, hasMore: false, totalMatching: items.length };
    }
    return items;
  }

  // 9. Daily Reports (`GET /api/reports/daily`)
  if (pathname === '/api/reports/daily' && method === 'GET') {
    const dateFilter = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const salesAgents = (state.users || []).filter(
      (u: any) =>
        u.roleId === 'role_employee' ||
        u.roleId === 'role_supervisor' ||
        u.roleId === 'role_deputy'
    );
    const agentStats = salesAgents.map((agent: any) => {
      const agentLeads = (state.leads || []).filter((l: any) => l.assignedTo === agent.id);
      return {
        userId: agent.id,
        fullName: agent.fullName,
        avatarUrl: agent.avatarUrl,
        jobTitle: agent.jobTitle,
        jobTitleAr: agent.jobTitleAr,
        isActiveForRouting: agent.isActiveForRouting,
        assignedProjects: agent.assignedProjects || [],
        totalAssignedLeads: agentLeads.length,
        leadsAssignedToday: 0,
        contactedToday: 0,
        callsToday: 0,
        whatsappToday: 0,
        visitsScheduledToday: 0,
        qualifiedCount: 0,
        wonDealsCount: 0,
        wonRevenue: 0,
        conversionRate: 0,
        avgResponseMinutes: 0,
      };
    });
    return { date: dateFilter, agentStats };
  }

  return { ok: true };
}
