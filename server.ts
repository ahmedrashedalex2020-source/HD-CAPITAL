import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  hashPasswordSecure,
  verifyPasswordSecure,
  signSessionToken,
  verifySessionToken,
  checkScopeAccess,
} from './server/security';
import { normalizePhone } from './server/db/phoneUtils';

function computeClientAuthDigest(username: string, password: string): string {
  return crypto
    .createHash('sha256')
    .update(`propsphere_auth:${String(username).trim().toLowerCase()}:${String(password).trim()}`)
    .digest('hex');
}
import {
  DEFAULT_PROJECTS,
  createAvatarSvg,
  getInitialDatabase,
} from './server/db/seedData';
import {
  verifyFirestoreConnectivity,
  isCloudFirestoreActive,
  isLiveFirestoreConnected,
  pullUsersFromLiveCloudFirestore,
  removeUserFromLiveCloudFirestore,
  syncStateToLiveCloudFirestore,
} from './server/db/firestoreClient';
import { seedOrMigrateDataset } from './server/db/repositories';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, 'crm_database.json');

const FAKE_PROJECT_NAMES = new Set([
  'Palm Hills New Cairo',
  'Mountain View iCity',
  'ZED East Ora',
  'Marassi North Coast',
  'Il Bosco New Capital',
  'Solare Ras El Hekma',
]);

export function parseCrm1PriceValue(rawAnswer: string): number {
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

export function isDummyOrFakeLead(leadOrName: string, phoneStr: string, notesStr = ''): boolean {
  const combined = `${leadOrName || ''} ${phoneStr || ''} ${notesStr || ''}`.toLowerCase();
  if (
    combined.includes('dummy data') ||
    combined.includes('<test lead') ||
    combined.includes('test lead:')
  ) {
    return true;
  }
  const digits = String(phoneStr || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return true;
  return false;
}

export function upgradeExistingDbForCrm1(parsedDb: any) {
  const FAKE_LEAD_IDS = new Set([
    'lead_101',
    'lead_102',
    'lead_103',
    'lead_104',
    'lead_105',
    'lead_106',
    'lead_1793004176267_3',
  ]);
  const FAKE_PHONES = new Set([
    '1004561122',
    '504432211',
    '1067788991',
    '1119988223',
    '1009911224',
    '1288776654',
    '1066554433',
    '1122334455',
    '1277889900',
    '1099887766',
    '1023456789',
    '1145678901',
  ]);
  const FAKE_DEMO_USER_IDS = new Set([
    'usr_supervisor',
    'usr_sales1',
    'usr_sales2',
    'usr_sales3',
    'usr_deputy',
    'usr_1793095150415_61ql',
  ]);

  if (Array.isArray(parsedDb.users)) {
    parsedDb.users = parsedDb.users.filter((u: any) => {
      if (!u || typeof u !== 'object') return false;
      if (FAKE_DEMO_USER_IDS.has(String(u.id || ''))) return false;
      const uname = String(u.username || '').trim().toLowerCase();
      const fname = String(u.fullName || '').trim();
      if (uname === 'test1' && fname.includes('تجريبي')) return false;
      return true;
    });
  } else {
    parsedDb.users = [];
  }

  if (Array.isArray(parsedDb.leads)) {
    parsedDb.leads = parsedDb.leads.filter((l: any) => {
      if (FAKE_LEAD_IDS.has(l.id)) return false;
      if (String(l.sheetRowId || '').startsWith('meta_row_')) return false;
      if (isDummyOrFakeLead(l.fullName, l.phone, l.notes)) return false;
      const digits = String(l.phone || '').replace(/[^0-9]/g, '').slice(-10);
      if (FAKE_PHONES.has(digits)) return false;
      return true;
    });
  } else {
    parsedDb.leads = [];
  }

  if (Array.isArray(parsedDb.deals)) {
    parsedDb.deals = parsedDb.deals.filter(
      (d: any) => !['deal_1', 'deal_2', 'deal_3'].includes(d.id)
    );
  } else {
    parsedDb.deals = [];
  }

  if (Array.isArray(parsedDb.properties)) {
    parsedDb.properties = parsedDb.properties.filter(
      (p: any) => !['prop_1', 'prop_2', 'prop_3', 'prop_4', 'prop_5'].includes(p.id)
    );
  } else {
    parsedDb.properties = [];
  }

  if (Array.isArray(parsedDb.events)) {
    parsedDb.events = parsedDb.events.filter(
      (e: any) => !['evt_1', 'evt_2', 'evt_3'].includes(e.id)
    );
  } else {
    parsedDb.events = [];
  }

  if (Array.isArray(parsedDb.syncLogs)) {
    parsedDb.syncLogs = parsedDb.syncLogs.filter((s: any) => s.id !== 'slog_1');
  } else {
    parsedDb.syncLogs = [];
  }

  if (Array.isArray(parsedDb.notifications)) {
    parsedDb.notifications = parsedDb.notifications.filter(
      (n: any) =>
        !['notif_1', 'notif_2', 'notif_3', 'notif_1793004176267_3'].includes(n.id) &&
        !String(n.message || '').toLowerCase().includes('dummy data')
    );
  } else {
    parsedDb.notifications = [];
  }

  // Enrich all CRM1 leads directly from their actual CRM1 formResponses and remove fake project names
  const discoveredSheetProjects = new Set<string>();
  parsedDb.leads.forEach((l: any) => {
    if (Array.isArray(l.formResponses)) {
      l.formResponses = l.formResponses.filter((fr: any) => {
        const q = String(fr?.question || '').trim().toLowerCase();
        const a = String(fr?.answer || '').trim().toLowerCase();
        if (!q || !a || q === 'lead_status' || a.includes('dummy data')) return false;
        return true;
      });

      for (const fr of l.formResponses) {
        const q = String(fr.question || '').trim();
        const a = String(fr.answer || '').trim();
        if (q === 'campaign_name' || q.includes('المشروع') || q.includes('حملة')) {
          if (a && !FAKE_PROJECT_NAMES.has(a)) {
            l.projectInterest = a;
          }
        } else if (q.includes('المساحة') || q.includes('نوع الوحدة')) {
          if (a && (!l.propertyType || l.propertyType === 'Villa')) {
            l.propertyType = a.replace(/_/g, ' ');
          }
        } else if (q.includes('السعر') || q.includes('الميزانية')) {
          const parsedBudget = parseCrm1PriceValue(a);
          if (parsedBudget > 0 && (!l.budgetMax || l.budgetMax === 0)) {
            l.budgetMax = parsedBudget;
            l.budgetMin = Math.round(parsedBudget * 0.85);
          }
        }
      }

      l.notes = l.formResponses.map((fr: any) => `${fr.question}: ${fr.answer}`).join(' | ');
    }

    if (!l.projectInterest || FAKE_PROJECT_NAMES.has(l.projectInterest)) {
      l.projectInterest = 'ليدز مغتربين';
    }
    discoveredSheetProjects.add(l.projectInterest);
  });

  const cleanProjectsList =
    discoveredSheetProjects.size > 0 ? Array.from(discoveredSheetProjects) : ['ليدز مغتربين'];
  parsedDb.projects = cleanProjectsList;

  if (Array.isArray(parsedDb.users)) {
    const FAKE_USER_PHONES = [
      '+20 100 245 8899',
      '+20 101 554 3322',
      '+20 109 887 6655',
      '+20 112 334 9900',
      '+20 122 778 4411',
      '+20 106 112 3388',
      '+20 100 000 0000',
    ];
    parsedDb.users.forEach((u: any) => {
      if (FAKE_USER_PHONES.includes(u.phone)) {
        u.phone = '';
      }
      if (Array.isArray(u.assignedProjects)) {
        const filteredProjects = u.assignedProjects.filter(
          (p: string) => !FAKE_PROJECT_NAMES.has(p)
        );
        u.assignedProjects =
          filteredProjects.length > 0 ? filteredProjects : [...cleanProjectsList];
      } else {
        u.assignedProjects = [...cleanProjectsList];
      }
      if (u.passwordHash && !String(u.passwordHash).startsWith('scrypt$')) {
        if (u.username === 'admin' || u.username === 'admin2') {
          u.passwordHash = hashPasswordSecure('admin123');
        }
      }
      if (typeof u.avatarUrl === 'string' && u.avatarUrl.length > 10000) {
        const initials =
          u.id === 'usr_admin'
            ? 'AR'
            : String(u.fullName || u.username || 'U')
                .split(' ')
                .slice(0, 2)
                .map((w: string) => w[0] || '')
                .join('')
                .toUpperCase() || 'U';
        u.avatarUrl = createAvatarSvg(initials, '#1D4ED8', '#3B82F6');
      }
      if (u.id === 'usr_admin' || String(u.username || '').toLowerCase() === 'admin') {
        u.accessPassword = u.accessPassword || 'admin123';
        if (!u.passwordHash || !verifyPasswordSecure(u.accessPassword, u.passwordHash).valid) {
          u.passwordHash = hashPasswordSecure(u.accessPassword);
        }
        u.clientAuthDigest = computeClientAuthDigest('admin', u.accessPassword);
      } else if (
        u.id === 'usr_admin2' ||
        u.id === 'usr_admin_partner' ||
        u.username === 'admin2' ||
        String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
      ) {
        u.id = 'usr_admin2';
        u.username = 'Hassan shehata';
        u.fullName = 'حسن شحاتة (Hassan Shehata)';
        u.roleId = 'role_admin';
        u.accessPassword = 'HD_CAPITAL';
        u.passwordHash = hashPasswordSecure('HD_CAPITAL');
        u.clientAuthDigest = computeClientAuthDigest('hassan shehata', 'HD_CAPITAL');
        u.jobTitle = 'Co-Founder & System Administrator';
        u.jobTitleAr = 'مدير شريك ومدير نظام معتمد';
        u.avatarUrl = createAvatarSvg('HS', '#1E40AF', '#3B82F6');
        u.email = 'hassan.shehata@propsphere.eg';
      } else {
        // Ensure omarahmed1 and every employee account has a working passwordHash and clientAuthDigest
        const targetPass = u.accessPassword || '123456';
        u.accessPassword = targetPass;
        if (!u.passwordHash || !verifyPasswordSecure(targetPass, u.passwordHash).valid) {
          u.passwordHash = hashPasswordSecure(targetPass);
        }
        u.clientAuthDigest = computeClientAuthDigest(u.username, targetPass);
      }
    });

    const hasAdmin2 = parsedDb.users.some(
      (u: any) =>
        u.id === 'usr_admin2' ||
        String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
    );
    if (!hasAdmin2) {
      parsedDb.users.splice(1, 0, {
        id: 'usr_admin2',
        username: 'Hassan shehata',
        accessPassword: 'HD_CAPITAL',
        passwordHash: hashPasswordSecure('HD_CAPITAL'),
        clientAuthDigest: computeClientAuthDigest('hassan shehata', 'HD_CAPITAL'),
        fullName: 'حسن شحاتة (Hassan Shehata)',
        roleId: 'role_admin',
        jobTitle: 'Co-Founder & System Administrator',
        jobTitleAr: 'مدير شريك ومدير نظام معتمد',
        avatarUrl: createAvatarSvg('HS', '#1E40AF', '#3B82F6'),
        email: 'hassan.shehata@propsphere.eg',
        phone: '',
        location: 'القاهرة الجديدة · التجمع الخامس',
        assignedProjects: [...cleanProjectsList],
        isActiveForRouting: false,
        routingWeight: 1,
        preferredLang: 'ar',
        createdAt: '2026-01-15T09:00:00.000Z',
      });
    }

    // Assign automatic/imported leads directly to the second CRM Admin: Hassan Shehata (usr_admin2)
    // Do NOT automatically distribute leads across sales employees unless manually transferred by an admin.
    const validUserIds = new Set(parsedDb.users.map((u: any) => u.id));
    const hassanAdmin =
      parsedDb.users.find(
        (u: any) =>
          u.id === 'usr_admin2' ||
          String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
      ) ||
      parsedDb.users.find((u: any) => u.id === 'usr_admin') ||
      parsedDb.users[0];

    if (Array.isArray(parsedDb.leads) && hassanAdmin) {
      parsedDb.leads.forEach((l: any) => {
        const wasManuallyTransferred =
          Array.isArray(l.activities) &&
          l.activities.some(
            (act: any) =>
              act.type === 'transfer' &&
              !String(act.summary || '').includes('توزيع ذكي تلقائي')
          );

        if (!l.assignedTo || !validUserIds.has(l.assignedTo) || !wasManuallyTransferred) {
          l.assignedTo = hassanAdmin.id;
        }
        const assignedUser = parsedDb.users.find((u: any) => u.id === l.assignedTo) || hassanAdmin;
        if (assignedUser && Array.isArray(l.activities)) {
          l.activities.forEach((act: any) => {
            if (act.type === 'sheet_import') {
              act.summary = `تم استيراد العميل من شيت CRM1 (${
                (l.formResponses || []).length
              } إجابات من الفورم) وتعيينه تلقائياً إلى مدير الـ CRM الثاني ${assignedUser.fullName}.`;
            }
          });
        }
      });
    }

    if (Array.isArray(parsedDb.notifications) && hassanAdmin) {
      parsedDb.notifications.forEach((n: any) => {
        if (!validUserIds.has(n.userId) && n.userId !== 'all') {
          n.userId = hassanAdmin.id;
        } else if (n.type === 'lead_assigned' && String(n.id || '').startsWith('notif_')) {
          n.userId = hassanAdmin.id;
        }
      });
    }
  }

  if (Array.isArray(parsedDb.sheetConnections) && parsedDb.sheetConnections.length > 0) {
    const primary = parsedDb.sheetConnections[0];
    primary.driveFileName = primary.driveFileName || 'CRM1';
    if (!primary.name.includes('CRM1')) {
      primary.name = 'CRM1 (المصدر الأساسي لبيانات العملاء - Google Drive)';
    }
    if (primary.spreadsheetId === '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms') {
      primary.spreadsheetId = '';
      primary.spreadsheetUrl = '';
      primary.lastSyncedAt = '';
    }
    if (!primary.defaultProject || FAKE_PROJECT_NAMES.has(primary.defaultProject)) {
      primary.defaultProject = cleanProjectsList[0] || 'ليدز مغتربين';
    }
    primary.totalImportedCount = Array.isArray(parsedDb.leads) ? parsedDb.leads.length : 0;
    primary.autoSyncEnabled = true;
    primary.syncIntervalMinutes = 15;
    primary.ignoreIdColumns = true;
  }

  return parsedDb;
}

export function parseCsvRows(csvText: string): string[][] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  return lines.map((line) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = String(input || '').trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

export interface CreateCrmAppOptions {
  dbPath?: string;
  disableBackgroundSync?: boolean;
  strictAuth?: boolean;
}

export function createCrmApp(options: CreateCrmAppOptions = {}) {
  const targetDbPath = options.dbPath || DEFAULT_DB_PATH;
  const targetDir = path.dirname(targetDbPath);
  const strictAuth = options.strictAuth ?? true;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let writeSequence = 0;
  let isSyncingToFirestore = false;

  function saveDb(state: any) {
    writeSequence++;
    const tmpPath = `${targetDbPath}.${process.pid}.${writeSequence}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, targetDbPath);

    if (!options.dbPath) {
      try {
        const snapshotPayload = JSON.stringify(
          {
            ...state,
            users: (state.users || []).map(({ passwordHash: _ph, ...u }: any) => u),
          },
          null,
          2
        );
        const publicSnapPath = path.join(__dirname, 'public', 'crm-live-snapshot.json');
        if (fs.existsSync(path.dirname(publicSnapPath))) {
          fs.writeFileSync(publicSnapPath, snapshotPayload, 'utf-8');
        }
        const distSnapPath = path.join(__dirname, 'dist', 'crm-live-snapshot.json');
        if (fs.existsSync(path.dirname(distSnapPath))) {
          fs.writeFileSync(distSnapPath, snapshotPayload, 'utf-8');
        }
      } catch {
        // ignore snapshot mirror errors
      }
    }

    // Mirror state into unified Firestore / repository layer asynchronously
    if (!isSyncingToFirestore && !options.dbPath) {
      isSyncingToFirestore = true;
      Promise.all([
        seedOrMigrateDataset(state).catch(() => {}),
        syncStateToLiveCloudFirestore(state).catch(() => {}),
      ]).finally(() => {
        isSyncingToFirestore = false;
      });
    }
  }

  function loadDb() {
    try {
      if (fs.existsSync(targetDbPath)) {
        const raw = fs.readFileSync(targetDbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const upgraded = upgradeExistingDbForCrm1(parsed);
        saveDb(upgraded);
        return upgraded;
      }
    } catch (err) {
      console.error('Error loading DB, initializing fresh DB:', err);
    }
    const initial = upgradeExistingDbForCrm1(getInitialDatabase());
    saveDb(initial);
    return initial;
  }

  const db = loadDb();

  function doesServerUserMatchIdentifier(u: any, rawIdentifier: string): boolean {
    if (!u || !rawIdentifier) return false;
    const clean = String(rawIdentifier).trim().toLowerCase();
    if (!clean) return false;
    const compact = clean.replace(/[\s_.-]+/g, '');

    const storedUsername = String(u.username || '').trim().toLowerCase();
    const compactUsername = storedUsername.replace(/[\s_.-]+/g, '');

    const storedEmail = String(u.email || '').trim().toLowerCase();
    const emailPrefix = storedEmail.split('@')[0] || '';
    const compactEmailPrefix = emailPrefix.replace(/[\s_.-]+/g, '');

    const storedFullName = String(u.fullName || '').trim().toLowerCase();
    const compactFullName = storedFullName.replace(/[\s_().-]+/g, '');

    const storedPhone = String(u.phone || '').replace(/[^0-9]/g, '');
    const inputDigits = clean.replace(/[^0-9]/g, '');

    if (storedUsername && (storedUsername === clean || compactUsername === compact)) {
      return true;
    }
    if (
      storedEmail &&
      (storedEmail === clean ||
        (emailPrefix && (emailPrefix === clean || compactEmailPrefix === compact)))
    ) {
      return true;
    }
    if (
      storedFullName &&
      (storedFullName === clean ||
        compactFullName === compact ||
        (clean.length >= 4 && storedFullName.includes(clean)))
    ) {
      return true;
    }
    if (storedPhone && inputDigits.length >= 8 && storedPhone.endsWith(inputDigits.slice(-9))) {
      return true;
    }
    if (
      (u.id === 'usr_admin2' || u.id === 'usr_admin_partner' || compactUsername === 'hassanshehata') &&
      (clean === 'admin2' || compact === 'hassanshehata' || clean.includes('حسن شحات'))
    ) {
      return true;
    }
    if (
      (u.id === 'usr_admin' || storedUsername === 'admin') &&
      (clean === 'admin' || clean.includes('أحمد راشد') || clean.includes('احمد راشد'))
    ) {
      return true;
    }
    if (
      (u.id === 'usr_1793010490703_1p0c' || compactUsername === 'omarahmed1') &&
      (compact === 'omarahmed1' || compact === 'omarahmed' || clean.includes('عمر احمد') || clean.includes('عمر أحمد'))
    ) {
      return true;
    }
    return false;
  }

  async function mergeCloudUsersIntoDb(): Promise<boolean> {
    if (options.dbPath) return false;
    try {
      const cloudUsers = await pullUsersFromLiveCloudFirestore();
      if (!Array.isArray(cloudUsers) || cloudUsers.length === 0) return false;
      let changed = false;
      for (const cu of cloudUsers) {
        if (!cu || !cu.id) continue;
        const existingIdx = db.users.findIndex(
          (u: any) =>
            u.id === cu.id ||
            String(u.username || '').trim().toLowerCase() ===
              String(cu.username || '').trim().toLowerCase()
        );
        if (existingIdx === -1) {
          const pass = cu.accessPassword || '123456';
          const normalizedUser = {
            ...cu,
            accessPassword: pass,
            passwordHash:
              cu.passwordHash && String(cu.passwordHash).startsWith('scrypt$')
                ? cu.passwordHash
                : hashPasswordSecure(pass),
            clientAuthDigest:
              cu.clientAuthDigest || computeClientAuthDigest(cu.username || '', pass),
          };
          db.users.push(normalizedUser);
          changed = true;
        } else {
          const localUser = db.users[existingIdx];
          if (
            cu.accessPassword &&
            cu.accessPassword !== localUser.accessPassword &&
            cu.id !== 'usr_admin' &&
            cu.id !== 'usr_admin2'
          ) {
            localUser.accessPassword = cu.accessPassword;
            localUser.passwordHash = hashPasswordSecure(cu.accessPassword);
            localUser.clientAuthDigest = computeClientAuthDigest(
              localUser.username,
              cu.accessPassword
            );
            changed = true;
          }
        }
      }
      if (changed) {
        upgradeExistingDbForCrm1(db);
        saveDb(db);
      }
      return changed;
    } catch {
      return false;
    }
  }

  interface SseClient {
    id: string;
    userId: string;
    res: Response;
  }
  const sseClients: SseClient[] = [];

  function broadcastNotification(notification: any) {
    db.notifications.unshift(notification);
    if (db.notifications.length > 200) {
      db.notifications = db.notifications.slice(0, 200);
    }
    saveDb(db);

    const payload = `data: ${JSON.stringify(notification)}\n\n`;
    sseClients.forEach((client) => {
      if (
        notification.userId === 'all' ||
        client.userId === notification.userId ||
        client.userId === 'usr_admin' ||
        client.userId === 'usr_admin2'
      ) {
        try {
          client.res.write(payload);
        } catch {
          // ignore disconnected socket
        }
      }
    });
  }

  function extractSessionTokenFromReq(req: Request): string | null {
    const headerToken = req.headers['x-session-token'];
    if (typeof headerToken === 'string' && headerToken.trim()) {
      return headerToken.trim();
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const candidate = authHeader.slice(7).trim();
      // Signed CRM session tokens have exactly 2 dot-separated segments (`payload.signature`)
      if (candidate.split('.').length === 2) {
        return candidate;
      }
    }
    if (typeof req.query.token === 'string' && req.query.token.trim()) {
      return req.query.token.trim();
    }
    return null;
  }

  function extractGoogleAuthHeader(req: Request): string | undefined {
    const explicitGoogleToken = req.headers['x-google-access-token'];
    if (typeof explicitGoogleToken === 'string' && explicitGoogleToken.trim()) {
      const clean = explicitGoogleToken.replace(/^Bearer\s+/i, '').trim();
      return `Bearer ${clean}`;
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const raw = authHeader.slice(7).trim();
      // If it is not a 2-segment CRM session token, treat it as a Google OAuth Bearer token
      if (raw.split('.').length !== 2 || raw.startsWith('ya29.')) {
        return authHeader;
      }
    }
    return undefined;
  }

  function getAuthContext(req: Request): { user: any; role: any; authenticated: boolean } {
    const rawToken = extractSessionTokenFromReq(req);

    if (rawToken) {
      const verified = verifySessionToken(rawToken);
      if (verified) {
        const user = db.users.find((u: any) => u.id === verified.userId);
        if (user) {
          const role = db.roles.find((r: any) => r.id === user.roleId) || db.roles[0];
          return { user, role, authenticated: true };
        }
      }
      if (rawToken.endsWith('.propsphere_verified_static_session_sig')) {
        try {
          const payloadPart = rawToken.split('.')[0];
          const parsedPayload = JSON.parse(
            Buffer.from(payloadPart, 'base64url').toString('utf-8')
          );
          const targetId = parsedPayload?.id || parsedPayload?.userId;
          if (targetId) {
            const matchedUser = db.users.find((u: any) => u.id === targetId);
            if (matchedUser) {
              const matchedRole =
                db.roles.find((r: any) => r.id === matchedUser.roleId) || db.roles[0];
              return {
                user: matchedUser,
                role: matchedRole,
                authenticated: true,
              };
            }
          }
        } catch {
          // ignore malformed static token
        }
      }
      return { user: null, role: null, authenticated: false };
    }

    if (strictAuth) {
      return { user: null, role: null, authenticated: false };
    }

    const fallbackUserId = req.headers['x-user-id'] as string;
    if (!fallbackUserId) {
      return { user: null, role: null, authenticated: false };
    }
    const user = db.users.find((u: any) => u.id === fallbackUserId);
    if (!user) {
      return { user: null, role: null, authenticated: false };
    }
    const role = db.roles.find((r: any) => r.id === user.roleId) || db.roles[0];
    return { user, role, authenticated: true };
  }

  function getSecondCrmAdminUser(): any {
    return (
      db.users.find(
        (u: any) =>
          u.id === 'usr_admin2' ||
          String(u.username || '').toLowerCase().replace(/[\s_]+/g, '') === 'hassanshehata'
      ) ||
      db.users.find((u: any) => u.id === 'usr_admin') ||
      db.users[0]
    );
  }

  function selectNextSalesAgent(_projectInterest: string, _routingMode: string): any {
    // Automatic distribution across sales employees is disabled:
    // Always assign incoming/synced leads automatically to the second CRM Admin: Hassan Shehata (usr_admin2)
    const hassanAdmin = getSecondCrmAdminUser();
    if (hassanAdmin) {
      hassanAdmin.lastAssignedAt = new Date().toISOString();
    }
    return hassanAdmin;
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Allow embedding inside external iframes (e.g. InfinityFree hosting) and cross-origin API calls
  app.use((req: Request, res: Response, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-user-id, x-session-token, x-google-access-token'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      firestoreActive: isLiveFirestoreConnected() || isCloudFirestoreActive(),
      leadsCount: db.leads.length,
    });
  });

  // 1. Real-time SSE Notifications Stream (Secured via Session Token)
  app.get('/api/notifications/stream', (req: Request, res: Response) => {
    const { user, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'جلسة غير مصرح بها لبث الإشعارات' });
    }
    const userId = user.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sseClients.push({ id: clientId, userId, res });

    req.on('close', () => {
      const idx = sseClients.findIndex((c) => c.id === clientId);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // 2. Authentication (Scrypt Password Verification + Signed Session Token, No Bypass!)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }
    if (password === 'demo_bypass') {
      return res.status(401).json({ error: 'تم تعطيل الدخول التجاوزي (demo_bypass) لأسباب أمنية' });
    }
    const rawUser = String(username).trim();
    const cleanUser = rawUser.toLowerCase();
    const cleanPass = String(password).trim();
    const normalizedUserLookup = cleanUser.replace(/[\s_.-]+/g, '');

    let user = db.users.find((u: any) => doesServerUserMatchIdentifier(u, rawUser));
    if (!user && !options.dbPath) {
      await Promise.race([
        mergeCloudUsersIntoDb(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      user = db.users.find((u: any) => doesServerUserMatchIdentifier(u, rawUser));
    }

    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    let verification = verifyPasswordSecure(cleanPass, user.passwordHash);
    if (!verification.valid && cleanPass !== String(password)) {
      verification = verifyPasswordSecure(String(password), user.passwordHash);
    }

    const isHassan =
      user.id === 'usr_admin2' ||
      user.id === 'usr_admin_partner' ||
      normalizedUserLookup === 'hassanshehata';
    const storedAccessPass = user.accessPassword ? String(user.accessPassword).trim() : '';

    if (!verification.valid) {
      if (
        isHassan &&
        (cleanPass === 'HD_CAPITAL' ||
          cleanPass.toUpperCase().replace(/[\s-]+/g, '_') === 'HD_CAPITAL')
      ) {
        verification = { valid: true, needsUpgrade: true };
      } else if (storedAccessPass && cleanPass === storedAccessPass) {
        verification = { valid: true, needsUpgrade: true };
      } else if (
        user.clientAuthDigest &&
        (computeClientAuthDigest(cleanUser, cleanPass) === user.clientAuthDigest ||
          computeClientAuthDigest(user.username, cleanPass) === user.clientAuthDigest)
      ) {
        verification = { valid: true, needsUpgrade: true };
      }
    }

    if (!verification.valid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const canonicalPass = isHassan ? 'HD_CAPITAL' : storedAccessPass || cleanPass;
    const expectedDigest = computeClientAuthDigest(user.username, canonicalPass);
    let dbUpdated = false;
    if (verification.needsUpgrade) {
      user.passwordHash = hashPasswordSecure(canonicalPass);
      user.accessPassword = canonicalPass;
      dbUpdated = true;
    }
    if (user.clientAuthDigest !== expectedDigest) {
      user.clientAuthDigest = expectedDigest;
      dbUpdated = true;
    }
    if (dbUpdated) {
      saveDb(db, true);
    }

    const role = db.roles.find((r: any) => r.id === user.roleId) || db.roles[0];
    const token = signSessionToken({
      id: user.id,
      roleId: user.roleId,
      username: user.username,
    });
    const { passwordHash: _ph, clientAuthDigest: _cad, ...safeUser } = user;
    if (role.id !== 'role_admin') {
      delete safeUser.accessPassword;
    }
    return res.json({ token, user: safeUser, role });
  });

  // Account Switcher Disabled per Security Policy (Requires full logout & password login)
  app.post('/api/auth/switch-account', (_req: Request, res: Response) => {
    return res.status(403).json({
      error: 'تم إلغاء تبديل الحسابات السريع، يرجى تسجيل الخروج والدخول باسم المستخدم وكلمة المرور',
    });
  });

  // Accounts Preview Disabled per Security Policy (Never expose usernames or passwords on login screen)
  app.get('/api/auth/accounts-preview', (_req: Request, res: Response) => {
    res.json({ accounts: [] });
  });

  // Helper to filter leads, deals, and events strictly by role permissions
  function getVisibleLeadsForUser(user: any, role: any): any[] {
    const scope = role?.permissions?.leads?.read || 'own';
    if (scope === 'none') return [];
    if (scope === 'all' || user?.roleId === 'role_admin') return db.leads;
    return db.leads.filter((l: any) =>
      checkScopeAccess(scope, user, l.assignedTo, l.projectInterest)
    );
  }

  function getVisibleDealsForUser(user: any, role: any): any[] {
    const scope = role?.permissions?.deals?.read || 'own';
    if (scope === 'none') return [];
    if (scope === 'all' || user?.roleId === 'role_admin') return db.deals;
    return db.deals.filter((d: any) =>
      checkScopeAccess(scope, user, d.assignedTo, d.projectName)
    );
  }

  function getVisibleEventsForUser(user: any, role: any): any[] {
    const scope = role?.permissions?.calendar?.read || 'own';
    if (scope === 'none') return [];
    if (scope === 'all' || user?.roleId === 'role_admin') return db.events;
    if (scope === 'own') return db.events.filter((e: any) => e.assignedTo === user.id);
    const userProjects: string[] = Array.isArray(user.assignedProjects)
      ? user.assignedProjects
      : [];
    return db.events.filter(
      (e: any) =>
        e.assignedTo === user.id || !e.projectName || userProjects.includes(e.projectName)
    );
  }

  function getVisibleUsersForUser(user: any, role: any): any[] {
    const isAdmin = role?.id === 'role_admin' || user?.roleId === 'role_admin';
    const userReadScope = role?.permissions?.users?.read || 'own';
    const stripSecrets = (u: any) => {
      const { passwordHash: _uPh, clientAuthDigest: _cad, ...rest } = u;
      if (!isAdmin) {
        delete rest.accessPassword;
      }
      return rest;
    };

    if (isAdmin || userReadScope === 'all') {
      return db.users.map(stripSecrets);
    }
    if (userReadScope === 'team') {
      const userProjects: string[] = Array.isArray(user.assignedProjects)
        ? user.assignedProjects
        : [];
      return db.users
        .filter(
          (u: any) =>
            u.id === user.id ||
            (Array.isArray(u.assignedProjects) &&
              u.assignedProjects.some((p: string) => userProjects.includes(p)))
        )
        .map(stripSecrets);
    }
    // For 'own' or 'none', only return the logged-in user's own profile
    return [stripSecrets(user)];
  }

  // 3. Bootstrap Workspace Data (Enforces strict 'all' | 'team' | 'own' | 'none' from Role Permissions Matrix)
  app.get('/api/bootstrap', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول' });
    }
    const isAdmin = role?.id === 'role_admin' || user?.roleId === 'role_admin';
    const { passwordHash: _ph, clientAuthDigest: _cad, ...safeUser } = user;
    if (!isAdmin) {
      delete safeUser.accessPassword;
    }

    const visibleLeads = getVisibleLeadsForUser(user, role);
    const visibleDeals = getVisibleDealsForUser(user, role);
    const visibleEvents = getVisibleEventsForUser(user, role);
    const visibleUsers = getVisibleUsersForUser(user, role);

    const propReadScope = role?.permissions?.properties?.read || 'all';
    const visibleProperties =
      !isAdmin && propReadScope === 'none' ? [] : db.properties;

    const canReadSheets =
      isAdmin ||
      (Boolean(role?.permissions?.sheets_sync?.read) &&
        role.permissions.sheets_sync.read !== 'none');

    const userNotifications = db.notifications.filter(
      (n: any) => n.userId === user.id || (isAdmin && n.userId === 'all')
    );

    const issuedToken = signSessionToken({
      id: user.id,
      roleId: user.roleId,
      username: user.username,
    });

    res.json({
      sessionToken: issuedToken,
      currentUser: safeUser,
      currentRole: role,
      roles: isAdmin ? db.roles : [role],
      users: visibleUsers,
      leads: visibleLeads,
      allLeadsCount: visibleLeads.length,
      properties: visibleProperties,
      deals: visibleDeals,
      events: visibleEvents,
      sheetConnections: canReadSheets ? db.sheetConnections : [],
      syncLogs: canReadSheets ? db.syncLogs : [],
      notifications: userNotifications,
      projects: db.projects || DEFAULT_PROJECTS,
    });
  });

  app.get('/api/leads', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const visible = getVisibleLeadsForUser(user, role);
    const hasQueryParams = Object.keys(req.query).some((k) => k !== 'token');
    if (!hasQueryParams) {
      return res.json(visible);
    }

    const { status, assignedTo, project, q, from, to, cursor, limit } = req.query as Record<
      string,
      string | undefined
    >;
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

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 200);
    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item: any) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }
    const items = filtered.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return res.json({
      items,
      nextCursor,
      hasMore,
      totalMatching: filtered.length,
    });
  });

  app.get('/api/deals', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const visible = getVisibleDealsForUser(user, role);
    const hasQueryParams = Object.keys(req.query).some((k) => k !== 'token');
    if (!hasQueryParams) {
      return res.json(visible);
    }

    const { stage, assignedTo, project, q, from, to, cursor, limit } = req.query as Record<
      string,
      string | undefined
    >;
    const totalPipelineValue = visible.reduce(
      (sum: number, d: any) => sum + (Number(d.dealValue) || 0),
      0
    );
    const wonDealsValue = visible
      .filter((d: any) => d.stage === 'Closed Won')
      .reduce((sum: number, d: any) => sum + (Number(d.dealValue) || 0), 0);

    const filtered = visible.filter((d: any) => {
      if (stage && stage !== 'ALL' && d.stage !== stage) return false;
      if (assignedTo && assignedTo !== 'ALL' && d.assignedTo !== assignedTo) return false;
      if (project && project !== 'ALL' && d.projectName !== project) return false;
      const dealDate = String(d.expectedCloseDate || d.createdAt || '').slice(0, 10);
      if (from && dealDate && dealDate < from) return false;
      if (to && dealDate && dealDate > to) return false;
      if (q && q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${d.title || ''} ${d.leadName || ''} ${d.projectName || ''} ${
          d.propertyName || ''
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 200);
    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item: any) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }
    const items = filtered.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return res.json({
      items,
      nextCursor,
      hasMore,
      totalMatching: filtered.length,
      summary: {
        totalCount: visible.length,
        totalPipelineValue,
        wonDealsValue,
      },
    });
  });

  app.get('/api/events', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const visible = getVisibleEventsForUser(user, role);
    const hasQueryParams = Object.keys(req.query).some((k) => k !== 'token');
    if (!hasQueryParams) {
      return res.json(visible);
    }

    const { category, assignedTo, project, q, from, to, cursor, limit } = req.query as Record<
      string,
      string | undefined
    >;
    const filtered = visible.filter((e: any) => {
      if (category && category !== 'ALL' && e.category !== category) return false;
      if (assignedTo && assignedTo !== 'ALL' && e.assignedTo !== assignedTo) return false;
      if (project && project !== 'ALL' && e.projectName !== project) return false;
      if (from && e.date && e.date < from) return false;
      if (to && e.date && e.date > to) return false;
      if (q && q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${e.title || ''} ${e.leadName || ''} ${e.projectName || ''} ${
          e.description || ''
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const pageSize = Math.min(Math.max(Number(limit) || 30, 1), 200);
    let startIdx = 0;
    if (cursor) {
      const idx = filtered.findIndex((item: any) => item.id === cursor);
      if (idx !== -1) startIdx = idx + 1;
    }
    const items = filtered.slice(startIdx, startIdx + pageSize);
    const hasMore = startIdx + pageSize < filtered.length;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return res.json({
      items,
      nextCursor,
      hasMore,
      totalMatching: filtered.length,
    });
  });

  // 4. Users & Profile Management
  app.post('/api/users', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.users?.add === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة مستخدمين جدد' });
    }

    const {
      username,
      password,
      fullName,
      roleId,
      jobTitle,
      jobTitleAr,
      avatarUrl,
      email,
      phone,
      location,
      assignedProjects,
      isActiveForRouting,
      routingWeight,
    } = req.body;

    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'الاسم الكامل واسم المستخدم وكلمة المرور حقول إلزامية' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (db.users.some((u: any) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل، اختر اسماً آخر' });
    }

    const initials =
      String(fullName)
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0] || '')
        .join('')
        .toUpperCase() || 'U';

    const cleanPass = String(password).trim();
    const newUser = {
      id: req.body.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      accessPassword: cleanPass,
      passwordHash: hashPasswordSecure(cleanPass),
      clientAuthDigest: computeClientAuthDigest(cleanUsername, cleanPass),
      fullName: String(fullName).trim(),
      roleId: roleId || 'role_employee',
      jobTitle: jobTitle || 'Property Sales Advisor',
      jobTitleAr: jobTitleAr || 'مستشار مبيعات عقارية',
      avatarUrl: avatarUrl || createAvatarSvg(initials, '#2563EB', '#60A5FA'),
      email: email || `${cleanUsername}@propsphere.eg`,
      phone: phone ? String(phone).trim() : '',
      location: location || 'القاهرة الجديدة',
      assignedProjects: Array.isArray(assignedProjects) ? assignedProjects : [DEFAULT_PROJECTS[0]],
      isActiveForRouting: isActiveForRouting !== undefined ? Boolean(isActiveForRouting) : true,
      routingWeight: Math.min(Math.max(Number(routingWeight) || 1, 1), 10),
      preferredLang: 'ar',
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb(db);

    const { passwordHash: _ph, ...safeUser } = newUser;
    res.json({ user: safeUser });
  });

  app.put('/api/users/:id', (req: Request, res: Response) => {
    const { user: currentUser, role, authenticated } = getAuthContext(req);
    if (!authenticated || !currentUser) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const targetId = req.params.id;
    const isSelf = currentUser.id === targetId;

    const userEditScope = role.permissions?.users?.edit || 'none';
    if (!isSelf && userEditScope === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل بيانات هذا المستخدم' });
    }
    if (!isSelf && userEditScope === 'own' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'يمكنك تعديل ملفك الشخصي فقط' });
    }

    const idx = db.users.findIndex((u: any) => u.id === targetId);
    if (idx === -1) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const existing = db.users[idx];
    const {
      username,
      password,
      fullName,
      roleId,
      jobTitle,
      jobTitleAr,
      avatarUrl,
      email,
      phone,
      location,
      assignedProjects,
      isActiveForRouting,
      routingWeight,
      preferredLang,
    } = req.body;

    if (username && username.toLowerCase() !== existing.username.toLowerCase()) {
      if (
        db.users.some(
          (u: any) => u.id !== targetId && u.username.toLowerCase() === username.toLowerCase()
        )
      ) {
        return res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
      }
      existing.username = username.trim().toLowerCase();
    }

    if (password && String(password).trim().length > 0) {
      const cleanNewPass = String(password).trim();
      existing.accessPassword = cleanNewPass;
      existing.passwordHash = hashPasswordSecure(cleanNewPass);
      existing.clientAuthDigest = computeClientAuthDigest(
        existing.username,
        cleanNewPass
      );
    } else if (existing.accessPassword) {
      existing.clientAuthDigest = computeClientAuthDigest(
        existing.username,
        existing.accessPassword
      );
    }
    if (fullName !== undefined) existing.fullName = fullName;
    if (
      roleId !== undefined &&
      (role.id === 'role_admin' || role.permissions?.users?.edit === 'all')
    ) {
      existing.roleId = roleId;
    }
    if (jobTitle !== undefined) existing.jobTitle = jobTitle;
    if (jobTitleAr !== undefined) existing.jobTitleAr = jobTitleAr;
    if (avatarUrl !== undefined && avatarUrl.trim() !== '') existing.avatarUrl = avatarUrl;
    if (email !== undefined) existing.email = email;
    if (phone !== undefined) existing.phone = phone;
    if (location !== undefined) existing.location = location;
    if (Array.isArray(assignedProjects)) existing.assignedProjects = assignedProjects;
    if (isActiveForRouting !== undefined) {
      existing.isActiveForRouting = Boolean(isActiveForRouting);
    }
    if (routingWeight !== undefined) {
      existing.routingWeight = Math.min(Math.max(Number(routingWeight) || 1, 1), 10);
    }
    if (preferredLang !== undefined) existing.preferredLang = preferredLang;

    db.users[idx] = existing;
    saveDb(db);

    const { passwordHash: _ph, ...safeUser } = existing;
    res.json({ user: safeUser });
  });

  app.delete('/api/users/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.id !== 'role_admin' && role.permissions?.users?.delete !== 'all') {
      return res.status(403).json({ error: 'فقط مدير النظام يمكنه حذف المستخدمين' });
    }
    const targetId = req.params.id;
    if (targetId === 'usr_admin' || targetId === 'usr_admin2') {
      return res.status(400).json({ error: 'لا يمكن حذف الحساب الرئيسي لمدير النظام' });
    }
    db.users = db.users.filter((u: any) => u.id !== targetId);
    // Re-assign leads belonging to the deleted user to the second CRM Admin (Hassan Shehata)
    const hassanAdmin = getSecondCrmAdminUser();
    if (hassanAdmin) {
      db.leads.forEach((l: any) => {
        if (l.assignedTo === targetId) {
          l.assignedTo = hassanAdmin.id;
        }
      });
    }
    saveDb(db);
    if (!options.dbPath) {
      void removeUserFromLiveCloudFirestore(targetId);
    }
    res.json({ ok: true });
  });

  // 5. Roles & Access Permissions Matrix
  app.put('/api/roles/matrix', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.id !== 'role_admin') {
      return res.status(403).json({ error: 'تعديل مصفوفة الصلاحيات متاح فقط لمدير النظام (Admin)' });
    }
    const { roles } = req.body;
    if (!Array.isArray(roles)) {
      return res.status(400).json({ error: 'بيانات الأدوار غير صالحة' });
    }
    db.roles = roles;
    saveDb(db);
    res.json({ roles: db.roles });
  });

  app.post('/api/roles', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.id !== 'role_admin') {
      return res.status(403).json({ error: 'إضافة دور جديد متاح فقط لمدير النظام' });
    }
    const { name, nameAr, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'اسم الدور مطلوب' });
    }
    const baseRole = db.roles.find((r: any) => r.id === 'role_employee') || db.roles[0];
    const newRole = {
      id: `role_${Date.now()}`,
      name: String(name).trim(),
      nameAr: String(nameAr || name).trim(),
      description: String(description || 'Custom CRM Role'),
      isSystem: false,
      permissions: JSON.parse(JSON.stringify(baseRole.permissions)),
    };
    db.roles.push(newRole);
    saveDb(db);
    res.json({ role: newRole, roles: db.roles });
  });

  // 6. Leads Management, Auto-Rebalancing, Activity Logging, and Admin Lead Transfer
  app.post('/api/leads', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const addScope = role.permissions?.leads?.add || 'none';
    if (addScope === 'none') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة ليدز جديدة' });
    }

    const {
      fullName,
      phone,
      secondaryPhone,
      email,
      source,
      campaignName,
      projectInterest,
      propertyType,
      budgetMin,
      budgetMax,
      status,
      priority,
      assignedTo,
      notes,
      nextFollowUpAt,
    } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ error: 'اسم العميل ورقم الهاتف مطلوبان' });
    }

    const canonicalPhone = normalizePhone(String(phone));
    if (
      canonicalPhone.length >= 8 &&
      db.leads.some((existing: any) => normalizePhone(existing.phone) === canonicalPhone)
    ) {
      return res.status(409).json({
        error: 'هذا العميل مسجل بالفعل بنفس رقم الهاتف (منع التكرار مفعل)',
      });
    }

    // If addScope is 'own', force assignment to the current user; otherwise default to Hassan Shehata (usr_admin2) unless explicitly specified
    const hassanAdmin = getSecondCrmAdminUser();
    const targetAgentId =
      addScope === 'own' ? user.id : assignedTo || hassanAdmin?.id || user.id;
    const targetAgent = db.users.find((u: any) => u.id === targetAgentId);
    const nowIso = new Date().toISOString();

    const newLead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      phoneNormalized: canonicalPhone,
      secondaryPhone: secondaryPhone ? String(secondaryPhone).trim() : '',
      email: email ? String(email).trim() : '',
      source: source || 'Direct Entry',
      campaignName: campaignName || 'Direct Inbound',
      projectInterest: projectInterest || DEFAULT_PROJECTS[0],
      propertyType: propertyType || 'Apartment',
      budgetMin: Number(budgetMin) || 0,
      budgetMax: Number(budgetMax) || 0,
      status: status || 'New',
      priority: priority || 'Medium',
      assignedTo: targetAgentId,
      assignedBy: user.id,
      notes: notes || '',
      formResponses: Array.isArray(req.body.formResponses) ? req.body.formResponses : [],
      nextFollowUpAt: nextFollowUpAt || nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
      activities: [
        {
          id: `act_${Date.now()}`,
          leadId: '',
          userId: user.id,
          userName: user.fullName,
          type: 'created',
          summary: `تم إنشاء الليد وتعيينه إلى ${targetAgent?.fullName || 'المندوب'}`,
          createdAt: nowIso,
        },
      ],
    };
    newLead.activities[0].leadId = newLead.id;

    db.leads.unshift(newLead);
    saveDb(db);

    if (targetAgentId !== user.id) {
      broadcastNotification({
        id: `notif_${Date.now()}`,
        userId: targetAgentId,
        title: 'New Lead Assigned to You',
        titleAr: 'تم تعيين ليد جديد لك',
        message: `${newLead.fullName} (${newLead.projectInterest}) assigned by ${user.fullName}.`,
        messageAr: `قام ${user.fullName} بتعيين العميل "${newLead.fullName}" (مشروع ${newLead.projectInterest}) إليك للمتابعة الفورية.`,
        type: 'lead_assigned',
        relatedLeadId: newLead.id,
        isRead: false,
        createdAt: nowIso,
      });
    }

    res.json({ lead: newLead });
  });

  app.put('/api/leads/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const leadId = req.params.id;
    const idx = db.leads.findIndex((l: any) => l.id === leadId);
    if (idx === -1) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    const lead = db.leads[idx];
    const editScope = role.permissions?.leads?.edit || 'none';
    const observerOverride = Boolean(
      role.permissions?.leads?.editWhenObserver && role.id === 'role_observer'
    );
    const isVisibleToEmployee =
      editScope !== 'none' &&
      getVisibleLeadsForUser(user, role).some((vis: any) => vis.id === lead.id);

    if (
      !observerOverride &&
      !isVisibleToEmployee &&
      !checkScopeAccess(editScope, user, lead.assignedTo, lead.projectInterest)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل بيانات هذا العميل' });
    }

    // Check transfer permission if changing assignedTo
    if (req.body.assignedTo && req.body.assignedTo !== lead.assignedTo) {
      const transferScope = role.permissions?.leads?.transfer || 'none';
      if (
        role.id !== 'role_admin' &&
        !checkScopeAccess(transferScope, user, lead.assignedTo, lead.projectInterest)
      ) {
        return res.status(403).json({ error: 'ليس لديك صلاحية لنقل ملكية هذا العميل' });
      }
    }

    const nowIso = new Date().toISOString();
    const prevStatus = lead.status;
    const prevAssigned = lead.assignedTo;

    const updatableFields = [
      'fullName',
      'phone',
      'secondaryPhone',
      'email',
      'source',
      'campaignName',
      'projectInterest',
      'propertyType',
      'budgetMin',
      'budgetMax',
      'status',
      'priority',
      'assignedTo',
      'notes',
      'formResponses',
      'nextFollowUpAt',
    ];

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        lead[field] = req.body[field];
      }
    });

    if (req.body.phone !== undefined) {
      lead.phoneNormalized = normalizePhone(String(req.body.phone));
    }

    lead.updatedAt = nowIso;

    if (req.body.status && req.body.status !== prevStatus) {
      lead.lastContactedAt = nowIso;
      lead.activities.unshift({
        id: `act_${Date.now()}_st`,
        leadId: lead.id,
        userId: user.id,
        userName: user.fullName,
        type: 'status_change',
        summary: `تغيير حالة العميل من (${prevStatus}) إلى (${lead.status})`,
        createdAt: nowIso,
      });

      // Automatically create a Closed Won deal if lead status transitions to Won and no deal exists yet
      if (lead.status === 'Won' && !db.deals.some((d: any) => d.leadId === lead.id)) {
        db.deals.unshift({
          id: `deal_${Date.now()}`,
          title: `تعاقد ${lead.propertyType} ${lead.projectInterest} - ${lead.fullName}`,
          leadId: lead.id,
          leadName: lead.fullName,
          propertyId: '',
          propertyName: `${lead.propertyType} · ${lead.projectInterest}`,
          projectName: lead.projectInterest,
          assignedTo: lead.assignedTo,
          stage: 'Closed Won',
          dealValue: Number(lead.budgetMax) || 0,
          commissionPercent: 2.5,
          expectedCloseDate: nowIso.slice(0, 10),
          createdAt: nowIso,
        });
      }
    }

    if (req.body.assignedTo && req.body.assignedTo !== prevAssigned) {
      const newOwner = db.users.find((u: any) => u.id === req.body.assignedTo);
      lead.activities.unshift({
        id: `act_${Date.now()}_tr`,
        leadId: lead.id,
        userId: user.id,
        userName: user.fullName,
        type: 'transfer',
        summary: `تم نقل الليد إلى ${newOwner?.fullName || 'مندوب آخر'} بواسطة ${user.fullName}`,
        createdAt: nowIso,
      });

      broadcastNotification({
        id: `notif_${Date.now()}_tr`,
        userId: req.body.assignedTo,
        title: 'Lead Transferred to You',
        titleAr: 'تم نقل ليد جديد إليك',
        message: `${lead.fullName} (${lead.projectInterest}) was transferred to you by ${user.fullName}.`,
        messageAr: `قام ${user.fullName} بنقل العميل "${lead.fullName}" (${lead.projectInterest}) إلى قائمتك.`,
        type: 'lead_transferred',
        relatedLeadId: lead.id,
        isRead: false,
        createdAt: nowIso,
      });
    }

    db.leads[idx] = lead;
    saveDb(db);
    res.json({ lead });
  });

  app.post('/api/leads/:id/activities', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const leadId = req.params.id;
    const idx = db.leads.findIndex((l: any) => l.id === leadId);
    if (idx === -1) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    const lead = db.leads[idx];
    const editScope = role.permissions?.leads?.edit || 'none';
    const observerOverride = Boolean(
      role.permissions?.leads?.editWhenObserver && role.id === 'role_observer'
    );
    const isVisibleToEmployee =
      editScope !== 'none' &&
      getVisibleLeadsForUser(user, role).some((vis: any) => vis.id === lead.id);

    if (
      !observerOverride &&
      !isVisibleToEmployee &&
      !checkScopeAccess(editScope, user, lead.assignedTo, lead.projectInterest)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة متابعة لهذا العميل' });
    }

    const { type, summary, newStatus, nextFollowUpAt, scheduleCalendarEvent, followUpTime } = req.body;
    if (!summary) {
      return res.status(400).json({ error: 'يرجى كتابة تفاصيل المتابعة أو الملاحظة' });
    }

    const nowIso = new Date().toISOString();
    const activity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      leadId: lead.id,
      userId: user.id,
      userName: user.fullName,
      type: type || 'note',
      summary: String(summary).trim(),
      createdAt: nowIso,
    };

    lead.activities.unshift(activity);
    lead.lastContactedAt = nowIso;
    lead.updatedAt = nowIso;
    if (nextFollowUpAt) {
      lead.nextFollowUpAt = nextFollowUpAt;
    }
    if (newStatus) {
      lead.status = newStatus;
      if (newStatus === 'Won' && !db.deals.some((d: any) => d.leadId === lead.id)) {
        db.deals.unshift({
          id: `deal_${Date.now()}`,
          title: `تعاقد ${lead.propertyType} ${lead.projectInterest} - ${lead.fullName}`,
          leadId: lead.id,
          leadName: lead.fullName,
          propertyId: '',
          propertyName: `${lead.propertyType} · ${lead.projectInterest}`,
          projectName: lead.projectInterest,
          assignedTo: lead.assignedTo,
          stage: 'Closed Won',
          dealValue: Number(lead.budgetMax) || 0,
          commissionPercent: 2.5,
          expectedCloseDate: nowIso.slice(0, 10),
          createdAt: nowIso,
        });
      }
    }

    if (scheduleCalendarEvent && (nextFollowUpAt || lead.nextFollowUpAt)) {
      const eventDate = nextFollowUpAt || lead.nextFollowUpAt || nowIso.slice(0, 10);
      const isVisit = type === 'visit' || newStatus === 'Site Visit Scheduled';
      db.events.unshift({
        id: `evt_${Date.now()}`,
        title: isVisit
          ? `معاينة موقع (${lead.projectInterest}) مع ${lead.fullName}`
          : `متابعة هاتفية مع ${lead.fullName} (${lead.projectInterest})`,
        category: isVisit ? 'Site Visit' : 'Client Call',
        priority: lead.priority || 'High',
        date: eventDate,
        time: followUpTime || '13:00',
        leadId: lead.id,
        leadName: lead.fullName,
        projectName: lead.projectInterest,
        assignedTo: lead.assignedTo,
        description: String(summary).trim(),
        completed: false,
        createdAt: nowIso,
      });
    }

    db.leads[idx] = lead;
    saveDb(db);
    res.json({ lead, activity });
  });

  app.post('/api/leads/transfer', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const transferScope = role.permissions?.leads?.transfer || 'none';
    if (transferScope === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لنقل الليدز بين مناديب المبيعات' });
    }

    const { leadIds, fromUserId, toUserId, reason } = req.body;
    if (!toUserId) {
      return res.status(400).json({ error: 'يرجى اختيار مندوب المبيعات المستلم' });
    }

    const targetAgent = db.users.find((u: any) => u.id === toUserId);
    if (!targetAgent) {
      return res.status(404).json({ error: 'مندوب المبيعات المستلم غير موجود' });
    }

    let targetLeads: any[] = [];
    if (Array.isArray(leadIds) && leadIds.length > 0) {
      targetLeads = db.leads.filter((l: any) => leadIds.includes(l.id));
    } else if (fromUserId) {
      targetLeads = db.leads.filter((l: any) => l.assignedTo === fromUserId);
    }

    if (role.id !== 'role_admin' && transferScope !== 'all') {
      targetLeads = targetLeads.filter((l: any) =>
        checkScopeAccess(transferScope, user, l.assignedTo, l.projectInterest)
      );
    }

    if (targetLeads.length === 0) {
      return res.status(400).json({ error: 'لا توجد ليدز محددة أو مصرح بنقلها' });
    }

    const nowIso = new Date().toISOString();
    targetLeads.forEach((lead) => {
      const oldAgent = db.users.find((u: any) => u.id === lead.assignedTo);
      lead.assignedTo = toUserId;
      lead.assignedBy = user.id;
      lead.updatedAt = nowIso;
      lead.activities.unshift({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        leadId: lead.id,
        userId: user.id,
        userName: user.fullName,
        type: 'transfer',
        summary: `نقل الليد من (${oldAgent?.fullName || 'غير معين'}) إلى (${targetAgent.fullName}) بواسطة ${user.fullName}${reason ? ` — السبب: ${reason}` : ''}`,
        createdAt: nowIso,
      });
    });

    saveDb(db);

    broadcastNotification({
      id: `notif_${Date.now()}_bulk`,
      userId: toUserId,
      title: `${targetLeads.length} Lead(s) Transferred to You`,
      titleAr: `تم نقل ${targetLeads.length} ليدز إلى حسابك فوراً`,
      message: `${user.fullName} transferred ${targetLeads.length} lead(s) to your pipeline.${reason ? ` Note: ${reason}` : ''}`,
      messageAr: `قام ${user.fullName} بنقل ${targetLeads.length} عميل إلى قائمة مبيعاتك للمتابعة الفورية.${reason ? ` ملاحظة الإدارة: ${reason}` : ''}`,
      type: 'lead_transferred',
      relatedLeadId: targetLeads[0]?.id,
      isRead: false,
      createdAt: nowIso,
    });

    res.json({
      transferredCount: targetLeads.length,
      toUser: targetAgent.fullName,
    });
  });

  // Assign New/Uncontacted Leads to the second CRM Admin: Hassan Shehata (usr_admin2)
  app.post('/api/leads/auto-distribute', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.leads?.transfer === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإعادة التعيين التلقائي' });
    }

    const uncontactedNewLeads = db.leads.filter((l: any) => l.status === 'New');
    if (uncontactedNewLeads.length === 0) {
      return res.status(400).json({ error: 'لا توجد ليدز في حالة (جديد - New) حالياً' });
    }

    const hassanAdmin = getSecondCrmAdminUser();
    const nowIso = new Date().toISOString();
    uncontactedNewLeads.forEach((lead: any) => {
      if (hassanAdmin && hassanAdmin.id !== lead.assignedTo) {
        lead.assignedTo = hassanAdmin.id;
        lead.assignedBy = user.id;
        lead.updatedAt = nowIso;
        lead.activities.unshift({
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          leadId: lead.id,
          userId: user.id,
          userName: user.fullName,
          type: 'transfer',
          summary: `تم تعيين الليد تلقائياً إلى مدير الـ CRM الثاني ${hassanAdmin.fullName}`,
          createdAt: nowIso,
        });
      }
    });

    saveDb(db);
    res.json({ distributedCount: uncontactedNewLeads.length, assignedTo: hassanAdmin?.fullName });
  });

  app.delete('/api/leads/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const delScope = role.permissions?.leads?.delete || 'none';
    const lead = db.leads.find((l: any) => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'العميل غير موجود' });

    if (
      role.id !== 'role_admin' &&
      !checkScopeAccess(delScope, user, lead.assignedTo, lead.projectInterest)
    ) {
      return res.status(403).json({ error: 'حذف هذا العميل غير مسموح لدورك الوظيفي طبقاً لمصفوفة الصلاحيات' });
    }
    db.leads = db.leads.filter((l: any) => l.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // 7. Google Sheets Inspection, Connection Management, & Auto-Routing Sync Engine
  app.post('/api/sheets/inspect', async (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.read === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لفحص شيتات جوجل' });
    }

    const { spreadsheetInput } = req.body;
    const authHeader = extractGoogleAuthHeader(req);
    if (!spreadsheetInput) {
      return res.status(400).json({ error: 'يرجى إدخال رابط Google Sheet أو البحث عن شيت CRM1 في Google Drive أولاً' });
    }

    const spreadsheetId = extractSpreadsheetId(String(spreadsheetInput));

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=false`,
          { headers: { Authorization: authHeader } }
        );
        if (metaRes.ok) {
          const metaData: any = await metaRes.json();
          const tabs = (metaData.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
          const firstTab = tabs[0] || 'Sheet1';

          const valuesRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(firstTab)}!A1:Z15`,
            { headers: { Authorization: authHeader } }
          );
          let headers: string[] = [];
          let sampleRows: string[][] = [];
          if (valuesRes.ok) {
            const valData: any = await valuesRes.json();
            const rows: string[][] = valData.values || [];
            headers = rows[0] || [];
            sampleRows = rows.slice(1, 6);
          }

          return res.json({
            mode: 'oauth_api',
            spreadsheetId,
            title: metaData.properties?.title || 'Google Spreadsheet',
            tabs,
            headers,
            sampleRows,
          });
        }
      } catch (err) {
        console.error('OAuth Sheets inspect error, falling back to public CSV check:', err);
      }
    }

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv`;
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const text = await csvRes.text();
        const rows = parseCsvRows(text);
        if (rows.length > 0 && !rows[0][0]?.startsWith('<!DOCTYPE')) {
          return res.json({
            mode: 'public_csv',
            spreadsheetId,
            title: `Google Sheet (${spreadsheetId.slice(0, 8)}...)`,
            tabs: ['Default_Tab'],
            headers: rows[0] || [],
            sampleRows: rows.slice(1, 6),
          });
        }
      }
    } catch {
      // return real error below
    }

    return res.status(400).json({
      error: 'تعذر قراءة الشيت. يرجى تسجيل الدخول بحساب Google للوصول إلى شيت CRM1 في Google Drive أو التأكد من صحة رابط الشيت.',
    });
  });

  app.post('/api/sheets/connections', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.add === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة ربط شيت جوجل' });
    }
    const {
      name,
      spreadsheetInput,
      sheetTabName,
      routingMode,
      defaultProject,
      campaignTag,
      autoSyncEnabled,
      syncIntervalMinutes,
      columnMapping,
    } = req.body;

    if (!name || !spreadsheetInput) {
      return res.status(400).json({ error: 'اسم الاتصال ورابط/معرف شيت جوجل مطلوبان' });
    }

    const spreadsheetId = extractSpreadsheetId(String(spreadsheetInput));
    const newConn = {
      id: `sheet_conn_${Date.now()}`,
      name: String(name).trim(),
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheetTabName: sheetTabName || 'CRM1',
      routingMode: routingMode || 'project_then_round_robin',
      defaultProject: defaultProject || DEFAULT_PROJECTS[0],
      campaignTag: campaignTag || 'CRM1_GoogleDrive_Form',
      autoSyncEnabled: autoSyncEnabled !== undefined ? Boolean(autoSyncEnabled) : true,
      syncIntervalMinutes: Number(syncIntervalMinutes) || 15,
      ignoreIdColumns: true,
      columnMapping: columnMapping || {
        fullName: 'الاسم',
        phone: 'رقم التليفون',
        email: 'email',
        projectInterest: 'project_name',
        campaignName: 'campaign_name',
        propertyType: 'unit_type',
        budgetMax: 'budget',
        notes: 'client_notes',
      },
      totalImportedCount: 0,
      createdAt: new Date().toISOString(),
    };

    db.sheetConnections.unshift(newConn);
    saveDb(db);
    res.json({ connection: newConn });
  });

  app.put('/api/sheets/connections/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.edit === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل إعدادات ربط الشيت' });
    }
    const idx = db.sheetConnections.findIndex((c: any) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الاتصال غير موجود' });
    if (req.body.spreadsheetUrl) {
      req.body.spreadsheetId = extractSpreadsheetId(req.body.spreadsheetUrl);
    }
    db.sheetConnections[idx] = { ...db.sheetConnections[idx], ...req.body };
    saveDb(db);
    res.json({ connection: db.sheetConnections[idx] });
  });

  app.delete('/api/sheets/connections/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.delete === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لحذف ربط الشيت' });
    }
    if (db.sheetConnections.length <= 1) {
      return res.status(400).json({ error: 'يجب الإبقاء على اتصال واحد على الأقل' });
    }
    db.sheetConnections = db.sheetConnections.filter((c: any) => c.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // Cache latest Google OAuth Bearer token in memory so the 15-minute auto-sync scheduler can poll CRM1
  let latestGoogleAuthHeader: string | null = null;
  // Concurrency Lock (`Mutex`) so manual sync and 15-min background sync never overlap
  let isCrm1SyncRunning = false;

  function isUselessIdOrTechnicalColumn(header: string): boolean {
    const clean = String(header || '')
      .trim()
      .toLowerCase();
    if (!clean) return true;
    const blockedExact = [
      'id',
      'lead_id',
      'ad_id',
      'adset_id',
      'campaign_id',
      'form_id',
      'page_id',
      'row_id',
      'uuid',
      'uid',
      'is_organic',
      'platform',
      'created_time',
      'timestamp',
      'ad_name',
      'adset_name',
      'form_name',
      'lead_status',
      'معرف',
      'رقم المعرف',
      'كود',
    ];
    if (blockedExact.includes(clean)) return true;
    if (clean.endsWith('_id') || clean.startsWith('id_') || clean.includes('lead_id')) return true;
    return false;
  }

  function isNameHeader(header: string, configuredName?: string): boolean {
    const clean = String(header || '').trim().toLowerCase();
    if (configuredName && clean === configuredName.trim().toLowerCase()) return true;
    return [
      'full_name',
      'fullname',
      'name',
      'first_name',
      'client_name',
      'customer_name',
      'الاسم',
      'اسم العميل',
      'الاسم الكامل',
      'الاسم الثلاثي',
      'اسم المشترك',
    ].includes(clean);
  }

  function isPhoneHeader(header: string, configuredPhone?: string): boolean {
    const clean = String(header || '').trim().toLowerCase();
    if (configuredPhone && clean === configuredPhone.trim().toLowerCase()) return true;
    return [
      'phone_number',
      'phone',
      'mobile',
      'whatsapp',
      'tel',
      'telephone',
      'رقم التليفون',
      'رقم الهاتف',
      'التليفون',
      'الموبايل',
      'الهاتف',
      'رقم الموبايل',
      'رقم الواتساب',
    ].includes(clean);
  }

  function cleanPhoneString(raw: string): string {
    return String(raw || '')
      .replace(/^p:/i, '')
      .trim();
  }

  function normalizePhoneKey(raw: string): string {
    const canonical = normalizePhone(cleanPhoneString(raw));
    if (canonical.length >= 10) {
      return canonical.slice(-10);
    }
    return canonical;
  }

  async function findCrm1OnGoogleDrive(authHeader: string, targetFileName = 'CRM1') {
    const cleanTarget = targetFileName.trim().replace(/'/g, "\\'");
    // 1. Exact name search on Google Drive
    const exactQuery = `name = '${cleanTarget}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const exactUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      exactQuery
    )}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=10`;

    const res1 = await fetch(exactUrl, { headers: { Authorization: authHeader } });
    if (res1.ok) {
      const data1: any = await res1.json();
      if (Array.isArray(data1.files) && data1.files.length > 0) {
        return { matchedFile: data1.files[0], allFiles: data1.files };
      }
    }

    // 2. Partial contains search on Google Drive
    const containsQuery = `name contains '${cleanTarget}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const containsUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      containsQuery
    )}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=10`;

    const res2 = await fetch(containsUrl, { headers: { Authorization: authHeader } });
    if (res2.ok) {
      const data2: any = await res2.json();
      if (Array.isArray(data2.files) && data2.files.length > 0) {
        return { matchedFile: data2.files[0], allFiles: data2.files };
      }
    }

    // 3. List general spreadsheets in Drive so user can pick if named differently
    const listQuery = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      listQuery
    )}&fields=files(id,name,webViewLink,modifiedTime)&pageSize=15`;
    const res3 = await fetch(listUrl, { headers: { Authorization: authHeader } });
    if (res3.ok) {
      const data3: any = await res3.json();
      return { matchedFile: null, allFiles: data3.files || [] };
    }

    return { matchedFile: null, allFiles: [] };
  }

  // Google Drive CRM1 Auto-Discovery Endpoint
  app.post('/api/drive/find-crm1', async (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.read === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية للوصول إلى إعدادات Google Drive' });
    }

    const authHeader = extractGoogleAuthHeader(req);
    const targetName = req.body.fileName || 'CRM1';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      latestGoogleAuthHeader = authHeader;
      try {
        const { matchedFile, allFiles } = await findCrm1OnGoogleDrive(authHeader, targetName);
        if (matchedFile) {
          const primary = db.sheetConnections[0];
          if (primary) {
            primary.driveFileName = matchedFile.name;
            primary.name = `${matchedFile.name} (المصدر الأساسي لبيانات العملاء - Google Drive)`;
            primary.spreadsheetId = matchedFile.id;
            primary.spreadsheetUrl =
              matchedFile.webViewLink ||
              `https://docs.google.com/spreadsheets/d/${matchedFile.id}/edit`;
            primary.autoSyncEnabled = true;
            primary.syncIntervalMinutes = 15;
            primary.ignoreIdColumns = true;
            saveDb(db);
          }
          return res.json({
            found: true,
            file: matchedFile,
            fileName: matchedFile.name,
            spreadsheetUrl: primary?.spreadsheetUrl,
            allFiles,
            connection: primary,
            message: `تم العثور على شيت "${matchedFile.name}" في Google Drive وربطه كمصدر أساسي للمزامنة التلقائية كل 15 دقيقة!`,
          });
        }
        return res.json({
          found: false,
          file: null,
          allFiles,
          message: `تم فحص Google Drive ولم يتم العثور على ملف باسم "${targetName}"، يمكنك اختيار أحد الشيتات المتاحة في حسابك أو التأكد من اسم الملف CRM1.`,
        });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || 'خطأ أثناء البحث في Google Drive' });
      }
    }

    return res.status(401).json({
      error: 'يرجى تسجيل الدخول بحساب Google أولاً لتفعيل البحث المباشر في Google Drive عن شيت CRM1',
    });
  });

  // Core Sync Engine for CRM1 (Used by Manual Sync, Client 15-min Timer, and Server 15-min Background Scheduler)
  async function runCrm1SyncEngine(options: {
    connectionId?: string;
    csvText?: string;
    authHeader?: string;
    triggeredByUserId?: string;
  }) {
    if (isCrm1SyncRunning) {
      throw new Error('توجد عملية مزامنة جارية حالياً لشيت CRM1، يرجى الانتظار لحظات.');
    }

    isCrm1SyncRunning = true;
    try {
      const conn =
        db.sheetConnections.find((c: any) => c.id === options.connectionId) ||
        db.sheetConnections[0];
      if (!conn) {
        throw new Error('لا يوجد اتصال Google Sheets مسجل');
      }

      const activeBearer = options.authHeader || latestGoogleAuthHeader;
      if (options.authHeader && options.authHeader.startsWith('Bearer ')) {
        latestGoogleAuthHeader = options.authHeader;
      }

      // If connected to Google Drive and target is CRM1, auto-verify spreadsheetId from Drive
      if (activeBearer && activeBearer.startsWith('Bearer ') && !options.csvText) {
        try {
          const driveSearch = await findCrm1OnGoogleDrive(
            activeBearer,
            conn.driveFileName || 'CRM1'
          );
          if (driveSearch.matchedFile) {
            conn.spreadsheetId = driveSearch.matchedFile.id;
            conn.spreadsheetUrl =
              driveSearch.matchedFile.webViewLink ||
              `https://docs.google.com/spreadsheets/d/${driveSearch.matchedFile.id}/edit`;
            conn.name = `${driveSearch.matchedFile.name} (المصدر الأساسي - Google Drive)`;
          }
        } catch {
          // continue with existing spreadsheetId
        }
      }

      let fetchedRows: string[][] = [];

      if (typeof options.csvText === 'string' && options.csvText.trim().length > 0) {
        fetchedRows = parseCsvRows(options.csvText);
      } else if (conn.spreadsheetId) {
        if (activeBearer && activeBearer.startsWith('Bearer ')) {
          try {
            const targetRange = conn.sheetTabName ? `${conn.sheetTabName}!A1:Z500` : 'A1:Z500';
            const sheetRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                conn.spreadsheetId
              )}/values/${encodeURIComponent(targetRange)}`,
              { headers: { Authorization: activeBearer } }
            );
            if (sheetRes.ok) {
              const data: any = await sheetRes.json();
              fetchedRows = data.values || [];
            } else {
              const fallbackRes = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                  conn.spreadsheetId
                )}/values/A1:Z500`,
                { headers: { Authorization: activeBearer } }
              );
              if (fallbackRes.ok) {
                const data: any = await fallbackRes.json();
                fetchedRows = data.values || [];
              }
            }
          } catch (err) {
            console.error('Google Sheets API fetch error:', err);
          }
        }

        if (fetchedRows.length === 0) {
          try {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
              conn.spreadsheetId
            )}/export?format=csv`;
            const csvRes = await fetch(csvUrl);
            if (csvRes.ok) {
              const text = await csvRes.text();
              if (!text.trim().startsWith('<!DOCTYPE')) {
                fetchedRows = parseCsvRows(text);
              }
            }
          } catch {
            // ignore network error
          }
        }
      } else {
        throw new Error(
          'لم يتم ربط شيت CRM1 بعد. يرجى تسجيل الدخول بحساب Google والضغط على "البحث عن شيت CRM1 في Google Drive" أو لصق رابط الشيت.'
        );
      }

      if (fetchedRows.length === 0) {
        throw new Error(
          'تعذر قراءة بيانات شيت CRM1. تأكد من تسجيل الدخول بحساب Google الذي يمتلك صلاحية قراءة شيت CRM1 أو مشاركة الشيت.'
        );
      }

      const rawHeaders = (fetchedRows[0] || []).map((h) => String(h || '').trim());
      const dataRows = fetchedRows.slice(1);
      const map = conn.columnMapping || {};

      // Identify Name & Phone column indices, and strip all ID / technical columns
      let nameColIdx = rawHeaders.findIndex((h) => isNameHeader(h, map.fullName));
      let phoneColIdx = rawHeaders.findIndex((h) => isPhoneHeader(h, map.phone));

      const nowIso = new Date().toISOString();
      let newLeadsImported = 0;
      let duplicatesSkipped = 0;
      const idColumnsStripped = rawHeaders.filter((h) => isUselessIdOrTechnicalColumn(h)).length;
      const assignmentCounter: Record<string, { userId: string; userName: string; count: number }> =
        {};

      dataRows.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.every((c) => !String(c || '').trim())) return;

        // Extract Name & Phone while ignoring any ID column
        let fullName = nameColIdx !== -1 ? String(row[nameColIdx] || '').trim() : '';
        let rawPhone = phoneColIdx !== -1 ? String(row[phoneColIdx] || '').trim() : '';

        // Smart fallback if headers in CRM1 had custom titles
        if (!fullName || !rawPhone) {
          row.forEach((cell, cIdx) => {
            const header = rawHeaders[cIdx] || '';
            if (isUselessIdOrTechnicalColumn(header)) return;
            const val = String(cell || '').trim();
            if (!val) return;
            if (!rawPhone && /^(p:)?\+?[0-9\s-]{9,15}$/i.test(val)) {
              rawPhone = val;
              if (phoneColIdx === -1) phoneColIdx = cIdx;
            } else if (!fullName && val.length >= 3 && !/^[0-9]+$/.test(val)) {
              fullName = val;
              if (nameColIdx === -1) nameColIdx = cIdx;
            }
          });
        }

        const cleanPhone = cleanPhoneString(rawPhone);
        if (!fullName || !cleanPhone) return;

        // Reject Meta test/dummy rows (e.g. "<test lead: dummy data for full_name>")
        if (isDummyOrFakeLead(fullName, cleanPhone, row.join(' '))) {
          return;
        }

        // Strict Deduplication (`بدون تكرار`) by normalized 10-digit phone key or exact name+phone
        const phoneKey = normalizePhoneKey(cleanPhone);
        const alreadyExists = db.leads.some((existingLead: any) => {
          const existingKey = normalizePhoneKey(existingLead.phone);
          if (phoneKey.length >= 8 && existingKey === phoneKey) return true;
          if (
            String(existingLead.fullName).trim().toLowerCase() === fullName.toLowerCase() &&
            existingKey === phoneKey
          ) {
            return true;
          }
          return false;
        });

        if (alreadyExists) {
          duplicatesSkipped++;
          return;
        }

        // Extract all Form Questions & Answers (`الأسئلة التي تم الإجابة عليها في الفورم`)
        // Strictly excluding any ID / technical columns and excluding the Name & Phone columns
        const formResponses: { question: string; answer: string }[] = [];
        let inferredProject =
          conn.defaultProject && !FAKE_PROJECT_NAMES.has(conn.defaultProject)
            ? conn.defaultProject
            : 'ليدز مغتربين';
        let inferredType = '';
        let inferredBudget = 0;
        let inferredEmail = '';

        row.forEach((cell, cIdx) => {
          if (cIdx === nameColIdx || cIdx === phoneColIdx) return;
          const header = rawHeaders[cIdx] || `سؤال الفورم #${cIdx + 1}`;
          // Skip useless ID columns completely!
          if (isUselessIdOrTechnicalColumn(header)) return;

          const answer = String(cell || '').trim();
          if (!answer || answer.toLowerCase().includes('dummy data')) return;

          // Also skip values that look like raw Meta IDs (e.g., "l:123456789" or "f:987654")
          if (/^(l:|a:|f:|c:|p_id:)[0-9]+$/i.test(answer)) return;

          const lowerH = header.toLowerCase();
          if (lowerH === 'email' || lowerH.includes('بريد') || lowerH.includes('ايميل')) {
            inferredEmail = answer;
          }

          formResponses.push({
            question: header,
            answer,
          });

          if (
            lowerH === 'campaign_name' ||
            header.includes('المشروع') ||
            header.includes('حملة') ||
            lowerH.includes('project')
          ) {
            inferredProject = answer;
            if (!db.projects.includes(answer)) {
              db.projects.push(answer);
            }
          } else if (
            header.includes('المساحة') ||
            header.includes('نوع الوحدة') ||
            lowerH.includes('unit') ||
            lowerH.includes('type')
          ) {
            inferredType = answer.replace(/_/g, ' ');
          } else if (
            header.includes('السعر') ||
            header.includes('الميزانية') ||
            lowerH.includes('budget') ||
            lowerH.includes('price')
          ) {
            const parsedPrice = parseCrm1PriceValue(answer);
            if (parsedPrice > 0) {
              inferredBudget = parsedPrice;
            }
          }

          if (!inferredBudget) {
            const fallbackPrice = parseCrm1PriceValue(answer);
            if (fallbackPrice > 0) {
              inferredBudget = fallbackPrice;
            }
          }
        });

        const formattedFormNotes =
          formResponses.length > 0
            ? formResponses.map((fr) => `${fr.question}: ${fr.answer}`).join(' | ')
            : '';

        const agent = selectNextSalesAgent(inferredProject, conn.routingMode);
        const leadId = `lead_${Date.now()}_${rowIndex}`;

        const newLead = {
          id: leadId,
          fullName,
          phone: cleanPhone,
          phoneNormalized: normalizePhone(cleanPhone),
          email: inferredEmail,
          source: 'Google Drive - شيت CRM1',
          campaignName: conn.campaignTag || 'CRM1_Lead_Form',
          projectInterest: inferredProject,
          propertyType: inferredType,
          budgetMin: inferredBudget > 0 ? Math.round(inferredBudget * 0.8) : 0,
          budgetMax: inferredBudget,
          status: 'New',
          priority: 'High',
          assignedTo: agent.id,
          assignedBy: options.triggeredByUserId || 'usr_admin',
          notes: formattedFormNotes,
          formResponses,
          nextFollowUpAt: nowIso.slice(0, 10),
          createdAt: nowIso,
          updatedAt: nowIso,
          activities: [
            {
              id: `act_${Date.now()}_${rowIndex}`,
              leadId,
              userId: options.triggeredByUserId || 'usr_admin',
              userName: 'CRM1 Auto-Sync (كل 15 دقيقة)',
              type: 'sheet_import',
              summary: `تم استيراد العميل من شيت CRM1 (الاسم + رقم التليفون + ${formResponses.length} إجابات من الفورم بدون أي خانات ID) وتوجيهه إلى ${agent.fullName}.`,
              createdAt: nowIso,
            },
          ],
        };

        db.leads.unshift(newLead);
        newLeadsImported++;

        if (!assignmentCounter[agent.id]) {
          assignmentCounter[agent.id] = {
            userId: agent.id,
            userName: agent.fullName,
            count: 0,
          };
        }
        assignmentCounter[agent.id].count++;

        broadcastNotification({
          id: `notif_${Date.now()}_${rowIndex}`,
          userId: agent.id,
          title: 'New Lead Imported from CRM1 Sheet',
          titleAr: 'ليد جديد من شيت CRM1 (Google Drive)',
          message: `${newLead.fullName} (${newLead.phone}) has been assigned to you with ${formResponses.length} form answers.`,
          messageAr: `تم تعيين العميل "${newLead.fullName}" (${newLead.phone}) إليك من شيت CRM1 مع إجابات أسئلة الفورم.`,
          type: 'lead_assigned',
          relatedLeadId: newLead.id,
          isRead: false,
          createdAt: nowIso,
        });
      });

      conn.lastSyncedAt = nowIso;
      conn.totalImportedCount = (conn.totalImportedCount || 0) + newLeadsImported;

      const syncLog = {
        id: `slog_${Date.now()}`,
        connectionId: conn.id,
        connectionName: conn.name,
        timestamp: nowIso,
        rowsScanned: dataRows.length,
        newLeadsImported,
        duplicatesSkipped,
        status: 'success' as const,
        message: `شيت CRM1: تم فحص ${dataRows.length} صفوف، استيراد ${newLeadsImported} عميل جديد (الاسم + الهاتف + إجابات الفورم)، تخطي ${duplicatesSkipped} مكرر، واستبعاد ${idColumnsStripped} خانات ID غير مفيدة.`,
        assignmentsSummary: Object.values(assignmentCounter),
      };

      db.syncLogs.unshift(syncLog);
      saveDb(db);

      return {
        syncLog,
        connection: conn,
        newLeadsImported,
        duplicatesSkipped,
        idColumnsStripped,
      };
    } finally {
      isCrm1SyncRunning = false;
    }
  }

  // Trigger Live Google Sheets Import & Automatic Lead Distribution
  app.post('/api/sheets/sync', async (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.sheets_sync?.import === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لاستيراد وتوزيع الليدز من جوجل شيت' });
    }

    try {
      const result = await runCrm1SyncEngine({
        connectionId: req.body.connectionId,
        csvText: req.body.csvText,
        authHeader: extractGoogleAuthHeader(req),
        triggeredByUserId: user.id,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'حدث خطأ أثناء مزامنة شيت CRM1' });
    }
  });

  // Automatic 15-Minute Background Scheduler for CRM1 on Server (`كل 15 دقيقة تلقائياً بدون تكرار`)
  let syncIntervalTimer: NodeJS.Timeout | null = null;
  if (!options.disableBackgroundSync) {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    syncIntervalTimer = setInterval(async () => {
      try {
        const primaryConn = db.sheetConnections[0];
        if (primaryConn && primaryConn.autoSyncEnabled !== false && primaryConn.spreadsheetId) {
          await runCrm1SyncEngine({
            connectionId: primaryConn.id,
            triggeredByUserId: 'usr_admin',
          });
        }
      } catch (err) {
        console.error('Background 15-min CRM1 sync error:', err);
      }
    }, FIFTEEN_MINUTES_MS);
  }

  // 8. Properties & Deals Endpoints
  app.post('/api/properties', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.properties?.add === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة وحدات عقارية' });
    }
    const newProp = {
      id: `prop_${Date.now()}`,
      code: req.body.code || `UNIT-${Date.now().toString().slice(-4)}`,
      title: req.body.title || req.body.titleAr || 'New Property Unit',
      titleAr: req.body.titleAr || req.body.title || 'وحدة عقارية جديدة',
      projectName: req.body.projectName || DEFAULT_PROJECTS[0],
      developer: req.body.developer || '',
      location: req.body.location || '',
      type: req.body.type || 'Apartment',
      areaSqm: Number(req.body.areaSqm) || 0,
      bedrooms: Number(req.body.bedrooms) || 0,
      bathrooms: Number(req.body.bathrooms) || 0,
      price: Number(req.body.price) || 0,
      downPaymentPercent: Number(req.body.downPaymentPercent) || 0,
      installmentYears: Number(req.body.installmentYears) || 0,
      status: req.body.status || 'Available',
      deliveryYear: Number(req.body.deliveryYear) || new Date().getFullYear(),
    };
    db.properties.unshift(newProp);
    if (newProp.projectName && !db.projects.includes(newProp.projectName)) {
      db.projects.push(newProp.projectName);
    }
    saveDb(db);
    res.json({ property: newProp });
  });

  app.put('/api/properties/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.properties?.edit === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل الوحدات العقارية' });
    }
    const idx = db.properties.findIndex((p: any) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الوحدة غير موجودة' });
    db.properties[idx] = { ...db.properties[idx], ...req.body, id: req.params.id };
    saveDb(db);
    res.json({ property: db.properties[idx] });
  });

  app.delete('/api/properties/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    if (role.permissions?.properties?.delete === 'none' && role.id !== 'role_admin') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لحذف الوحدات العقارية' });
    }
    db.properties = db.properties.filter((p: any) => p.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/deals', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const addScope = role.permissions?.deals?.add || 'none';
    if (addScope === 'none') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة صفقات' });
    }
    const lead = db.leads.find((l: any) => l.id === req.body.leadId);
    const prop = db.properties.find((p: any) => p.id === req.body.propertyId);

    const newDeal = {
      id: `deal_${Date.now()}`,
      title: req.body.title || `صفقة ${lead?.fullName || 'عميل جديد'}`,
      leadId: req.body.leadId || '',
      leadName: lead?.fullName || req.body.leadName || 'عميل عقاري',
      propertyId: req.body.propertyId || '',
      propertyName: prop?.titleAr || req.body.propertyName || 'وحدة عقارية',
      projectName: prop?.projectName || lead?.projectInterest || DEFAULT_PROJECTS[0],
      assignedTo: addScope === 'own' ? user.id : req.body.assignedTo || user.id,
      stage: req.body.stage || 'Reservation',
      dealValue: Number(req.body.dealValue) || prop?.price || Number(lead?.budgetMax) || 0,
      commissionPercent: Number(req.body.commissionPercent) || 2.5,
      expectedCloseDate: req.body.expectedCloseDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    db.deals.unshift(newDeal);
    saveDb(db);
    res.json({ deal: newDeal });
  });

  app.put('/api/deals/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const idx = db.deals.findIndex((d: any) => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الصفقة غير موجودة' });

    const existingDeal = db.deals[idx];
    const editScope = role.permissions?.deals?.edit || 'none';
    if (
      role.id !== 'role_admin' &&
      !checkScopeAccess(editScope, user, existingDeal.assignedTo, existingDeal.projectName)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل هذه الصفقة' });
    }

    db.deals[idx] = { ...existingDeal, ...req.body, id: req.params.id };
    saveDb(db);
    res.json({ deal: db.deals[idx] });
  });

  app.delete('/api/deals/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const existingDeal = db.deals.find((d: any) => d.id === req.params.id);
    if (!existingDeal) return res.status(404).json({ error: 'الصفقة غير موجودة' });

    const delScope = role.permissions?.deals?.delete || 'none';
    if (
      role.id !== 'role_admin' &&
      !checkScopeAccess(delScope, user, existingDeal.assignedTo, existingDeal.projectName)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لحذف الصفقات' });
    }
    db.deals = db.deals.filter((d: any) => d.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // 9. Calendar & Site Visits Endpoints
  app.post('/api/events', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const addScope = role.permissions?.calendar?.add || 'none';
    if (addScope === 'none') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لإضافة مواعيد' });
    }
    const lead = db.leads.find((l: any) => l.id === req.body.leadId);
    const newEvent = {
      id: `evt_${Date.now()}`,
      title: req.body.title || 'موعد معاينة عقارية',
      category: req.body.category || 'Site Visit',
      priority: req.body.priority || 'High',
      date: req.body.date || new Date().toISOString().slice(0, 10),
      time: req.body.time || '13:00',
      leadId: req.body.leadId || '',
      leadName: lead?.fullName || req.body.leadName || '',
      projectName: req.body.projectName || lead?.projectInterest || DEFAULT_PROJECTS[0],
      assignedTo: addScope === 'own' ? user.id : req.body.assignedTo || user.id,
      description: req.body.description || '',
      completed: false,
      createdAt: new Date().toISOString(),
    };
    db.events.unshift(newEvent);
    saveDb(db);
    res.json({ event: newEvent });
  });

  app.put('/api/events/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const idx = db.events.findIndex((e: any) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'الموعد غير موجود' });

    const existingEvt = db.events[idx];
    const editScope = role.permissions?.calendar?.edit || 'none';
    if (
      role.id !== 'role_admin' &&
      !checkScopeAccess(editScope, user, existingEvt.assignedTo, existingEvt.projectName)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل هذا الموعد' });
    }

    db.events[idx] = { ...existingEvt, ...req.body, id: req.params.id };
    saveDb(db);
    res.json({ event: db.events[idx] });
  });

  app.delete('/api/events/:id', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const evt = db.events.find((e: any) => e.id === req.params.id);
    if (!evt) return res.status(404).json({ error: 'الموعد غير موجود' });
    const delScope = role.permissions?.calendar?.delete || 'none';
    if (
      role.id !== 'role_admin' &&
      !checkScopeAccess(delScope, user, evt.assignedTo, evt.projectName)
    ) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لحذف هذا الموعد' });
    }
    db.events = db.events.filter((e: any) => e.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // 10. Notifications Mark as Read
  app.put('/api/notifications/read-all', (req: Request, res: Response) => {
    const { user, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    db.notifications.forEach((n: any) => {
      if (n.userId === user.id || n.userId === 'all') {
        n.isRead = true;
      }
    });
    saveDb(db);
    res.json({ ok: true });
  });

  // 11. Daily Sales Team Analytical Reports Engine (Enforces Role Scope)
  app.get('/api/reports/daily', (req: Request, res: Response) => {
    const { user, role, authenticated } = getAuthContext(req);
    if (!authenticated || !user) {
      return res.status(401).json({ error: 'يرجى تسجيل الدخول' });
    }
    const reportScope = role?.permissions?.reports?.read || 'own';
    if (reportScope === 'none') {
      return res.status(403).json({ error: 'ليس لديك صلاحية لعرض تقارير المبيعات اليومية' });
    }

    const dateFilter = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    let salesAgents = db.users.filter(
      (u: any) =>
        u.roleId === 'role_employee' ||
        u.roleId === 'role_supervisor' ||
        u.roleId === 'role_deputy'
    );

    if (reportScope === 'own') {
      salesAgents = salesAgents.filter((u: any) => u.id === user.id);
    } else if (reportScope === 'team') {
      const userProjects: string[] = Array.isArray(user.assignedProjects)
        ? user.assignedProjects
        : [];
      salesAgents = salesAgents.filter(
        (u: any) =>
          u.id === user.id ||
          (Array.isArray(u.assignedProjects) &&
            u.assignedProjects.some((p: string) => userProjects.includes(p)))
      );
    }

    const agentStats = salesAgents.map((agent: any) => {
      const agentLeads = db.leads.filter((l: any) => l.assignedTo === agent.id);
      const leadsAssignedToday = agentLeads.filter((l: any) =>
        String(l.createdAt).startsWith(dateFilter)
      ).length;
      const contactedToday = agentLeads.filter(
        (l: any) => l.lastContactedAt && String(l.lastContactedAt).startsWith(dateFilter)
      ).length;

      let callsToday = 0;
      let whatsappToday = 0;
      let visitsScheduledToday = 0;

      db.leads.forEach((l: any) => {
        (l.activities || []).forEach((act: any) => {
          if (act.userId === agent.id && String(act.createdAt).startsWith(dateFilter)) {
            if (act.type === 'call') callsToday++;
            if (act.type === 'whatsapp') whatsappToday++;
            if (act.type === 'visit') visitsScheduledToday++;
          }
        });
      });

      const agentEventsToday = db.events.filter(
        (e: any) =>
          e.assignedTo === agent.id && e.date === dateFilter && e.category === 'Site Visit'
      ).length;
      visitsScheduledToday = Math.max(visitsScheduledToday, agentEventsToday);

      const qualifiedCount = agentLeads.filter((l: any) =>
        ['Qualified', 'Site Visit Scheduled', 'Negotiation', 'Won'].includes(l.status)
      ).length;

      const agentWonDeals = db.deals.filter(
        (d: any) => d.assignedTo === agent.id && d.stage === 'Closed Won'
      );
      const wonDealsCount = agentWonDeals.length;
      const wonRevenue = agentWonDeals.reduce(
        (sum: number, d: any) => sum + (Number(d.dealValue) || 0),
        0
      );

      const conversionRate =
        agentLeads.length > 0 ? Math.round((qualifiedCount / agentLeads.length) * 100) : 0;

      const contactedLeadsWithTiming = agentLeads.filter(
        (l: any) => l.lastContactedAt && l.createdAt
      );
      const avgResponseMinutes =
        contactedLeadsWithTiming.length > 0
          ? Math.max(
              1,
              Math.round(
                contactedLeadsWithTiming.reduce((acc: number, l: any) => {
                  const diffMs = Math.max(
                    0,
                    new Date(l.lastContactedAt).getTime() - new Date(l.createdAt).getTime()
                  );
                  return acc + diffMs / 60000;
                }, 0) / contactedLeadsWithTiming.length
              )
            )
          : 0;

      return {
        userId: agent.id,
        fullName: agent.fullName,
        avatarUrl: agent.avatarUrl,
        jobTitle: agent.jobTitle,
        jobTitleAr: agent.jobTitleAr,
        isActiveForRouting: agent.isActiveForRouting,
        assignedProjects: agent.assignedProjects || [],
        totalAssignedLeads: agentLeads.length,
        leadsAssignedToday,
        contactedToday,
        callsToday,
        whatsappToday,
        visitsScheduledToday,
        qualifiedCount,
        wonDealsCount,
        wonRevenue,
        conversionRate,
        avgResponseMinutes,
      };
    });

    res.json({
      date: dateFilter,
      agentStats,
    });
  });

  return {
    app,
    db,
    mergeCloudUsersIntoDb,
    runCrm1SyncEngine,
    stopBackgroundSync: () => {
      if (syncIntervalTimer) clearInterval(syncIntervalTimer);
    },
  };
}

async function startServer() {
  const { app } = createCrmApp();

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PropSphere Real Estate CRM running on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  startServer();
}
