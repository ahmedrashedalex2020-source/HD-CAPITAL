import {
  doesUserMatchLoginIdentifier,
  fetchFirestoreWorkspace,
  queryFirestoreUserByUsername,
  removeFirestoreUser,
  saveFirestoreUser,
  saveFirestoreWorkspace,
} from './firebaseClient';
import { normalizeLeadStatus } from '../types/crm';

export const DEFAULT_PROJECTS = ['ليدز مغتربين'];

/**
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic/Persian (۰-۹) numerals to standard ASCII digits (0-9).
 */
export function convertArabicDigitsToEnglish(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Normalizes any phone number string to a canonical digits-only key.
 * Converts Arabic/Hindi digits first before stripping non-numeric characters.
 * Normalizes all Egyptian formats ("01012345678", "+201012345678", "00201012345678", "2001012345678", "1012345678")
 * into canonical "201XXXXXXXXX", and normalizes international numbers by stripping leading "00" or "+".
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  const asciiText = convertArabicDigitsToEnglish(String(rawPhone))
    .replace(/^p:/i, '')
    .trim();

  let digits = asciiText.replace(/\D+/g, '');
  if (!digits) return '';

  while (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('2001') && digits.length === 13) {
    digits = '20' + digits.slice(3);
  }

  if (/^01[0125]\d{8}$/.test(digits)) {
    digits = '2' + digits;
  }

  if (/^1[0125]\d{8}$/.test(digits)) {
    digits = '20' + digits;
  }

  return digits;
}

/**
 * Returns the canonical match key for comparing phone numbers across the system.
 */
export function getPhoneMatchKey(rawPhone: string): string {
  const norm = normalizePhone(rawPhone);
  if (!norm || norm.length < 8) return '';
  if (/^201[0125]\d{8}$/.test(norm)) {
    return norm;
  }
  return norm;
}

/**
 * Architectural Requirement: Pure Google Firebase Cloud Firestore persistence.
 * Zero reliance on browser localStorage for CRM records, leads, users, or workspace snapshots.
 */
export function purgeAllLegacyLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('propsphere_crm') ||
          key.startsWith('propsphere_workspace_') ||
          key.startsWith('propsphere_live_') ||
          key.startsWith('propsphere_snap') ||
          key === 'propsphere_crm1_strict_v5' ||
          key === 'propsphere_crm1_clean_v4')
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

// Immediately purge on module evaluation
if (typeof window !== 'undefined') {
  purgeAllLegacyLocalStorage();
}

const FAKE_PROJECT_NAMES = new Set([
  'Palm Hills New Cairo',
  'Mountain View iCity',
  'ZED East Ora',
  'Marassi North Coast',
  'Il Bosco New Capital',
  'Solare Ras El Hekma',
]);

const FAKE_LEAD_IDS = new Set([
  'lead_101',
  'lead_102',
  'lead_103',
  'lead_104',
  'lead_105',
  'lead_106',
  'lead_1793004176267_3',
]);

const FAKE_DEMO_USER_IDS = new Set([
  'usr_supervisor',
  'usr_sales1',
  'usr_sales2',
  'usr_sales3',
  'usr_deputy',
  'usr_1793095150415_61ql',
]);

function isExplicitFakeDemoUser(u: any): boolean {
  if (!u || typeof u !== 'object') return true;
  if (FAKE_DEMO_USER_IDS.has(String(u.id || ''))) return true;
  const uname = String(u.username || '').trim().toLowerCase();
  const fname = String(u.fullName || '').trim();
  if (uname === 'test1' && fname.includes('تجريبي')) return true;
  return false;
}

function parseCrm1Price(rawAnswer: string): number {
  const text = String(rawAnswer || '').trim();
  if (!text) return 0;
  if (/مليون|million/i.test(text)) {
    const numMatch = text.replace(/_/g, ' ').match(/([0-9]+(?:\.[0-9]+)?)/);
    if (numMatch) {
      return Math.round(parseFloat(numMatch[1]) * 1000000);
    }
  }
  const numericDigits = Number(text.replace(/[^0-9]/g, ''));
  if (numericDigits >= 100000 && numericDigits <= 500000000) {
    return numericDigits;
  }
  return 0;
}

function isDummyOrFakeLeadRow(lead: any): boolean {
  if (!lead || typeof lead !== 'object') return true;
  if (FAKE_LEAD_IDS.has(lead.id)) return true;
  if (String(lead.sheetRowId || '').startsWith('meta_row_')) return true;
  const combined = `${lead.fullName || ''} ${lead.phone || ''} ${lead.notes || ''}`.toLowerCase();
  if (
    combined.includes('dummy data') ||
    combined.includes('<test lead') ||
    combined.includes('test lead:')
  ) {
    return true;
  }
  const digits = normalizePhone(String(lead.phone || ''));
  if (digits.length < 8) return true;
  return false;
}

export function sanitizeCrm1Workspace(rawSnap: any): { cleaned: any; hadFakeData: boolean } {
  if (!rawSnap || typeof rawSnap !== 'object') {
    return { cleaned: rawSnap, hadFakeData: false };
  }
  let hadFakeData = false;

  const rawUsers: any[] = Array.isArray(rawSnap.users) ? rawSnap.users : [];
  const cleanUsers = rawUsers.filter((u: any) => {
    if (isExplicitFakeDemoUser(u)) {
      hadFakeData = true;
      return false;
    }
    return true;
  });

  const rawLeads: any[] = Array.isArray(rawSnap.leads) ? rawSnap.leads : [];
  const discoveredProjects = new Set<string>();
  const seenWorkspacePhones = new Set<string>();
  const cleanLeads = rawLeads
    .filter((l: any) => {
      if (isDummyOrFakeLeadRow(l)) {
        hadFakeData = true;
        return false;
      }
      const pKey = getPhoneMatchKey(String(l.phone || ''));
      if (pKey.length >= 8) {
        if (seenWorkspacePhones.has(pKey)) {
          hadFakeData = true;
          return false;
        }
        seenWorkspacePhones.add(pKey);
      }
      if (l.secondaryPhone) {
        const sKey = getPhoneMatchKey(String(l.secondaryPhone));
        if (sKey.length >= 8) seenWorkspacePhones.add(sKey);
      }
      return true;
    })
    .map((l: any) => {
      const copy = { ...l };
      const normalizedSt = normalizeLeadStatus(copy.status);
      if (copy.status !== normalizedSt) {
        copy.status = normalizedSt;
      }
      if (Array.isArray(copy.formResponses)) {
        copy.formResponses = copy.formResponses.filter((fr: any) => {
          const q = String(fr?.question || '').trim().toLowerCase();
          const a = String(fr?.answer || '').trim().toLowerCase();
          if (!q || !a || q === 'lead_status' || a.includes('dummy data')) {
            hadFakeData = true;
            return false;
          }
          return true;
        });

        for (const fr of copy.formResponses) {
          const q = String(fr.question || '').trim();
          const a = String(fr.answer || '').trim();
          if (q === 'campaign_name' || q.includes('المشروع') || q.includes('حملة')) {
            if (a && !FAKE_PROJECT_NAMES.has(a)) {
              copy.projectInterest = a;
            }
          } else if (q.includes('المساحة') || q.includes('نوع الوحدة')) {
            if (a && (!copy.propertyType || copy.propertyType === 'Villa')) {
              copy.propertyType = a.replace(/_/g, ' ');
            }
          } else if (q.includes('السعر') || q.includes('الميزانية')) {
            const parsedBudget = parseCrm1Price(a);
            if (parsedBudget > 0 && (!copy.budgetMax || copy.budgetMax === 0)) {
              copy.budgetMax = parsedBudget;
              copy.budgetMin = Math.round(parsedBudget * 0.85);
            }
          }
        }

        copy.notes = copy.formResponses.map((fr: any) => `${fr.question}: ${fr.answer}`).join(' | ');
      }

      if (!copy.projectInterest || FAKE_PROJECT_NAMES.has(copy.projectInterest)) {
        if (FAKE_PROJECT_NAMES.has(copy.projectInterest)) hadFakeData = true;
        copy.projectInterest = 'ليدز مغتربين';
      }
      discoveredProjects.add(copy.projectInterest);
      return copy;
    });

  const rawProjectsCatalog: any[] = Array.isArray(rawSnap.projectsCatalog)
    ? rawSnap.projectsCatalog.filter(
        (p: any) => p && typeof p === 'object' && !FAKE_PROJECT_NAMES.has(String(p.name || '').trim())
      )
    : [];

  if (Array.isArray(rawSnap.projects)) {
    rawSnap.projects.forEach((p: any) => {
      const name = String(p || '').trim();
      if (name && !FAKE_PROJECT_NAMES.has(name)) {
        discoveredProjects.add(name);
      }
    });
  }
  rawProjectsCatalog.forEach((p: any) => {
    const name = String(p?.name || '').trim();
    if (name && !FAKE_PROJECT_NAMES.has(name)) {
      discoveredProjects.add(name);
    }
  });
  if (Array.isArray(rawSnap.properties)) {
    rawSnap.properties.forEach((prop: any) => {
      const name = String(prop?.projectName || '').trim();
      if (name && !FAKE_PROJECT_NAMES.has(name)) {
        discoveredProjects.add(name);
      }
    });
  }

  const cleanProjects =
    discoveredProjects.size > 0 ? Array.from(discoveredProjects) : [...DEFAULT_PROJECTS];

  cleanUsers.forEach((u: any) => {
    if (Array.isArray(u.assignedProjects)) {
      const filtered = u.assignedProjects.filter((p: string) => !FAKE_PROJECT_NAMES.has(p));
      u.assignedProjects = filtered.length > 0 ? filtered : [...cleanProjects];
    } else {
      u.assignedProjects = [...cleanProjects];
    }
    const lowerUser = String(u.username || '').trim().toLowerCase();
    const normUser = lowerUser.replace(/[\s_]+/g, '');
    if (u.id === 'usr_admin' || lowerUser === 'admin') {
      u.accessPassword = u.accessPassword || 'admin123';
      if (u.accessPassword === 'admin123') {
        u.clientAuthDigest =
          'd652c898cd889faef35a152374f008bcbe8fbb7edb157c92e044b1ee7d70c76d';
      }
    } else if (
      u.id === 'usr_admin2' ||
      u.id === 'usr_admin_partner' ||
      lowerUser === 'admin2' ||
      normUser === 'hassanshehata'
    ) {
      u.id = 'usr_admin2';
      u.username = 'Hassan shehata';
      u.roleId = 'role_admin';
      u.accessPassword = 'HD_CAPITAL';
      u.clientAuthDigest =
        '284bcbb27a5f6f1b546a1e0abbf03972ada083a2f6381735c6c6411960af170d';
    } else if (u.id === 'usr_1793010490703_1p0c' || lowerUser === 'omarahmed1') {
      u.accessPassword = u.accessPassword || '123456';
      if (u.accessPassword === '123456') {
        u.clientAuthDigest =
          '4c41844d10f438ad7f46c26d42a557819739e35782f3e05080ba9aad4dd3b263';
      }
    } else {
      u.accessPassword = u.accessPassword || '123456';
    }
  });

  const validUserIds = new Set(cleanUsers.map((u: any) => u.id));
  const hassanAdmin =
    cleanUsers.find(
      (u: any) =>
        u.id === 'usr_admin2' ||
        String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
    ) ||
    cleanUsers.find((u: any) => u.id === 'usr_admin') ||
    cleanUsers[0];

  if (hassanAdmin && cleanLeads.length > 0) {
    cleanLeads.forEach((l: any) => {
      if (!l.assignedTo || !validUserIds.has(l.assignedTo)) {
        l.assignedTo = hassanAdmin.id;
      }
      const owner = cleanUsers.find((u: any) => u.id === l.assignedTo) || hassanAdmin;
      if (owner && Array.isArray(l.activities)) {
        l.activities = l.activities.map((act: any) =>
          act.type === 'sheet_import' && !String(act.summary || '').includes(owner.fullName)
            ? {
                ...act,
                summary: `تم استيراد العميل من شيت CRM1 (${
                  (l.formResponses || []).length
                } إجابات من الفورم) وتعيينه إلى ${owner.fullName}.`,
              }
            : act
        );
      }
    });
  }

  const cleanNotifications = (rawSnap.notifications || []).filter(
    (n: any) =>
      !['notif_1', 'notif_2', 'notif_3', 'notif_1793004176267_3'].includes(n?.id) &&
      !String(n?.message || '').toLowerCase().includes('dummy data')
  );

  return {
    cleaned: {
      ...rawSnap,
      users: cleanUsers,
      leads: cleanLeads,
      notifications: cleanNotifications,
      projects: cleanProjects,
      projectsCatalog: rawProjectsCatalog,
    },
    hadFakeData,
  };
}

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
let isCloudStoreTestMode = false;

export function resetCloudStoreTestState(customSnap?: any): any {
  isCloudStoreTestMode = true;
  lastRemoteFetchTime = Date.now();
  const baseSnap = customSnap || {
    roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
    users: [
      {
        id: 'usr_admin',
        username: 'admin',
        accessPassword: 'admin123',
        clientAuthDigest: 'd652c898cd889faef35a152374f008bcbe8fbb7edb157c92e044b1ee7d70c76d',
        fullName: 'أحمد راشد (Ahmed Rashed)',
        roleId: 'role_admin',
        jobTitle: 'CEO & System Administrator',
        jobTitleAr: 'المدير التنفيذي ومدير النظام',
        avatarUrl: createFallbackAvatarSvg('AR'),
        email: 'ahmedrashedalex2020@gmail.com',
        phone: '',
        location: 'القاهرة الجديدة - التجمع الخامس',
        assignedProjects: [...DEFAULT_PROJECTS],
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: '2026-01-10T09:00:00.000Z',
      },
      {
        id: 'usr_admin2',
        username: 'Hassan shehata',
        accessPassword: 'HD_CAPITAL',
        clientAuthDigest: '284bcbb27a5f6f1b546a1e0abbf03972ada083a2f6381735c6c6411960af170d',
        fullName: 'حسن شحاتة (Hassan Shehata)',
        roleId: 'role_admin',
        jobTitle: 'Co-Founder & System Administrator',
        jobTitleAr: 'مدير شريك ومدير نظام معتمد',
        avatarUrl: createFallbackAvatarSvg('HS'),
        email: 'hassan.shehata@propsphere.eg',
        phone: '',
        location: 'القاهرة الجديدة - التجمع الخامس',
        assignedProjects: [...DEFAULT_PROJECTS],
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      {
        id: 'usr_1793010490703_1p0c',
        username: 'omarahmed1',
        accessPassword: '123456',
        clientAuthDigest: '4c41844d10f438ad7f46c26d42a557819739e35782f3e05080ba9aad4dd3b263',
        fullName: 'عمر احمد',
        roleId: 'role_employee',
        jobTitle: 'Property Sales Consultant',
        jobTitleAr: 'مسؤول مبيعات عقارية',
        avatarUrl: createFallbackAvatarSvg('عا'),
        email: 'omarahmed1@propsphere.eg',
        phone: '01114477605',
        location: 'القاهرة الجديدة',
        assignedProjects: [...DEFAULT_PROJECTS],
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
    sheetConnections: [
      {
        id: 'conn_crm1_live',
        name: 'شيت جوجل درايف (CRM1)',
        spreadsheetId: '1793004176267',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1793004176267/edit',
        worksheetName: 'CRM1',
        driveFileName: 'CRM1',
        defaultProject: DEFAULT_PROJECTS[0],
        routingMode: 'round_robin_weighted',
        autoSyncEnabled: true,
        syncIntervalSeconds: 20,
        lastSyncAt: new Date().toISOString(),
        lastRowProcessed: 0,
        totalImported: 0,
        status: 'Connected',
        autoDistributionEnabled: false,
        selectedSalesUserIds: [],
      },
    ],
    syncLogs: [],
    notifications: [],
    projects: [...DEFAULT_PROJECTS],
    projectsCatalog: [],
  };
  cachedLiveSnapshot = sanitizeCrm1Workspace(baseSnap).cleaned;
  return cachedLiveSnapshot;
}

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
    exp: Date.now() + 15 * 60 * 1000,
  };
  const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(payloadObj))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${encodedPayload}.propsphere_verified_static_session_sig`;
}

export function saveLocalSnapshot(bootstrapData: any): void {
  purgeAllLegacyLocalStorage();
  if (!bootstrapData || typeof bootstrapData !== 'object') return;
  try {
    const rawMerged = {
      ...(cachedLiveSnapshot || {}),
      ...bootstrapData,
      roles:
        Array.isArray(bootstrapData.roles) && bootstrapData.roles.length > 0
          ? bootstrapData.roles
          : cachedLiveSnapshot?.roles || DEFAULT_ROLES,
      users: mergeById(cachedLiveSnapshot?.users || [], bootstrapData.users || []),
      leads: mergeById(cachedLiveSnapshot?.leads || [], bootstrapData.leads || []),
      deals: mergeById(cachedLiveSnapshot?.deals || [], bootstrapData.deals || []),
      properties: mergeById(cachedLiveSnapshot?.properties || [], bootstrapData.properties || []),
      events: mergeById(cachedLiveSnapshot?.events || [], bootstrapData.events || []),
      sheetConnections:
        Array.isArray(bootstrapData.sheetConnections) && bootstrapData.sheetConnections.length > 0
          ? bootstrapData.sheetConnections
          : cachedLiveSnapshot?.sheetConnections || [],
      syncLogs:
        Array.isArray(bootstrapData.syncLogs) && bootstrapData.syncLogs.length > 0
          ? bootstrapData.syncLogs
          : cachedLiveSnapshot?.syncLogs || [],
      notifications:
        Array.isArray(bootstrapData.notifications) && bootstrapData.notifications.length > 0
          ? bootstrapData.notifications
          : cachedLiveSnapshot?.notifications || [],
      projects:
        Array.isArray(bootstrapData.projects) && bootstrapData.projects.length > 0
          ? bootstrapData.projects
          : cachedLiveSnapshot?.projects || DEFAULT_PROJECTS,
      projectsCatalog: mergeById(
        cachedLiveSnapshot?.projectsCatalog || [],
        bootstrapData.projectsCatalog || []
      ),
    };
    const { cleaned: merged } = sanitizeCrm1Workspace(rawMerged);
    cachedLiveSnapshot = merged;
  } catch {
    // ignore
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

/**
 * Returns null: Local storage persistence is completely disabled per architectural specification.
 * Google Firebase Cloud Firestore is the sole authoritative data store.
 */
export function loadLocalSnapshot(): any {
  purgeAllLegacyLocalStorage();
  return null;
}

async function fetchStaticSnapshotJson(now: number): Promise<any | null> {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = controller ? setTimeout(() => controller.abort(), 2500) : null;
    const res = await fetch(`/crm-live-snapshot.json?t=${now}`, {
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (tid) clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.users)) {
        return sanitizeCrm1Workspace(data).cleaned;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function withFastTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallbackValue), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });
}

async function ensureLiveDatabaseLoaded(forceRemote = false): Promise<any> {
  purgeAllLegacyLocalStorage();
  if (isCloudStoreTestMode && cachedLiveSnapshot) {
    return cachedLiveSnapshot;
  }
  const now = Date.now();

  if (forceRemote || !cachedLiveSnapshot || now - lastRemoteFetchTime > 15000) {
    lastRemoteFetchTime = now;
    try {
      const [staticSnap, rawFirestoreSnap] = await Promise.all([
        withFastTimeout(fetchStaticSnapshotJson(now), 2500, null),
        withFastTimeout(fetchFirestoreWorkspace(), 3000, null),
      ]);

      const firestoreSanitized = rawFirestoreSnap
        ? sanitizeCrm1Workspace(rawFirestoreSnap)
        : { cleaned: null, hadFakeData: false };
      const firestoreSnap = firestoreSanitized.cleaned;

      // When Cloud Firestore has existing workspace records, it is the primary authoritative source
      if (
        firestoreSnap &&
        Array.isArray(firestoreSnap.users) &&
        firestoreSnap.users.length > 0 &&
        Array.isArray(firestoreSnap.leads) &&
        firestoreSnap.leads.length > 0
      ) {
        cachedLiveSnapshot = firestoreSnap;
        return firestoreSnap;
      }

      if (staticSnap || firestoreSnap) {
        const base = staticSnap || {};
        const cloud = firestoreSnap || {};

        const combinedUsers = mergeById(base.users || [], cloud.users || []);
        const combinedLeads = mergeById(base.leads || [], cloud.leads || []);
        const combinedDeals = mergeById(base.deals || [], cloud.deals || []);
        const combinedProperties = mergeById(base.properties || [], cloud.properties || []);
        const combinedEvents = mergeById(base.events || [], cloud.events || []);

        const rawMerged = {
          ...base,
          ...cloud,
          roles:
            Array.isArray(cloud.roles) && cloud.roles.length > 0
              ? cloud.roles
              : Array.isArray(base.roles) && base.roles.length > 0
              ? base.roles
              : DEFAULT_ROLES,
          users: combinedUsers,
          leads: combinedLeads,
          deals: combinedDeals,
          properties: combinedProperties,
          events: combinedEvents,
          sheetConnections:
            Array.isArray(cloud.sheetConnections) && cloud.sheetConnections.length > 0
              ? cloud.sheetConnections
              : base.sheetConnections || [],
          syncLogs:
            Array.isArray(cloud.syncLogs) && cloud.syncLogs.length > 0
              ? cloud.syncLogs
              : base.syncLogs || [],
          notifications:
            Array.isArray(cloud.notifications) && cloud.notifications.length > 0
              ? cloud.notifications
              : base.notifications || [],
          projects: Array.from(
            new Set([
              ...DEFAULT_PROJECTS,
              ...(Array.isArray(base.projects) ? base.projects : []),
              ...(Array.isArray(cloud.projects) ? cloud.projects : []),
            ])
          ),
          projectsCatalog: mergeById(base.projectsCatalog || [], cloud.projectsCatalog || []),
        };

        const { cleaned: merged } = sanitizeCrm1Workspace(rawMerged);
        cachedLiveSnapshot = merged;
        return merged;
      }
    } catch (err) {
      console.warn('[CloudStore] Firestore load notice:', err);
    }
  }

  if (cachedLiveSnapshot) return cachedLiveSnapshot;

  const fallback = {
    roles: DEFAULT_ROLES,
    users: [
      {
        id: 'usr_admin',
        username: 'admin',
        accessPassword: 'admin123',
        clientAuthDigest: 'd652c898cd889faef35a152374f008bcbe8fbb7edb157c92e044b1ee7d70c76d',
        fullName: 'أحمد راشد (Ahmed Rashed)',
        roleId: 'role_admin',
        jobTitle: 'CEO & System Administrator',
        jobTitleAr: 'المدير التنفيذي ومدير النظام',
        avatarUrl: createFallbackAvatarSvg('AR'),
        email: 'ahmedrashedalex2020@gmail.com',
        phone: '',
        location: 'القاهرة الجديدة - التجمع الخامس',
        assignedProjects: DEFAULT_PROJECTS,
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: '2026-01-10T09:00:00.000Z',
      },
      {
        id: 'usr_admin2',
        username: 'Hassan shehata',
        accessPassword: 'HD_CAPITAL',
        clientAuthDigest: '284bcbb27a5f6f1b546a1e0abbf03972ada083a2f6381735c6c6411960af170d',
        fullName: 'حسن شحاتة (Hassan Shehata)',
        roleId: 'role_admin',
        jobTitle: 'Co-Founder & System Administrator',
        jobTitleAr: 'مدير شريك ومدير نظام معتمد',
        avatarUrl: createFallbackAvatarSvg('HS'),
        email: 'hassan.shehata@propsphere.eg',
        phone: '',
        location: 'القاهرة الجديدة - التجمع الخامس',
        assignedProjects: DEFAULT_PROJECTS,
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      {
        id: 'usr_1793010490703_1p0c',
        username: 'omarahmed1',
        accessPassword: '123456',
        clientAuthDigest: '4c41844d10f438ad7f46c26d42a557819739e35782f3e05080ba9aad4dd3b263',
        fullName: 'عمر احمد',
        roleId: 'role_employee',
        jobTitle: 'Property Sales Consultant',
        jobTitleAr: 'مسؤول مبيعات عقارية',
        avatarUrl: createFallbackAvatarSvg('عا'),
        email: 'omarahmed1@propsphere.eg',
        phone: '01114477605',
        location: 'القاهرة الجديدة',
        assignedProjects: DEFAULT_PROJECTS,
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
    projectsCatalog: [],
  };
  cachedLiveSnapshot = fallback;
  return fallback;
}

async function persistState(snap: any): Promise<void> {
  purgeAllLegacyLocalStorage();
  const { cleaned } = sanitizeCrm1Workspace(snap);
  cachedLiveSnapshot = cleaned;
  if (isCloudStoreTestMode) return;
  // Exclusively write to Google Firebase Firestore
  await saveFirestoreWorkspace(cleaned);
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
  const allLeads: any[] = Array.isArray(snap.leads) ? snap.leads : [];
  if (scope === 'none') return [];
  if (scope === 'all' || user?.roleId === 'role_admin') return allLeads;

  const validUserIds = new Set((snap.users || []).map((u: any) => u.id));
  const hassanAdmin =
    (snap.users || []).find(
      (u: any) =>
        u.id === 'usr_admin2' ||
        String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
    ) ||
    (snap.users || []).find((u: any) => u.id === 'usr_admin') ||
    (snap.users || [])[0];

  if (hassanAdmin && allLeads.length > 0) {
    allLeads.forEach((l: any) => {
      if (!l.assignedTo || !validUserIds.has(l.assignedTo)) {
        l.assignedTo = hassanAdmin.id;
      }
    });
  }

  return allLeads.filter((l: any) =>
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
  const method = (options.method || 'GET').toUpperCase();
  const urlObj = new URL(path, 'http://localhost');
  const pathname = urlObj.pathname;

  const snap = await ensureLiveDatabaseLoaded(false);
  if (!Array.isArray(snap.roles) || snap.roles.length === 0) {
    snap.roles = DEFAULT_ROLES;
  }
  if (!Array.isArray(snap.users)) {
    snap.users = [];
  }

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

  const activeUser =
    snap.users.find((u: any) => u.id === currentUserId) ||
    snap.users.find((u: any) => u.id === 'usr_admin') ||
    snap.users[0];
  const activeRole =
    snap.roles.find((r: any) => r.id === activeUser?.roleId) || snap.roles[0];

  // 1. Auth: Accounts Preview (Disabled so no usernames/passwords are exposed before login)
  if (pathname === '/api/auth/accounts-preview' && method === 'GET') {
    return { accounts: [] };
  }

  // 2. Auth: Login (Queries merged state AND directly queries Firebase Firestore if needed)
  if (pathname === '/api/auth/login' && method === 'POST') {
    const rawUser = String(body.username || '').trim();
    const cleanUser = rawUser.toLowerCase();
    const cleanPass = String(body.password || '').trim();
    if (!cleanUser || !cleanPass) {
      throw new Error('يرجى إدخال اسم المستخدم وكلمة المرور');
    }
    if (cleanPass === 'demo_bypass') {
      throw new Error('تم تعطيل الدخول التجاوزي (demo_bypass) لأسباب أمنية');
    }

    const normalizedUserLookup = cleanUser.replace(/[\s_.-]+/g, '');
    let user = snap.users.find((u: any) => doesUserMatchLoginIdentifier(u, rawUser));

    // Only query Firebase Firestore if user was not found in current snapshot
    if (!user) {
      const firestoreUser = await withFastTimeout(
        queryFirestoreUserByUsername(rawUser),
        2500,
        null
      );
      if (firestoreUser) {
        user = firestoreUser;
        snap.users = mergeById(snap.users, [user]);
        cachedLiveSnapshot = snap;
      }
    }

    if (!user) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const isHassan =
      user.id === 'usr_admin2' ||
      user.id === 'usr_admin_partner' ||
      cleanUser === 'hassan shehata' ||
      normalizedUserLookup === 'hassanshehata';
    const isAdmin1 =
      user.id === 'usr_admin' || String(user.username || '').toLowerCase() === 'admin';
    const isOmar =
      user.id === 'usr_1793010490703_1p0c' ||
      String(user.username || '').toLowerCase() === 'omarahmed1';

    const storedAccessPass = user.accessPassword ? String(user.accessPassword).trim() : '';

    if (
      isHassan &&
      (cleanPass === 'HD_CAPITAL' ||
        cleanPass.toUpperCase().replace(/[\s-]+/g, '_') === 'HD_CAPITAL')
    ) {
      // Validated Hassan Shehata
    } else if (isAdmin1 && (cleanPass === (storedAccessPass || 'admin123') || cleanPass === 'admin123')) {
      // Validated Primary Admin
    } else if (isOmar && (cleanPass === (storedAccessPass || '123456') || cleanPass === '123456')) {
      // Validated Omar Ahmed
    } else if (
      storedAccessPass &&
      (cleanPass === storedAccessPass ||
        cleanPass.toLowerCase() === storedAccessPass.toLowerCase())
    ) {
      // Validated via stored accessPassword
    } else if (user.clientAuthDigest) {
      const digestWithClean = await computeSha256Hex(`propsphere_auth:${cleanUser}:${cleanPass}`);
      const canonicalUser = String(user.username || '').trim().toLowerCase();
      const digestCanonical = await computeSha256Hex(`propsphere_auth:${canonicalUser}:${cleanPass}`);
      if (
        digestWithClean !== user.clientAuthDigest &&
        digestCanonical !== user.clientAuthDigest
      ) {
        throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } else {
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

  // 3. Auth: Switch Account (Disabled — password re-authentication is required)
  if (pathname === '/api/auth/switch-account' && method === 'POST') {
    throw new Error('تم تعطيل التبديل السريع للحسابات لأسباب أمنية. يرجى تسجيل الخروج والدخول بكلمة المرور.');
  }

  // Require valid authenticated user for all non-login routes
  const authenticatedUser = snap.users.find((u: any) => u.id === currentUserId);
  if (!currentUserId || !authenticatedUser) {
    throw new Error('انتهت جلسة العمل أو لم يتم تسجيل الدخول. يرجى تسجيل الدخول باسم المستخدم وكلمة المرور.');
  }

  // 4. Bootstrap Workspace (Scoped strictly to the logged-in user's permissions)
  if (pathname === '/api/bootstrap' && method === 'GET') {
    const visibleLeads = getVisibleLeads(snap, authenticatedUser, activeRole);
    const visibleDeals = getVisibleDeals(snap, authenticatedUser, activeRole);
    const visibleEvents = getVisibleEvents(snap, authenticatedUser, activeRole);
    const userNotifications = (snap.notifications || []).filter(
      (n: any) => n.userId === authenticatedUser?.id || n.userId === 'all'
    );
    const isAdmin = authenticatedUser.roleId === 'role_admin' || activeRole?.id === 'role_admin';
    const visibleUsers = snap.users.map((u: any) => {
      if (isAdmin) return u;
      const { accessPassword, clientAuthDigest, passwordHash, ...safe } = u;
      return safe;
    });
    const canReadSheets =
      isAdmin ||
      (activeRole?.permissions?.sheets_sync?.read &&
        activeRole.permissions.sheets_sync.read !== 'none');

    return {
      sessionToken: createBrowserSessionToken(authenticatedUser),
      currentUser: isAdmin
        ? authenticatedUser
        : (() => {
            const { accessPassword, clientAuthDigest, passwordHash, ...safe } = authenticatedUser;
            return safe;
          })(),
      currentRole: activeRole,
      roles: isAdmin ? snap.roles : snap.roles.filter((r: any) => r.id === activeRole?.id),
      users: visibleUsers,
      leads: visibleLeads,
      allLeadsCount: visibleLeads.length,
      properties: snap.properties || [],
      deals: visibleDeals,
      events: visibleEvents,
      sheetConnections: canReadSheets ? snap.sheetConnections || [] : [],
      syncLogs: canReadSheets ? snap.syncLogs || [] : [],
      notifications: userNotifications,
      projects: snap.projects || DEFAULT_PROJECTS,
      projectsCatalog: snap.projectsCatalog || [],
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
    const canonicalPhone = getPhoneMatchKey(String(body.phone || ''));
    const canonicalSecondary = body.secondaryPhone
      ? getPhoneMatchKey(String(body.secondaryPhone))
      : '';
    const candidateKeys = [canonicalPhone, canonicalSecondary].filter((k) => k.length >= 8);

    if (candidateKeys.length === 0) {
      throw new Error('يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)');
    }

    const existingDuplicate = (snap.leads || []).find((existing: any) => {
      const existingPrimary = getPhoneMatchKey(String(existing.phone || ''));
      const existingSecondary = existing.secondaryPhone
        ? getPhoneMatchKey(String(existing.secondaryPhone))
        : '';
      return candidateKeys.some(
        (key) =>
          (existingPrimary && existingPrimary === key) ||
          (existingSecondary && existingSecondary === key)
      );
    });

    if (existingDuplicate) {
      const owner = (snap.users || []).find((u: any) => u.id === existingDuplicate.assignedTo);
      const ownerName = owner?.fullName || 'غير معين';
      throw new Error(
        `هذا العميل مسجل بالفعل في النظام بنفس رقم الهاتف باسم "${existingDuplicate.fullName}" (مسؤول المبيعات: ${ownerName})`
      );
    }

    const defaultAssignee =
      activeRole?.permissions?.leads?.add === 'own' || !body.assignedTo
        ? activeUser.id
        : body.assignedTo;
    const targetAgent = snap.users.find((u: any) => u.id === defaultAssignee) || activeUser;
    const nowIso = new Date().toISOString();
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newLead = {
      id: leadId,
      fullName: String(body.fullName || '').trim(),
      phone: String(body.phone || '').trim(),
      phoneNormalized: normalizePhone(String(body.phone || '')),
      secondaryPhone: body.secondaryPhone ? String(body.secondaryPhone).trim() : '',
      email: body.email || '',
      source: body.source || 'Direct Call',
      campaignName: body.campaignName || '',
      formResponses: Array.isArray(body.formResponses) ? body.formResponses : [],
      projectInterest: body.projectInterest || DEFAULT_PROJECTS[0],
      propertyType: body.propertyType || body.unitType || 'Villa',
      budgetMin: Number(body.budgetMin) || 0,
      budgetMax: Number(body.budgetMax || body.budgetEgp) || 0,
      status: normalizeLeadStatus(body.status || 'Fresh Lead'),
      priority: body.priority || 'Warm',
      assignedTo: defaultAssignee,
      assignedBy: activeUser.id,
      observerIds: Array.isArray(body.observerIds) ? body.observerIds : [],
      notes: body.notes || '',
      nextFollowUpAt: body.nextFollowUpAt || nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
      activities: [
        {
          id: `act_${Date.now()}`,
          leadId,
          type: 'created',
          summary: `تمت إضافة العميل يدوياً وتعيينه إلى ${targetAgent?.fullName || activeUser.fullName}`,
          createdAt: nowIso,
          userId: activeUser.id,
          userName: activeUser.fullName,
        },
      ],
    };
    snap.leads = [newLead, ...(snap.leads || [])];
    await persistState(snap);
    return { lead: newLead };
  }

  if (pathname === '/api/leads/transfer' && method === 'POST') {
    const { leadIds, fromUserId, toUserId, count, statusFilter, projectFilter, reason } = body;
    if (!toUserId) {
      throw new Error('يرجى اختيار مسؤول المبيعات المستلم');
    }
    const targetUser = snap.users.find((u: any) => u.id === toUserId);
    if (!targetUser) {
      throw new Error('مسؤول المبيعات المستلم غير موجود');
    }

    let idsToTransfer: Set<string>;
    if (Array.isArray(leadIds) && leadIds.length > 0) {
      idsToTransfer = new Set(leadIds.map((id: any) => String(id)));
    } else if (fromUserId) {
      let candidates = (snap.leads || []).filter((l: any) => {
        if (l.assignedTo !== fromUserId) return false;
        if (
          statusFilter &&
          statusFilter !== 'ALL' &&
          normalizeLeadStatus(l.status) !== normalizeLeadStatus(statusFilter)
        )
          return false;
        if (projectFilter && projectFilter !== 'ALL' && l.projectInterest !== projectFilter) return false;
        return true;
      });
      const parsedCount = Number(count);
      if (parsedCount > 0 && parsedCount < candidates.length) {
        candidates = candidates.slice(0, parsedCount);
      }
      idsToTransfer = new Set(candidates.map((l: any) => String(l.id)));
    } else {
      idsToTransfer = new Set();
    }

    if (idsToTransfer.size === 0) {
      throw new Error('لا توجد ليدز محددة لنقلها');
    }

    const nowIso = new Date().toISOString();
    let actualTransferred = 0;
    let firstTransferredLeadId: string | undefined;

    snap.leads = (snap.leads || []).map((l: any) => {
      if (!idsToTransfer.has(String(l.id))) return l;
      actualTransferred++;
      if (!firstTransferredLeadId) firstTransferredLeadId = l.id;
      const oldUser = snap.users.find((u: any) => u.id === l.assignedTo);
      return {
        ...l,
        assignedTo: toUserId,
        assignedBy: activeUser.id,
        updatedAt: nowIso,
        activities: [
          {
            id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            leadId: l.id,
            type: 'transfer',
            summary:
              `نقل الليد من (${oldUser?.fullName || 'غير معين'}) إلى (${targetUser?.fullName || 'مسؤول المبيعات'}) بواسطة ${activeUser.fullName}` +
              (reason ? ` — السبب: ${reason}` : ''),
            createdAt: nowIso,
            userId: activeUser.id,
            userName: activeUser.fullName,
          },
          ...(l.activities || []),
        ],
      };
    });

    if (actualTransferred > 0) {
      snap.notifications = [
        {
          id: `notif_${Date.now()}_bulk`,
          userId: toUserId,
          title: `${actualTransferred} Lead(s) Transferred to You`,
          titleAr: `تم نقل ${actualTransferred} ليدز إلى حسابك فوراً`,
          message: `${activeUser.fullName} transferred ${actualTransferred} lead(s) to your pipeline.${reason ? ` Note: ${reason}` : ''}`,
          messageAr: `قام ${activeUser.fullName} بنقل ${actualTransferred} عميل إلى قائمة مبيعاتك للمتابعة الفورية.${reason ? ` ملاحظة الإدارة: ${reason}` : ''}`,
          type: 'lead_transferred',
          relatedLeadId: firstTransferredLeadId,
          isRead: false,
          createdAt: nowIso,
        },
        ...(snap.notifications || []),
      ];
    }

    await persistState(snap);
    return { transferredCount: actualTransferred, toUser: targetUser?.fullName };
  }

  if (pathname === '/api/leads/auto-distribute' && method === 'POST') {
    const {
      targetUserIds,
      leadIds,
      statusFilter = 'Fresh Lead',
      onlyUnassignedOrAdmin = true,
      autoDistributionEnabled,
      saveRoutingSettings = true,
    } = body || {};

    let selectedIds: string[] = Array.isArray(targetUserIds)
      ? targetUserIds.map((id: any) => String(id)).filter(Boolean)
      : [];

    if (selectedIds.length === 0) {
      const connIds = snap.sheetConnections?.[0]?.selectedSalesUserIds;
      if (Array.isArray(connIds) && connIds.length > 0) {
        selectedIds = connIds;
      } else {
        selectedIds = (snap.users || [])
          .filter(
            (u: any) =>
              u.isActiveForRouting &&
              (u.roleId === 'role_employee' ||
                u.roleId === 'role_supervisor' ||
                u.roleId === 'role_deputy')
          )
          .map((u: any) => u.id);
      }
    }

    const targetAgents = (snap.users || []).filter((u: any) => selectedIds.includes(u.id));
    if (targetAgents.length === 0) {
      throw new Error('يرجى اختيار مسؤول مبيعات واحد على الأقل للتوزيع التلقائي');
    }

    if (saveRoutingSettings) {
      snap.users = (snap.users || []).map((u: any) => {
        if (
          u.roleId === 'role_employee' ||
          u.roleId === 'role_supervisor' ||
          u.roleId === 'role_deputy'
        ) {
          return { ...u, isActiveForRouting: selectedIds.includes(u.id) };
        }
        return u;
      });
      if (Array.isArray(snap.sheetConnections) && snap.sheetConnections.length > 0) {
        snap.sheetConnections = snap.sheetConnections.map((c: any) => ({
          ...c,
          selectedSalesUserIds: selectedIds,
          ...(typeof autoDistributionEnabled === 'boolean'
            ? { autoDistributionEnabled }
            : {}),
        }));
      }
    }

    const adminUserIds = new Set(
      (snap.users || [])
        .filter(
          (u: any) =>
            u.roleId === 'role_admin' ||
            u.id === 'usr_admin' ||
            u.id === 'usr_admin2' ||
            String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
        )
        .map((u: any) => u.id)
    );

    const explicitIdSet =
      Array.isArray(leadIds) && leadIds.length > 0
        ? new Set(leadIds.map((id: any) => String(id)))
        : null;

    const matchingIds = new Set<string>();
    (snap.leads || []).forEach((l: any) => {
      if (explicitIdSet) {
        if (explicitIdSet.has(String(l.id))) matchingIds.add(String(l.id));
        return;
      }
      const normStatus = normalizeLeadStatus(l.status);
      if (statusFilter && statusFilter !== 'ALL' && normStatus !== normalizeLeadStatus(statusFilter)) {
        return;
      }
      if (onlyUnassignedOrAdmin) {
        const isUnassignedOrAdmin =
          !l.assignedTo ||
          adminUserIds.has(l.assignedTo) ||
          !(snap.users || []).some((u: any) => u.id === l.assignedTo);
        if (!isUnassignedOrAdmin) return;
      }
      matchingIds.add(String(l.id));
    });

    if (matchingIds.size === 0) {
      if (saveRoutingSettings) {
        await persistState(snap);
      }
      throw new Error('لا توجد ليدز مطابقة لشروط التوزيع المحددة حالياً');
    }

    const nowIso = new Date().toISOString();
    let rrIndex = 0;
    const assignmentsCounter: Record<
      string,
      { userId: string; userName: string; count: number; firstLeadId?: string }
    > = {};

    snap.leads = (snap.leads || []).map((l: any) => {
      if (!matchingIds.has(String(l.id))) return l;
      const agent = targetAgents[rrIndex % targetAgents.length];
      rrIndex++;
      const oldOwner = (snap.users || []).find((u: any) => u.id === l.assignedTo);

      if (!assignmentsCounter[agent.id]) {
        assignmentsCounter[agent.id] = {
          userId: agent.id,
          userName: agent.fullName,
          count: 0,
          firstLeadId: l.id,
        };
      }
      assignmentsCounter[agent.id].count++;

      return {
        ...l,
        status: normalizeLeadStatus(l.status),
        assignedTo: agent.id,
        assignedBy: activeUser.id,
        updatedAt: nowIso,
        activities: [
          {
            id: `act_${Date.now()}_${rrIndex}_${Math.random().toString(36).slice(2, 6)}`,
            leadId: l.id,
            type: 'transfer',
            summary: `تم التوزيع الأوتوماتيكي بالتساوي (Round-Robin) من (${
              oldOwner?.fullName || 'غير معين'
            }) إلى (${agent.fullName}) بواسطة ${activeUser.fullName}`,
            createdAt: nowIso,
            userId: activeUser.id,
            userName: activeUser.fullName,
          },
          ...(l.activities || []),
        ],
      };
    });

    const newNotifications = Object.values(assignmentsCounter)
      .filter((entry) => entry.count > 0)
      .map((entry) => ({
        id: `notif_autodist_${Date.now()}_${entry.userId}`,
        userId: entry.userId,
        title: `${entry.count} Lead(s) Auto-Distributed to You`,
        titleAr: `تم توزيع ${entry.count} عميل جديد إلى حسابك تلقائياً`,
        message: `${activeUser.fullName} distributed ${entry.count} lead(s) to your pipeline via Round-Robin.`,
        messageAr: `قام ${activeUser.fullName} بتوزيع ${entry.count} عميل على حسابك بالتساوي (Round-Robin) للمتابعة الفورية.`,
        type: 'lead_transferred',
        relatedLeadId: entry.firstLeadId,
        isRead: false,
        createdAt: nowIso,
      }));

    if (newNotifications.length > 0) {
      snap.notifications = [...newNotifications, ...(snap.notifications || [])];
    }

    await persistState(snap);
    return {
      distributedCount: rrIndex,
      assignmentsSummary: Object.values(assignmentsCounter).map(({ userId, userName, count }) => ({
        userId,
        userName,
        count,
      })),
      autoDistributionEnabled:
        typeof autoDistributionEnabled === 'boolean'
          ? autoDistributionEnabled
          : Boolean(snap.sheetConnections?.[0]?.autoDistributionEnabled),
      selectedSalesUserIds: selectedIds,
    };
  }

  if (pathname.startsWith('/api/leads/') && pathname.endsWith('/activities') && method === 'POST') {
    const leadId = pathname.split('/')[3];
    const leadIdx = (snap.leads || []).findIndex((l: any) => l.id === leadId);
    if (leadIdx === -1) throw new Error('العميل غير موجود');
    const nowIso = new Date().toISOString();
    const act = {
      id: `act_${Date.now()}`,
      leadId,
      type: body.type || 'note',
      summary: body.summary || '',
      createdAt: nowIso,
      userId: activeUser.id,
      userName: activeUser.fullName,
    };
    snap.leads[leadIdx].activities = [act, ...(snap.leads[leadIdx].activities || [])];
    snap.leads[leadIdx].lastContactedAt = nowIso;
    snap.leads[leadIdx].updatedAt = nowIso;
    if (body.newStatus) {
      const normalizedSt = normalizeLeadStatus(body.newStatus);
      snap.leads[leadIdx].status = normalizedSt;
      const targetLead = snap.leads[leadIdx];
      if (
        normalizedSt === 'Contracted' &&
        !(snap.deals || []).some((d: any) => d.leadId === targetLead.id)
      ) {
        snap.deals = [
          {
            id: `deal_${Date.now()}`,
            title: `تعاقد ${targetLead.propertyType || 'Villa'} ${targetLead.projectInterest} - ${targetLead.fullName}`,
            leadId: targetLead.id,
            leadName: targetLead.fullName,
            propertyId: '',
            propertyName: `${targetLead.propertyType || 'Villa'} · ${targetLead.projectInterest}`,
            projectName: targetLead.projectInterest,
            assignedTo: targetLead.assignedTo,
            stage: 'Closed Won',
            dealValue: Number(targetLead.budgetMax || targetLead.budgetEgp) || 0,
            commissionPercent: 2.5,
            expectedCloseDate: nowIso.slice(0, 10),
            createdAt: nowIso,
          },
          ...(snap.deals || []),
        ];
      }
    }
    await persistState(snap);
    return { lead: snap.leads[leadIdx], activity: act };
  }

  if (pathname.startsWith('/api/leads/') && method === 'PUT') {
    const leadId = pathname.split('/')[3];
    const idx = (snap.leads || []).findIndex((l: any) => l.id === leadId);
    if (idx === -1) throw new Error('العميل غير موجود');
    const existingLead = snap.leads[idx];

    if (body.phone !== undefined || body.secondaryPhone !== undefined) {
      const nextPhone =
        body.phone !== undefined ? String(body.phone) : String(existingLead.phone || '');
      const nextSecondary =
        body.secondaryPhone !== undefined
          ? String(body.secondaryPhone)
          : String(existingLead.secondaryPhone || '');
      const keyPrimary = getPhoneMatchKey(nextPhone);
      const keySecondary = nextSecondary ? getPhoneMatchKey(nextSecondary) : '';
      const checkKeys = [keyPrimary, keySecondary].filter((k) => k.length >= 8);

      if (checkKeys.length > 0) {
        const duplicateLead = (snap.leads || []).find((existing: any) => {
          if (existing.id === leadId) return false;
          const exPrimary = getPhoneMatchKey(String(existing.phone || ''));
          const exSecondary = existing.secondaryPhone
            ? getPhoneMatchKey(String(existing.secondaryPhone))
            : '';
          return checkKeys.some(
            (key) => (exPrimary && exPrimary === key) || (exSecondary && exSecondary === key)
          );
        });

        if (duplicateLead) {
          const owner = (snap.users || []).find((u: any) => u.id === duplicateLead.assignedTo);
          const ownerName = owner?.fullName || 'غير معين';
          throw new Error(
            `هذا العميل مسجل بالفعل في النظام بنفس رقم الهاتف باسم "${duplicateLead.fullName}" (مسؤول المبيعات: ${ownerName})`
          );
        }
      }
    }

    const nowIso = new Date().toISOString();
    let updatedActivities = Array.isArray(existingLead.activities) ? [...existingLead.activities] : [];

    if (body.assignedTo && body.assignedTo !== existingLead.assignedTo) {
      const oldOwner = snap.users.find((u: any) => u.id === existingLead.assignedTo);
      const newOwner = snap.users.find((u: any) => u.id === body.assignedTo);
      updatedActivities = [
        {
          id: `act_${Date.now()}_tr`,
          leadId,
          type: 'transfer',
          summary: `تم نقل العميل من (${oldOwner?.fullName || 'غير معين'}) إلى (${newOwner?.fullName || 'مسؤول المبيعات'}) بواسطة ${activeUser.fullName}`,
          createdAt: nowIso,
          userId: activeUser.id,
          userName: activeUser.fullName,
        },
        ...updatedActivities,
      ];
    }

    const nextNormalizedStatus =
      body.status !== undefined
        ? normalizeLeadStatus(body.status)
        : normalizeLeadStatus(existingLead.status);

    snap.leads[idx] = {
      ...existingLead,
      ...body,
      status: nextNormalizedStatus,
      ...(body.phone !== undefined ? { phoneNormalized: normalizePhone(String(body.phone)) } : {}),
      activities: updatedActivities,
      updatedAt: nowIso,
    };

    if (
      nextNormalizedStatus === 'Contracted' &&
      !(snap.deals || []).some((d: any) => d.leadId === leadId)
    ) {
      const updatedLead = snap.leads[idx];
      snap.deals = [
        {
          id: `deal_${Date.now()}`,
          title: `تعاقد ${updatedLead.propertyType || 'Villa'} ${updatedLead.projectInterest} - ${updatedLead.fullName}`,
          leadId: updatedLead.id,
          leadName: updatedLead.fullName,
          propertyId: '',
          propertyName: `${updatedLead.propertyType || 'Villa'} · ${updatedLead.projectInterest}`,
          projectName: updatedLead.projectInterest,
          assignedTo: updatedLead.assignedTo,
          stage: 'Closed Won',
          dealValue: Number(updatedLead.budgetMax || updatedLead.budgetEgp) || 0,
          commissionPercent: 2.5,
          expectedCloseDate: nowIso.slice(0, 10),
          createdAt: nowIso,
        },
        ...(snap.deals || []),
      ];
    }

    await persistState(snap);
    return { lead: snap.leads[idx] };
  }

  if (pathname.startsWith('/api/leads/') && method === 'DELETE') {
    const leadId = pathname.split('/')[3];
    snap.leads = (snap.leads || []).filter((l: any) => l.id !== leadId);
    await persistState(snap);
    return { ok: true };
  }

  // 7. Users CRUD (Directly persisted to Firebase Firestore `users` collection + `crm_state/workspace`)
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
    const cleanPass = String(body.password).trim();
    const digest = await computeSha256Hex(
      `propsphere_auth:${cleanUsername}:${cleanPass}`
    );
    const newUser = {
      id: body.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      accessPassword: cleanPass,
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
    if (isCloudStoreTestMode) {
      await persistState(snap);
    } else {
      await Promise.all([saveFirestoreUser(newUser), persistState(snap)]);
    }
    return { user: newUser };
  }

  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const userId = pathname.split('/')[3];
    const idx = snap.users.findIndex((u: any) => u.id === userId);
    if (idx === -1) throw new Error('المستخدم غير موجود');
    const existing = { ...snap.users[idx], ...body };
    if (body.username) {
      existing.username = String(body.username).trim().toLowerCase();
    }
    if (body.password && String(body.password).trim()) {
      const cleanNewPass = String(body.password).trim();
      existing.accessPassword = cleanNewPass;
      existing.clientAuthDigest = await computeSha256Hex(
        `propsphere_auth:${String(existing.username).toLowerCase()}:${cleanNewPass}`
      );
    }
    delete existing.password;
    snap.users[idx] = existing;
    if (isCloudStoreTestMode) {
      await persistState(snap);
    } else {
      await Promise.all([saveFirestoreUser(existing), persistState(snap)]);
    }
    return { user: existing };
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const userId = pathname.split('/')[3];
    snap.users = snap.users.filter((u: any) => u.id !== userId);
    if (isCloudStoreTestMode) {
      await persistState(snap);
    } else {
      await Promise.all([removeFirestoreUser(userId), persistState(snap)]);
    }
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
    await persistState(snap);
    return { deal };
  }

  if (pathname.startsWith('/api/deals/') && method === 'PUT') {
    const dealId = pathname.split('/')[3];
    const idx = (snap.deals || []).findIndex((d: any) => d.id === dealId);
    if (idx !== -1) {
      snap.deals[idx] = { ...snap.deals[idx], ...body };
      await persistState(snap);
      return { deal: snap.deals[idx] };
    }
  }

  if (pathname === '/api/projects-catalog' && method === 'GET') {
    return snap.projectsCatalog || [];
  }

  if (pathname === '/api/projects-catalog' && method === 'POST') {
    const nowIso = new Date().toISOString();
    const cleanName =
      String(body.name || '').trim() ||
      `مشروع عقاري جديد #${((snap.projectsCatalog || []).length + 1)}`;
    const newProject = {
      id: body.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      developer: body.developer ? String(body.developer).trim() : '',
      location: body.location ? String(body.location).trim() : '',
      projectType: body.projectType || 'Residential',
      unitTypes: Array.isArray(body.unitTypes) ? body.unitTypes : [],
      areaMinSqm: body.areaMinSqm !== undefined && body.areaMinSqm !== '' ? Number(body.areaMinSqm) : undefined,
      areaMaxSqm: body.areaMaxSqm !== undefined && body.areaMaxSqm !== '' ? Number(body.areaMaxSqm) : undefined,
      priceMin: body.priceMin !== undefined && body.priceMin !== '' ? Number(body.priceMin) : undefined,
      priceMax: body.priceMax !== undefined && body.priceMax !== '' ? Number(body.priceMax) : undefined,
      pricePerSqm: body.pricePerSqm !== undefined && body.pricePerSqm !== '' ? Number(body.pricePerSqm) : undefined,
      downPaymentPercent:
        body.downPaymentPercent !== undefined && body.downPaymentPercent !== ''
          ? Number(body.downPaymentPercent)
          : undefined,
      installmentYears:
        body.installmentYears !== undefined && body.installmentYears !== ''
          ? Number(body.installmentYears)
          : undefined,
      deliveryDate: body.deliveryDate ? String(body.deliveryDate).trim() : '',
      finishingType: body.finishingType ? String(body.finishingType).trim() : '',
      commissionPercent:
        body.commissionPercent !== undefined && body.commissionPercent !== ''
          ? Number(body.commissionPercent)
          : undefined,
      maintenancePercent:
        body.maintenancePercent !== undefined && body.maintenancePercent !== ''
          ? Number(body.maintenancePercent)
          : undefined,
      brochureUrl: body.brochureUrl ? String(body.brochureUrl).trim() : '',
      masterPlanImageUrl: body.masterPlanImageUrl ? String(body.masterPlanImageUrl).trim() : '',
      facilities: body.facilities ? String(body.facilities).trim() : '',
      sellingPoints: body.sellingPoints ? String(body.sellingPoints).trim() : '',
      notes: body.notes ? String(body.notes).trim() : '',
      status: body.status || 'Active',
      createdAt: nowIso,
    };
    snap.projectsCatalog = [newProject, ...(snap.projectsCatalog || [])];
    if (!Array.isArray(snap.projects)) {
      snap.projects = [...DEFAULT_PROJECTS];
    }
    if (!snap.projects.includes(cleanName)) {
      snap.projects.push(cleanName);
    }
    await persistState(snap);
    return { project: newProject, projects: snap.projects, projectsCatalog: snap.projectsCatalog };
  }

  if (pathname.startsWith('/api/projects-catalog/') && method === 'PUT') {
    const projId = pathname.split('/')[3];
    const idx = (snap.projectsCatalog || []).findIndex((p: any) => p.id === projId);
    if (idx === -1) throw new Error('المشروع غير موجود');
    const prevName = snap.projectsCatalog[idx].name;
    const updatedName =
      body.name !== undefined && String(body.name).trim()
        ? String(body.name).trim()
        : prevName;
    snap.projectsCatalog[idx] = {
      ...snap.projectsCatalog[idx],
      ...body,
      id: projId,
      name: updatedName,
    };
    if (!Array.isArray(snap.projects)) {
      snap.projects = [...DEFAULT_PROJECTS];
    }
    if (updatedName && !snap.projects.includes(updatedName)) {
      snap.projects.push(updatedName);
    }
    await persistState(snap);
    return {
      project: snap.projectsCatalog[idx],
      projects: snap.projects,
      projectsCatalog: snap.projectsCatalog,
    };
  }

  if (pathname.startsWith('/api/projects-catalog/') && method === 'DELETE') {
    const projId = pathname.split('/')[3];
    snap.projectsCatalog = (snap.projectsCatalog || []).filter((p: any) => p.id !== projId);
    await persistState(snap);
    return { ok: true, projectsCatalog: snap.projectsCatalog };
  }

  if (pathname === '/api/properties' && method === 'POST') {
    const property = {
      id: `prop_${Date.now()}`,
      code: body.code || `UNIT-${Date.now().toString().slice(-4)}`,
      title: body.title || body.titleAr || 'New Property Unit',
      titleAr: body.titleAr || body.title || 'وحدة عقارية جديدة',
      projectName: body.projectName || snap.projects?.[0] || DEFAULT_PROJECTS[0],
      developer: body.developer || '',
      location: body.location || '',
      type: body.type || 'Apartment',
      areaSqm: Number(body.areaSqm) || 0,
      bedrooms: Number(body.bedrooms) || 0,
      bathrooms: Number(body.bathrooms) || 0,
      price: Number(body.price) || 0,
      downPaymentPercent: Number(body.downPaymentPercent) || 0,
      installmentYears: Number(body.installmentYears) || 0,
      status: body.status || 'Available',
      deliveryYear: Number(body.deliveryYear) || new Date().getFullYear(),
    };
    snap.properties = [property, ...(snap.properties || [])];
    if (property.projectName && Array.isArray(snap.projects) && !snap.projects.includes(property.projectName)) {
      snap.projects.push(property.projectName);
    }
    await persistState(snap);
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
    await persistState(snap);
    return { event };
  }

  if (pathname.startsWith('/api/events/') && method === 'PUT') {
    const evtId = pathname.split('/')[3];
    const idx = (snap.events || []).findIndex((e: any) => e.id === evtId);
    if (idx !== -1) {
      snap.events[idx] = { ...snap.events[idx], ...body };
      await persistState(snap);
      return { event: snap.events[idx] };
    }
  }

  if (pathname === '/api/roles/matrix' && method === 'PUT') {
    if (Array.isArray(body.roles)) {
      snap.roles = body.roles;
      await persistState(snap);
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
    await persistState(snap);
    return { role };
  }

  if (
    (pathname === '/api/reports/daily' || pathname === '/api/reports/daily-employees') &&
    method === 'GET'
  ) {
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
        ['Interested', 'Inspection', 'Visit', 'Reservation', 'Contracted'].includes(
          normalizeLeadStatus(l.status)
        )
      ).length;
      const wonLeads = agentLeads.filter(
        (l: any) => normalizeLeadStatus(l.status) === 'Contracted'
      );
      const wonRevenue = wonLeads.reduce(
        (sum: number, l: any) => sum + (Number(l.budgetMax || l.budgetEgp) || 0),
        0
      );
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
        callsToday: agentLeads.reduce(
          (sum: number, l: any) =>
            sum +
            (l.activities || []).filter(
              (a: any) =>
                a.type === 'call' &&
                String(a.createdAt || a.timestamp || '').startsWith(dateFilter)
            ).length,
          0
        ),
        whatsappToday: agentLeads.reduce(
          (sum: number, l: any) =>
            sum +
            (l.activities || []).filter(
              (a: any) =>
                a.type === 'whatsapp' &&
                String(a.createdAt || a.timestamp || '').startsWith(dateFilter)
            ).length,
          0
        ),
        visitsScheduledToday: agentLeads.reduce(
          (sum: number, l: any) =>
            sum +
            (l.activities || []).filter(
              (a: any) =>
                a.type === 'visit' &&
                String(a.createdAt || a.timestamp || '').startsWith(dateFilter)
            ).length,
          0
        ),
        qualifiedCount,
        wonDealsCount: wonLeads.length,
        wonRevenue,
        conversionRate:
          agentLeads.length > 0 ? Math.round((qualifiedCount / agentLeads.length) * 100) : 0,
        avgResponseMinutes: 5,
      };
    });
    const projectBreakdown = visibleLeads.reduce<Record<string, number>>((acc, l: any) => {
      const p = l.projectInterest || DEFAULT_PROJECTS[0];
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});
    return { date: dateFilter, agentStats, projectBreakdown };
  }

  if (pathname.startsWith('/api/sheets/connections/') && method === 'PUT') {
    const connId = pathname.split('/')[4];
    const idx = (snap.sheetConnections || []).findIndex((c: any) => c.id === connId);
    if (idx !== -1) {
      snap.sheetConnections[idx] = { ...snap.sheetConnections[idx], ...body };
      await persistState(snap);
      return { connection: snap.sheetConnections[idx] };
    }
  }

  if (pathname === '/api/sheets/sync' && method === 'POST') {
    const seenPhonesInSystemAndBatch = new Set<string>();
    (snap.leads || []).forEach((existingLead: any) => {
      const pKey = getPhoneMatchKey(String(existingLead.phone || ''));
      if (pKey.length >= 8) seenPhonesInSystemAndBatch.add(pKey);
      if (existingLead.secondaryPhone) {
        const sKey = getPhoneMatchKey(String(existingLead.secondaryPhone));
        if (sKey.length >= 8) seenPhonesInSystemAndBatch.add(sKey);
      }
    });

    const primaryConn =
      (snap.sheetConnections || []).find((c: any) => c.id === body?.connectionId) ||
      snap.sheetConnections?.[0];
    const isAutoDistEnabled = Boolean(primaryConn?.autoDistributionEnabled);
    const configuredSalesIds: string[] = Array.isArray(primaryConn?.selectedSalesUserIds)
      ? primaryConn.selectedSalesUserIds
      : [];
    const activeSalesAgents = isAutoDistEnabled
      ? configuredSalesIds.length > 0
        ? (snap.users || []).filter((u: any) => configuredSalesIds.includes(u.id))
        : (snap.users || []).filter(
            (u: any) =>
              u.isActiveForRouting &&
              (u.roleId === 'role_employee' ||
                u.roleId === 'role_supervisor' ||
                u.roleId === 'role_deputy')
          )
      : [];

    if (body?.csvText && typeof body.csvText === 'string') {
      const lines = body.csvText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((l: string) => l.trim().length > 0);
      const headerCols = (lines[0] || '')
        .split(',')
        .map((c: string) => c.replace(/^"|"$/g, '').trim().toLowerCase());
      const detectedNameIdx = headerCols.findIndex((h: string) =>
        ['الاسم', 'اسم العميل', 'full_name', 'fullname', 'name'].includes(h)
      );
      const detectedPhoneIdx = headerCols.findIndex((h: string) =>
        ['رقم التليفون', 'التليفون', 'الهاتف', 'رقم الهاتف', 'phone', 'phone_number'].includes(h)
      );
      const nameColIdx = detectedNameIdx !== -1 ? detectedNameIdx : 0;
      const phoneColIdx = detectedPhoneIdx !== -1 ? detectedPhoneIdx : 1;

      const dataRows = lines.slice(1);
      let newLeadsImported = 0;
      let duplicatesSkipped = 0;
      const nowIso = new Date().toISOString();
      const hassanAdmin =
        snap.users.find(
          (u: any) =>
            u.id === 'usr_admin2' ||
            String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
        ) || activeUser;

      const assignmentsCounter: Record<string, { userId: string; userName: string; count: number }> =
        {};

      dataRows.forEach((line: string, rowIndex: number) => {
        const cols = line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        const fullName = cols[nameColIdx] || '';
        const rawPhone = cols[phoneColIdx] || '';
        const phoneKey = getPhoneMatchKey(rawPhone);
        if (!fullName || phoneKey.length < 8) return;
        if (seenPhonesInSystemAndBatch.has(phoneKey)) {
          duplicatesSkipped++;
          return;
        }
        seenPhonesInSystemAndBatch.add(phoneKey);
        const leadId = `lead_${Date.now()}_${rowIndex}`;

        const assignedUser =
          activeSalesAgents.length > 0
            ? activeSalesAgents[newLeadsImported % activeSalesAgents.length]
            : hassanAdmin || activeUser;

        if (!assignmentsCounter[assignedUser.id]) {
          assignmentsCounter[assignedUser.id] = {
            userId: assignedUser.id,
            userName: assignedUser.fullName,
            count: 0,
          };
        }
        assignmentsCounter[assignedUser.id].count++;

        snap.leads.unshift({
          id: leadId,
          fullName,
          phone: rawPhone,
          phoneNormalized: phoneKey,
          email: '',
          source: 'Google Drive - شيت CRM1',
          campaignName: 'CRM1_Lead_Form',
          projectInterest: DEFAULT_PROJECTS[0],
          propertyType: 'Villa',
          budgetMin: 0,
          budgetMax: 0,
          status: 'Fresh Lead',
          priority: 'High',
          assignedTo: assignedUser.id,
          assignedBy: activeUser.id,
          notes: '',
          formResponses: [],
          nextFollowUpAt: nowIso.slice(0, 10),
          createdAt: nowIso,
          updatedAt: nowIso,
          activities: [
            {
              id: `act_${Date.now()}_${rowIndex}`,
              leadId,
              type: 'sheet_import',
              summary: `تم استيراد العميل من الشيت بدون تكرار وتوجيهه إلى ${assignedUser.fullName}`,
              createdAt: nowIso,
              userId: activeUser.id,
              userName: activeUser.fullName,
            },
          ],
        });
        newLeadsImported++;
      });

      await persistState(snap);
      return {
        newLeadsImported,
        duplicatesSkipped,
        totalRowsScanned: dataRows.length,
        assignmentsSummary: Object.values(assignmentsCounter),
      };
    }

    return {
      newLeadsImported: 0,
      duplicatesSkipped: seenPhonesInSystemAndBatch.size,
      totalRowsScanned: (snap.leads || []).length,
    };
  }

  if (pathname === '/api/notifications/read-all' && method === 'PUT') {
    snap.notifications = (snap.notifications || []).map((n: any) => ({ ...n, isRead: true }));
    await persistState(snap);
    return { ok: true };
  }

  return { ok: true };
}
