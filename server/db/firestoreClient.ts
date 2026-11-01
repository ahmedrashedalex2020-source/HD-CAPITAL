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
if (getApps().length === 0) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail,
        privateKey,
      }),
      projectId: FIREBASE_PROJECT_ID,
    });
  } else {
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId: FIREBASE_PROJECT_ID,
    });
  }
} else {
  adminApp = getApps()[0]!;
}

export const adminFirestore: Firestore =
  FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== '(default)'
    ? getFirestore(adminApp, FIRESTORE_DATABASE_ID)
    : getFirestore(adminApp);

try {
  adminFirestore.settings({ ignoreUndefinedProperties: true });
} catch {
  // settings() may already have been called
}

let serverClientFirestore: ClientFirestore | null = null;
let serverFirestoreWriteQuotaExhausted = false;
let lastSyncedWorkspaceFingerprint = '';
let lastSyncedTimestampMs = 0;

function markServerWriteQuotaExhausted(): void {
  serverFirestoreWriteQuotaExhausted = true;
}

/**
 * Returns the Firebase Web SDK Firestore instance for read operations.
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
            mergedMap.set(u.id, u);
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
          const prev = mergedMap.get(u.id) || {};
          mergedMap.set(u.id, { ...prev, ...u });
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
          mergedUsers.set(u.id, u);
        }
      }
    }

    if (usersSnap) {
      for (const d of usersSnap.docs) {
        const u = d.data();
        if (u && u.id && !isExplicitFakeDemoUserRecord(u) && !FAKE_DEMO_USER_IDS.has(d.id)) {
          const prev = mergedUsers.get(u.id) || {};
          mergedUsers.set(u.id, { ...prev, ...u });
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

export async function removeUserFromLiveCloudFirestore(userId: string): Promise<void> {
  if (!firestoreDirectAvailable || serverFirestoreWriteQuotaExhausted || !userId) return;
  try {
    await adminFirestore.collection('users').doc(userId).delete();
  } catch {
    markServerWriteQuotaExhausted();
  }
}

/**
 * Syncs the CRM workspace state to `crm_state/workspace` in Cloud Firestore with deduplication,
 * rate-limiting, and an automatic write circuit-breaker if the free-tier daily write quota is exhausted.
 */
export async function syncStateToLiveCloudFirestore(state: any): Promise<boolean> {
  if (!firestoreDirectAvailable || serverFirestoreWriteQuotaExhausted || !state) return false;
  const nowMs = Date.now();
  if (nowMs - lastSyncedTimestampMs < 30000) {
    return false;
  }

  try {
    const safeUsers = (state.users || [])
      .filter((u: any) => !isExplicitFakeDemoUserRecord(u))
      .map(({ passwordHash: _ph, ...u }: any) => u);

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
      uIds: safeUsers.map((u: any) => `${u.id}:${u.username}:${u.fullName}`).join(','),
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

    await adminFirestore
      .collection('crm_state')
      .doc('workspace')
      .set(workspacePayload, { merge: true });

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
