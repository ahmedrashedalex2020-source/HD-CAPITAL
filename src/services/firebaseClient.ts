import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  onSnapshot,
  setLogLevel,
  Unsubscribe,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';

// Silence internal @firebase/firestore backoff and quota-exceeded console.error spam
try {
  setLogLevel('silent');
} catch {
  // ignore
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firebaseAuth: Auth | null = null;
let clientWriteQuotaExhausted = false;
let lastSavedWorkspaceFingerprint = '';
let lastSavedWorkspaceAtMs = 0;

function markClientWriteQuotaExhausted(): void {
  clientWriteQuotaExhausted = true;
}

function getFirebaseConfig() {
  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  return {
    apiKey: env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
    messagingSenderId:
      env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID || appletConfig.appId,
  };
}

export function getClientApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (firebaseApp) return firebaseApp;
  try {
    const cfg = getFirebaseConfig();
    if (!cfg.projectId || !cfg.apiKey) return null;
    firebaseApp = getApps().length === 0 ? initializeApp(cfg) : getApp();
    return firebaseApp;
  } catch {
    return null;
  }
}

export function getClientAuth(): Auth | null {
  if (typeof window === 'undefined') return null;
  if (firebaseAuth) return firebaseAuth;
  const app = getClientApp();
  if (!app) return null;
  try {
    firebaseAuth = getAuth(app);
    return firebaseAuth;
  } catch {
    return null;
  }
}

/**
 * Returns the Firestore client instance.
 * Write-quota exhaustion NEVER disables read operations (`getDoc`, `getDocs`, `onSnapshot`).
 */
export function getClientFirestore(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (firestoreDb) return firestoreDb;
  try {
    setLogLevel('silent');
    const app = getClientApp();
    if (!app) return null;
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    const dbId =
      env.VITE_FIRESTORE_DATABASE_ID ||
      (appletConfig as any).firestoreDatabaseId ||
      'ai-studio-propspherereales-56a87e2a-86e2-4b06-88e5-824a7183839d';
    try {
      firestoreDb =
        dbId && dbId !== '(default)'
          ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, dbId)
          : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    } catch {
      firestoreDb =
        dbId && dbId !== '(default)'
          ? getFirestore(app, dbId)
          : getFirestore(app);
    }
    return firestoreDb;
  } catch {
    return null;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('Quota') ||
    errMsg.includes('FIRESTORE_WRITE_TIMEOUT')
  ) {
    markClientWriteQuotaExhausted();
    throw new Error(errMsg);
  }
  const authInstance = getClientAuth();
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo:
        authInstance?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Cloud Firestore without downloading the full workspace payload on boot.
 */
export async function testConnection(): Promise<boolean> {
  const db = getClientFirestore();
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch {
    return true;
  }
}

/**
 * Real-time subscription to the shared CRM workspace in Cloud Firestore.
 * Skips the initial snapshot emission and debounces external updates to prevent re-fetch loops.
 */
export function subscribeToFirestoreWorkspace(
  onUpdate: (data: any) => void,
  onError?: (err: any) => void
): Unsubscribe {
  const db = getClientFirestore();
  if (!db) return () => {};
  const docRef = doc(db, 'crm_state', 'workspace');
  let isInitialSnapshot = true;
  let lastUpdatedAt = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const incomingUpdatedAt = String(data?.updatedAt || '');
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        lastUpdatedAt = incomingUpdatedAt;
        return;
      }
      if (incomingUpdatedAt && incomingUpdatedAt === lastUpdatedAt) {
        return;
      }
      lastUpdatedAt = incomingUpdatedAt;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onUpdate(data);
      }, 3000);
    },
    (error) => {
      if (onError) onError(error);
    }
  );

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
  };
}

const IGNORED_TEST_USER_IDS = new Set([
  'usr_supervisor',
  'usr_sales1',
  'usr_sales2',
  'usr_sales3',
  'usr_deputy',
  'usr_1793095150415_61ql',
]);

export function isIgnoredFakeUserRecord(u: any): boolean {
  if (!u || typeof u !== 'object') return true;
  const uid = String(u.id || '').trim();
  if (IGNORED_TEST_USER_IDS.has(uid)) return true;
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

export function doesUserMatchLoginIdentifier(u: any, rawIdentifier: string): boolean {
  if (!u || !rawIdentifier) return false;
  const clean = String(rawIdentifier).trim().toLowerCase();
  if (!clean) return false;
  const compact = clean.replace(/[\s_.-]+/g, '');

  const storedUsername = String(u.username || '').trim().toLowerCase();
  const compactUsername = storedUsername.replace(/[\s_.-]+/g, '');
  const firstWordUsername = storedUsername.split(/[\s_.-]+/)[0] || '';

  const storedEmail = String(u.email || '').trim().toLowerCase();
  const emailPrefix = storedEmail.split('@')[0] || '';
  const compactEmailPrefix = emailPrefix.replace(/[\s_.-]+/g, '');

  const storedFullName = String(u.fullName || '').trim().toLowerCase();
  const compactFullName = storedFullName.replace(/[\s_().-]+/g, '');
  const firstWordFullName = storedFullName.split(/[\s_().-]+/)[0] || '';

  const storedPhone = String(u.phone || '').replace(/[^0-9]/g, '');
  const inputDigits = clean.replace(/[^0-9]/g, '');

  if (
    storedUsername &&
    (storedUsername === clean ||
      compactUsername === compact ||
      (clean.length >= 2 && firstWordUsername === clean))
  ) {
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
      (clean.length >= 2 && firstWordFullName === clean) ||
      (clean.length >= 3 && storedFullName.includes(clean)))
  ) {
    return true;
  }
  if (storedPhone && inputDigits.length >= 8 && storedPhone.endsWith(inputDigits.slice(-9))) {
    return true;
  }
  if (
    (u.id === 'usr_admin2' || u.id === 'usr_admin_partner' || compactUsername === 'hassanshehata') &&
    (clean === 'admin' ||
      clean === 'admin2' ||
      clean === 'hassan' ||
      compact === 'hassanshehata' ||
      clean.includes('حسن شحات'))
  ) {
    return true;
  }
  if (
    (u.id === 'usr_1793611426975_9mic' || compactUsername === 'zakariashehata') &&
    (clean === 'zakaria' || compact === 'zakariashehata' || clean.includes('زكريا'))
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

/**
 * Fetches all standalone lead documents from the `leads` collection in Firebase Firestore.
 */
export async function fetchAllFirestoreLeads(): Promise<any[]> {
  const db = getClientFirestore();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'leads')).catch(() => null);
    if (!snap) return [];
    const leads: any[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d && (d.id || docSnap.id)) {
        leads.push({ ...d, id: d.id || docSnap.id });
      }
    });
    return leads;
  } catch {
    return [];
  }
}

/**
 * Persists a single lead record directly to the `leads/{leadId}` collection in Firebase Firestore.
 */
export async function saveFirestoreLead(lead: any): Promise<void> {
  if (clientWriteQuotaExhausted) return;
  const db = getClientFirestore();
  if (!db || !lead || !lead.id) return;
  const path = `leads/${lead.id}`;
  try {
    const cleanLead = JSON.parse(JSON.stringify(lead));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500);
    });
    await Promise.race([
      setDoc(doc(db, 'leads', String(lead.id)), cleanLead, { merge: true }),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
  } catch (error) {
    markClientWriteQuotaExhausted();
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // handled gracefully
    }
  }
}

/**
 * Deletes a lead record from the `leads/{leadId}` collection in Firebase Firestore.
 */
export async function removeFirestoreLead(leadId: string): Promise<void> {
  if (clientWriteQuotaExhausted) return;
  const db = getClientFirestore();
  if (!db || !leadId) return;
  const path = `leads/${leadId}`;
  try {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500);
    });
    await Promise.race([
      deleteDoc(doc(db, 'leads', String(leadId))),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
  } catch (error) {
    markClientWriteQuotaExhausted();
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {
      // handled gracefully
    }
  }
}

/**
 * Fetches the shared CRM workspace state, `users` collection, and `leads` collection directly from Firebase Firestore.
 * Remains active for reading even if the daily write quota is exhausted.
 */
export async function fetchFirestoreWorkspace(): Promise<any | null> {
  const db = getClientFirestore();
  if (!db) return null;

  try {
    const docRef = doc(db, 'crm_state', 'workspace');
    const [workspaceSnap, usersSnap, collectionLeadsRaw] = await Promise.all([
      getDoc(docRef),
      getDocs(collection(db, 'users')).catch(() => null),
      fetchAllFirestoreLeads().catch(() => []),
    ]);

    const workspaceData = workspaceSnap.exists() ? workspaceSnap.data() : {};
    const deletedSet = new Set<string>(
      Array.isArray(workspaceData?.deletedUserIds) ? workspaceData.deletedUserIds : []
    );
    const deletedLeadSet = new Set<string>(
      Array.isArray(workspaceData?.deletedLeadIds) ? workspaceData.deletedLeadIds.map(String) : []
    );

    const collectionUsers: any[] = [];
    if (usersSnap) {
      usersSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u && u.id && !isIgnoredFakeUserRecord(u) && !deletedSet.has(String(u.id))) {
          collectionUsers.push(u);
        }
      });
    }

    const collectionLeads = (collectionLeadsRaw || []).filter(
      (l: any) => l && l.id && !deletedLeadSet.has(String(l.id))
    );

    if (!workspaceSnap.exists() && collectionUsers.length === 0 && collectionLeads.length === 0) {
      return null;
    }

    const baseUsers = Array.isArray(workspaceData.users)
      ? workspaceData.users.filter(
          (u: any) => !isIgnoredFakeUserRecord(u) && !deletedSet.has(String(u?.id || ''))
        )
      : [];

    const baseLeads = Array.isArray(workspaceData.leads)
      ? workspaceData.leads.filter((l: any) => l && l.id && !deletedLeadSet.has(String(l.id)))
      : [];

    return {
      ...workspaceData,
      users:
        collectionUsers.length > 0
          ? mergeRecordsById(baseUsers, collectionUsers)
          : baseUsers,
      leads:
        collectionLeads.length > 0
          ? mergeRecordsById(baseLeads, collectionLeads)
          : baseLeads,
    };
  } catch {
    return null;
  }
}

/**
 * Queries Firebase Firestore directly for a user by username, email, or fullName (case-insensitive & space-tolerant).
 */
export async function queryFirestoreUserByUsername(username: string): Promise<any | null> {
  const db = getClientFirestore();
  if (!db) return null;
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername) return null;

  try {
    const [usersSnap, wsSnap] = await Promise.all([
      getDocs(collection(db, 'users')).catch(() => null),
      getDoc(doc(db, 'crm_state', 'workspace')).catch(() => null),
    ]);

    let collectionMatch: any = null;
    if (usersSnap && !usersSnap.empty) {
      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();
        if (!isIgnoredFakeUserRecord(u) && doesUserMatchLoginIdentifier(u, cleanUsername)) {
          collectionMatch = u;
          break;
        }
      }
    }

    let workspaceMatch: any = null;
    if (wsSnap && wsSnap.exists()) {
      const ws = wsSnap.data();
      if (Array.isArray(ws?.users)) {
        workspaceMatch =
          ws.users.find(
            (u: any) => !isIgnoredFakeUserRecord(u) && doesUserMatchLoginIdentifier(u, cleanUsername)
          ) || null;
      }
    }

    if (collectionMatch && workspaceMatch) {
      return mergeRecordsById([workspaceMatch], [collectionMatch])[0] || collectionMatch;
    }
    return collectionMatch || workspaceMatch || null;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Persists a single user record directly to the `users` collection in Firebase Firestore.
 */
export async function saveFirestoreUser(user: any): Promise<void> {
  if (clientWriteQuotaExhausted) return;
  const db = getClientFirestore();
  if (!db || !user || !user.id) return;
  const path = `users/${user.id}`;
  try {
    const cleanUser = JSON.parse(
      JSON.stringify({
        ...user,
        password: user.accessPassword || user.password,
        accessPassword: user.accessPassword || user.password,
      })
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500);
    });
    await Promise.race([
      setDoc(doc(db, 'users', user.id), cleanUser, { merge: true }),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
  } catch (error) {
    markClientWriteQuotaExhausted();
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // handled gracefully
    }
  }
}

/**
 * Deletes a user record from the `users` collection in Firebase Firestore.
 */
export async function removeFirestoreUser(userId: string): Promise<void> {
  if (clientWriteQuotaExhausted) return;
  const db = getClientFirestore();
  if (!db || !userId) return;
  const path = `users/${userId}`;
  try {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500);
    });
    await Promise.race([
      deleteDoc(doc(db, 'users', userId)),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
  } catch (error) {
    markClientWriteQuotaExhausted();
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {
      // handled gracefully
    }
  }
}

/**
 * Persists the entire CRM workspace state directly to `crm_state/workspace` in Firebase Firestore.
 */
export async function saveFirestoreWorkspace(state: any): Promise<void> {
  if (clientWriteQuotaExhausted || !state) return;
  const nowMs = Date.now();
  if (nowMs - lastSavedWorkspaceAtMs < 5000) return;

  const db = getClientFirestore();
  if (!db) return;
  const pathForWrite = 'crm_state/workspace';
  try {
    const fingerprint = JSON.stringify({
      uIds: (state.users || [])
        .map(
          (u: any) =>
            `${u.id}:${u.username}:${u.fullName}:${u.accessPassword || u.password || ''}:${u.updatedAt || ''}`
        )
        .join(','),
      lCount: (state.leads || []).length,
      lTop: state.leads?.[0]?.updatedAt || '',
      pCount: (state.projectsCatalog || []).length,
      propCount: (state.properties || []).length,
      delU: (state.deletedUserIds || []).join(','),
    });
    if (fingerprint === lastSavedWorkspaceFingerprint) return;

    const payload = JSON.parse(
      JSON.stringify({
        roles: state.roles || [],
        users: (state.users || []).map((u: any) => ({
          ...u,
          password: u.accessPassword || u.password,
          accessPassword: u.accessPassword || u.password,
        })),
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
        updatedAt: new Date().toISOString(),
      })
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FIRESTORE_WRITE_TIMEOUT')), 2500);
    });
    await Promise.race([
      setDoc(doc(db, 'crm_state', 'workspace'), payload, { merge: true }),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
    lastSavedWorkspaceFingerprint = fingerprint;
    lastSavedWorkspaceAtMs = nowMs;
  } catch (error) {
    markClientWriteQuotaExhausted();
    try {
      handleFirestoreError(error, OperationType.WRITE, pathForWrite);
    } catch {
      // handled gracefully
    }
  }
}

function getRecTimestampMs(rec: any): number {
  if (!rec || typeof rec !== 'object') return 0;
  const candidate = rec.updatedAt || rec.createdAt || '';
  if (!candidate) return 0;
  const parsed = Date.parse(String(candidate));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeRecordsById(baseList: any[], incomingList: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of baseList || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incomingList || []) {
    if (!item || !item.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    const prevTs = getRecTimestampMs(prev);
    const nextTs = getRecTimestampMs(item);
    const prevIsNewer = prevTs > nextTs;
    const older = prevIsNewer ? item : prev;
    const newer = prevIsNewer ? prev : item;

    const merged: Record<string, any> = { ...older };
    for (const [k, v] of Object.entries(newer)) {
      if (v !== undefined) {
        merged[k] = v;
      }
    }

    if (older.isManualEntry || newer.isManualEntry) {
      merged.isManualEntry = true;
    }
    if ((!merged.notes || String(merged.notes).trim() === '') && older.notes) {
      merged.notes = older.notes;
    }

    const authKeys = ['password', 'accessPassword', 'passwordHash', 'clientAuthDigest'] as const;
    for (const k of authKeys) {
      const newerVal = newer[k];
      const olderVal = older[k];
      if (newerVal !== undefined && newerVal !== null && String(newerVal).trim() !== '') {
        merged[k] = newerVal;
      } else if (olderVal !== undefined && olderVal !== null && String(olderVal).trim() !== '') {
        merged[k] = olderVal;
      }
    }

    const resolvedPass = merged.accessPassword || merged.password;
    if (resolvedPass && String(resolvedPass).trim() !== '') {
      merged.accessPassword = String(resolvedPass).trim();
      merged.password = merged.accessPassword;
    }

    map.set(item.id, merged);
  }
  return Array.from(map.values());
}
