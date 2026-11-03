import 'dotenv/config';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import {
  initializeApp as initClientApp,
  getApps as getClientApps,
  getApp as getClientAppInstance,
} from 'firebase/app';
import {
  getFirestore as getClientFirestoreSdk,
  doc as clientDoc,
  getDoc as clientGetDoc,
  setDoc as clientSetDoc,
  deleteDoc as clientDeleteDoc,
  collection as clientCollection,
  getDocs as clientGetDocs,
  setLogLevel as setClientFirestoreLogLevel,
  Firestore as ClientFirestore,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Silence internal @firebase/firestore gRPC retry/quota console.error spam
try {
  setClientFirestoreLogLevel('silent');
} catch {
  // ignore
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AppletFirebaseConfig {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  firestoreDatabaseId?: string;
}

function loadAppletConfig(): AppletFirebaseConfig {
  try {
    const configPath = path.resolve(__dirname, '../../firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // ignore if missing
  }
  return {};
}

const appletConfig = loadAppletConfig();

export const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  appletConfig.projectId ||
  '';

export const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  appletConfig.firestoreDatabaseId ||
  '(default)';

export const firestoreDatabaseId = FIRESTORE_DATABASE_ID;

let adminApp: App;
let hasExplicitServiceAccountCreds = false;
if (getApps().length === 0) {
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  let privateKey: string | undefined = undefined;

  if (rawPrivateKey) {
    let key = rawPrivateKey.trim();
    // 1. Handle JSON-wrapped private key (common if whole service account is pasted)
    if (key.startsWith('{')) {
      try {
        const parsed = JSON.parse(key);
        key = parsed.private_key || parsed.privateKey || key;
      } catch {
        // ignore JSON parse error, use as string
      }
    }
    // 2. Remove potential surrounding quotes
    if (key.startsWith('"') && key.endsWith('"')) {
      key = key.substring(1, key.length - 1);
    }
    // 3. Unescape newlines (literal \n to real newline)
    key = key.replace(/\\n/g, '\n');
    // 4. Ensure it has PEM headers if it looks like a key but headers are missing
    if (key && !key.includes('-----BEGIN')) {
      key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
    }
    privateKey = key;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  try {
    if (clientEmail && privateKey) {
      adminApp = initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail,
          privateKey,
        }),
        projectId: FIREBASE_PROJECT_ID,
      });
      hasExplicitServiceAccountCreds = true;
    } else {
      adminApp = initializeApp({
        projectId: FIREBASE_PROJECT_ID || 'dummy-project',
      });
    }
  } catch (err: any) {
    console.error('[Firestore] Failed to initialize Firebase Admin SDK:', err.message);
    adminApp = initializeApp(
      {
        projectId: FIREBASE_PROJECT_ID || 'dummy-project',
      },
      'fallback-app'
    );
  }
} else {
  adminApp = getApps()[0]!;
}

function initAdminFirestoreSafe(): Firestore {
  try {
    const db =
      FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== '(default)'
        ? getFirestore(adminApp, FIRESTORE_DATABASE_ID)
        : getFirestore(adminApp);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() may already have been called
    }
    return db;
  } catch (err: any) {
    console.warn('[Firestore] Fallback Firestore instance notice:', err?.message || err);
    return getFirestore(adminApp);
  }
}

export const adminFirestore: Firestore = initAdminFirestoreSafe();

let serverClientFirestore: ClientFirestore | null = null;
let serverFirestoreWriteQuotaExhausted = false;
let lastSyncedWorkspaceFingerprint = '';
let lastSyncedTimestampMs = 0;

function markServerWriteQuotaExhausted(): void {
  serverFirestoreWriteQuotaExhausted = true;
}

/**
 * Returns the Firebase Web SDK Firestore instance for read/write operations.
 * Write-quota exhaustion NEVER disables read operations from Firestore.
 */
export function getServerWebFirestore(): ClientFirestore | null {
  if (serverClientFirestore) return serverClientFirestore;
  if (!appletConfig.apiKey || !appletConfig.projectId) return null;
  try {
    setClientFirestoreLogLevel('silent');
    const app =
      getClientApps().length === 0
        ? initClientApp({
            apiKey: appletConfig.apiKey,
            authDomain: appletConfig.authDomain,
            projectId: appletConfig.projectId,
            storageBucket: appletConfig.storageBucket,
            messagingSenderId: appletConfig.messagingSenderId,
            appId: appletConfig.appId,
          })
        : getClientAppInstance();
    serverClientFirestore =
      FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== '(default)'
        ? getClientFirestoreSdk(app, FIRESTORE_DATABASE_ID)
        : getClientFirestoreSdk(app);
    return serverClientFirestore;
  } catch {
    return null;
  }
}

const FAKE_DEMO_USER_IDS = new Set([
  'usr_supervisor',
  'usr_sales1',
  'usr_sales2',
  'usr_sales3',
  'usr_deputy',
  'usr_1793095150415_61ql',
]);

export function isExplicitFakeDemoUserRecord(u: any): boolean {
  if (!u || typeof u !== 'object') return true;
  const uid = String(u.id || '').trim();
  if (FAKE_DEMO_USER_IDS.has(uid)) return true;
  const uname = String(u.username || '').trim().toLowerCase();
  const fname = String(u.fullName || '').trim();
  if (uname === 'test1' && fname.includes('تجريبي')) return true;
  // Filter out the legacy template admin (أحمد راشد) so only Hassan Shehata & real sales team remain
  if (
    (uid === 'usr_admin' || uname === 'admin') &&
    (fname.includes('أحمد راشد') || fname.includes('احمد راشد') || fname.includes('Ahmed Rashed'))
  ) {
    return true;
  }
  return false;
}

function getRecordTs(rec: any): number {
  if (!rec || typeof rec !== 'object') return 0;
  const candidate = rec.updatedAt || rec.createdAt || '';
  if (!candidate) return 0;
  const parsed = Date.parse(String(candidate));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeUserRecordsPreservingAuth(existing: any, incoming: any): any {
  if (!existing) return incoming ? { ...incoming } : {};
  if (!incoming) return { ...existing };

  const existingTs = getRecordTs(existing);
  const incomingTs = getRecordTs(incoming);
  const existingIsNewer = existingTs > incomingTs;

  const base = existingIsNewer ? incoming : existing;
  const winner = existingIsNewer ? existing : incoming;

  const merged: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(winner)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }

  // Strictly preserve authentication fields so undefined or stripped fields never wipe credentials
  const authFields = ['password', 'accessPassword', 'passwordHash', 'clientAuthDigest'] as const;
  for (const field of authFields) {
    const winVal = winner[field];
    const baseVal = base[field];
    if (winVal !== undefined && winVal !== null && String(winVal).trim() !== '') {
      merged[field] = winVal;
    } else if (baseVal !== undefined && baseVal !== null && String(baseVal).trim() !== '') {
      merged[field] = baseVal;
    }
  }

  // Keep password and accessPassword synchronized if either is present
  const resolvedPass = merged.accessPassword || merged.password;
  if (resolvedPass && String(resolvedPass).trim() !== '') {
    merged.accessPassword = String(resolvedPass).trim();
    merged.password = merged.accessPassword;
  }

  return merged;
}

/**
 * Pulls real employee/user accounts from live Google Firebase Cloud Firestore (`users` collection and `crm_state/workspace`).
 * Strictly read-only (never issues delete/write operations during reads, and remains active even if write quota is full).
 */
export async function pullUsersFromLiveCloudFirestore(): Promise<any[]> {
  const webDb = getServerWebFirestore();
  if (!webDb) return [];
  try {
    const [usersSnap, wsSnap] = await Promise.all([
      clientGetDocs(clientCollection(webDb, 'users')).catch(() => null),
      clientGetDoc(clientDoc(webDb, 'crm_state', 'workspace')).catch(() => null),
    ]);

    const mergedMap = new Map<string, any>();

    if (wsSnap && wsSnap.exists()) {
      const wsData = wsSnap.data();
      if (Array.isArray(wsData?.users)) {
        for (const u of wsData.users) {
          if (u && u.id && !isExplicitFakeDemoUserRecord(u)) {
            mergedMap.set(u.id, mergeUserRecordsPreservingAuth(mergedMap.get(u.id), u));
          }
        }
      }
    }

    if (usersSnap) {
      for (const d of usersSnap.docs) {
        const u = d.data();
        if (isExplicitFakeDemoUserRecord(u) || FAKE_DEMO_USER_IDS.has(d.id)) {
          continue;
        }
        if (u && u.id) {
          mergedMap.set(u.id, mergeUserRecordsPreservingAuth(mergedMap.get(u.id), u));
        }
      }
    }

    return Array.from(mergedMap.values());
  } catch {
    return [];
  }
}

/**
 * Pulls the full workspace document + users collection from live Cloud Firestore on server boot.
 */
export async function pullWorkspaceFromLiveCloudFirestore(): Promise<any | null> {
  const webDb = getServerWebFirestore();
  if (!webDb) return null;
  try {
    const [usersSnap, wsSnap] = await Promise.all([
      clientGetDocs(clientCollection(webDb, 'users')).catch(() => null),
      clientGetDoc(clientDoc(webDb, 'crm_state', 'workspace')).catch(() => null),
    ]);

    const wsData = wsSnap && wsSnap.exists() ? wsSnap.data() : {};
    const mergedUsers = new Map<string, any>();

    if (Array.isArray(wsData?.users)) {
      for (const u of wsData.users) {
        if (u && u.id && !isExplicitFakeDemoUserRecord(u)) {
          mergedUsers.set(u.id, mergeUserRecordsPreservingAuth(mergedUsers.get(u.id), u));
        }
      }
    }

    if (usersSnap) {
      for (const d of usersSnap.docs) {
        const u = d.data();
        if (u && u.id && !isExplicitFakeDemoUserRecord(u) && !FAKE_DEMO_USER_IDS.has(d.id)) {
          mergedUsers.set(u.id, mergeUserRecordsPreservingAuth(mergedUsers.get(u.id), u));
        }
      }
    }

    return {
      ...wsData,
      users: Array.from(mergedUsers.values()),
    };
  } catch {
    return null;
  }
}

/**
 * Persists a single user record (with password, accessPassword, passwordHash, and clientAuthDigest intact)
 * directly to the `users/{id}` collection in Cloud Firestore.
 */
export async function saveUserToLiveCloudFirestore(user: any): Promise<void> {
  if (serverFirestoreWriteQuotaExhausted || !user || !user.id) return;
  const cleanUser = JSON.parse(
    JSON.stringify({
      ...user,
      password: user.accessPassword || user.password,
      accessPassword: user.accessPassword || user.password,
    })
  );
  if (firestoreDirectAvailable) {
    try {
      await adminFirestore.collection('users').doc(user.id).set(cleanUser, { merge: true });
      return;
    } catch {
      // fall through to webDb bridge
    }
  }
  const webDb = getServerWebFirestore();
  if (!webDb) return;
  try {
    await Promise.race([
      clientSetDoc(clientDoc(webDb, 'users', user.id), cleanUser, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500)),
    ]);
  } catch {
    markServerWriteQuotaExhausted();
  }
}

export async function removeUserFromLiveCloudFirestore(userId: string): Promise<void> {
  if (serverFirestoreWriteQuotaExhausted || !userId) return;
  if (firestoreDirectAvailable) {
    try {
      await adminFirestore.collection('users').doc(userId).delete();
      return;
    } catch {
      // fall through to webDb bridge
    }
  }
  const webDb = getServerWebFirestore();
  if (!webDb) return;
  try {
    await Promise.race([
      clientDeleteDoc(clientDoc(webDb, 'users', userId)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500)),
    ]);
  } catch {
    markServerWriteQuotaExhausted();
  }
}

/**
 * Syncs the CRM workspace state to `crm_state/workspace` in Cloud Firestore with deduplication,
 * rate-limiting, and an automatic write circuit-breaker if the free-tier daily write quota is exhausted.
 * Preserves all user password & authentication fields (`password`, `accessPassword`, `passwordHash`, `clientAuthDigest`).
 */
export async function syncStateToLiveCloudFirestore(state: any): Promise<boolean> {
  if (serverFirestoreWriteQuotaExhausted || !state) return false;
  const webDb = getServerWebFirestore();
  if (!firestoreDirectAvailable && !webDb) return false;
  const nowMs = Date.now();
  if (nowMs - lastSyncedTimestampMs < 10000) {
    return false;
  }

  try {
    const safeUsers = (state.users || [])
      .filter((u: any) => !isExplicitFakeDemoUserRecord(u))
      .map((u: any) => ({
        ...u,
        password: u.accessPassword || u.password,
        accessPassword: u.accessPassword || u.password,
      }));

    const coreData = {
      roles: state.roles || [],
      users: safeUsers,
      leads: state.leads || [],
      properties: state.properties || [],
      deals: state.deals || [],
      events: state.events || [],
      sheetConnections: state.sheetConnections || [],
      syncLogs: (state.syncLogs || []).slice(0, 30),
      notifications: (state.notifications || []).slice(0, 50),
      projects: state.projects || [],
      projectsCatalog: state.projectsCatalog || [],
      deletedUserIds: state.deletedUserIds || [],
      deletedProjectIds: state.deletedProjectIds || [],
      deletedPropertyIds: state.deletedPropertyIds || [],
      deletedLeadIds: state.deletedLeadIds || [],
    };

    const fingerprint = JSON.stringify({
      uIds: safeUsers
        .map((u: any) => `${u.id}:${u.username}:${u.fullName}:${u.accessPassword || ''}:${u.updatedAt || ''}`)
        .join(','),
      lCount: coreData.leads.length,
      lTop: coreData.leads[0]?.updatedAt || '',
      pCount: coreData.projectsCatalog.length,
      propCount: coreData.properties.length,
      dCount: coreData.deals.length,
    });

    if (fingerprint === lastSyncedWorkspaceFingerprint) {
      return true;
    }

    const workspacePayload = JSON.parse(
      JSON.stringify({
        ...coreData,
        updatedAt: new Date().toISOString(),
      })
    );

    if (firestoreDirectAvailable) {
      await adminFirestore
        .collection('crm_state')
        .doc('workspace')
        .set(workspacePayload, { merge: true });
    } else if (webDb) {
      await Promise.race([
        clientSetDoc(clientDoc(webDb, 'crm_state', 'workspace'), workspacePayload, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2500)),
      ]);
    }

    lastSyncedWorkspaceFingerprint = fingerprint;
    lastSyncedTimestampMs = nowMs;
    return true;
  } catch {
    markServerWriteQuotaExhausted();
    return false;
  }
}

let firestoreConnectivityChecked = false;
let firestoreDirectAvailable = false;
let firestoreWebBridgeAvailable = false;

export async function verifyFirestoreConnectivity(): Promise<boolean> {
  if (firestoreConnectivityChecked) {
    return firestoreDirectAvailable || firestoreWebBridgeAvailable;
  }
  firestoreConnectivityChecked = true;
  if (hasExplicitServiceAccountCreds) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_PROBE_TIMEOUT')), 2500)
      );
      await Promise.race([
        adminFirestore.collection('settings').doc('global').get(),
        timeoutPromise,
      ]);
      firestoreDirectAvailable = true;
      console.log(
        `[Firestore] Connected to Cloud Firestore via firebase-admin (project=${FIREBASE_PROJECT_ID}, database=${FIRESTORE_DATABASE_ID})`
      );
      return true;
    } catch {
      firestoreDirectAvailable = false;
    }
  }

  // Fallback to real Cloud Firestore Web SDK bridge with firebase-applet-config.json
  try {
    const webDb = getServerWebFirestore();
    if (webDb) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('WEB_FIRESTORE_PROBE_TIMEOUT')), 4000)
      );
      await Promise.race([
        clientGetDoc(clientDoc(webDb, 'crm_state', 'workspace')),
        timeoutPromise,
      ]);
      firestoreWebBridgeAvailable = true;
      console.log(
        `[Firestore] Connected to live Google Firebase Cloud Firestore (project=${FIREBASE_PROJECT_ID}, database=${FIRESTORE_DATABASE_ID})`
      );
      return true;
    }
  } catch (err: any) {
    console.warn('[Firestore] Web SDK probe notice:', err?.message || err);
  }

  return false;
}

export function isCloudFirestoreActive(): boolean {
  return firestoreDirectAvailable;
}

export function isLiveFirestoreConnected(): boolean {
  return firestoreDirectAvailable || firestoreWebBridgeAvailable;
}
