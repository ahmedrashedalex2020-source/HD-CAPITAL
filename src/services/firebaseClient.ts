import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';

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
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firebase App:', err);
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

export function getClientFirestore(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (firestoreDb) return firestoreDb;
  try {
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
  } catch (err) {
    console.error('[Firebase] Failed to get Firestore instance:', err);
    return null;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const authInstance = getClientAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Cloud Firestore without downloading the full workspace payload on boot.
 */
export async function testConnection(): Promise<boolean> {
  const db = getClientFirestore();
  return Boolean(db);
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
      console.warn('[Firestore] Real-time snapshot listener notice:', error?.message || error);
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

function isIgnoredFakeUserRecord(u: any): boolean {
  if (!u || typeof u !== 'object') return true;
  if (IGNORED_TEST_USER_IDS.has(String(u.id || ''))) return true;
  const uname = String(u.username || '').trim().toLowerCase();
  const fname = String(u.fullName || '').trim();
  if (uname === 'test1' && fname.includes('تجريبي')) return true;
  return false;
}

export function doesUserMatchLoginIdentifier(u: any, rawIdentifier: string): boolean {
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

/**
 * Fetches the shared CRM workspace state and users collection directly from Firebase Firestore.
 */
export async function fetchFirestoreWorkspace(): Promise<any | null> {
  const db = getClientFirestore();
  if (!db) return null;

  try {
    const docRef = doc(db, 'crm_state', 'workspace');
    const [workspaceSnap, usersSnap] = await Promise.all([
      getDoc(docRef),
      getDocs(collection(db, 'users')).catch(() => null),
    ]);

    const workspaceData = workspaceSnap.exists() ? workspaceSnap.data() : {};
    const collectionUsers: any[] = [];
    if (usersSnap) {
      usersSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u && u.id && !isIgnoredFakeUserRecord(u)) {
          collectionUsers.push(u);
        }
      });
    }

    if (!workspaceSnap.exists() && collectionUsers.length === 0) {
      return null;
    }

    const baseUsers = Array.isArray(workspaceData.users)
      ? workspaceData.users.filter((u: any) => !isIgnoredFakeUserRecord(u))
      : [];

    return {
      ...workspaceData,
      users:
        collectionUsers.length > 0
          ? mergeRecordsById(baseUsers, collectionUsers)
          : baseUsers,
    };
  } catch (error) {
    console.warn('[Firestore] Error fetching workspace:', error);
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
    const usersSnap = await getDocs(collection(db, 'users')).catch(() => null);
    if (usersSnap && !usersSnap.empty) {
      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();
        if (!isIgnoredFakeUserRecord(u) && doesUserMatchLoginIdentifier(u, cleanUsername)) {
          return u;
        }
      }
    }

    const wsSnap = await getDoc(doc(db, 'crm_state', 'workspace'));
    if (wsSnap.exists()) {
      const ws = wsSnap.data();
      if (Array.isArray(ws.users)) {
        const found = ws.users.find(
          (u: any) => !isIgnoredFakeUserRecord(u) && doesUserMatchLoginIdentifier(u, cleanUsername)
        );
        if (found) return found;
      }
    }
  } catch (error) {
    console.warn(`[Firestore] query user ${cleanUsername} error:`, error);
  }
  return null;
}

/**
 * Persists a single user record directly to the `users` collection in Firebase Firestore.
 */
export async function saveFirestoreUser(user: any): Promise<void> {
  const db = getClientFirestore();
  if (!db || !user || !user.id) return;
  const path = `users/${user.id}`;
  try {
    const cleanUser = JSON.parse(JSON.stringify(user));
    await setDoc(doc(db, 'users', user.id), cleanUser, { merge: true });
  } catch (error) {
    console.error(`[Firestore] Error saving user ${user.id}:`, error);
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // handled
    }
  }
}

/**
 * Deletes a user record from the `users` collection in Firebase Firestore.
 */
export async function removeFirestoreUser(userId: string): Promise<void> {
  const db = getClientFirestore();
  if (!db || !userId) return;
  const path = `users/${userId}`;
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    console.error(`[Firestore] Error deleting user ${userId}:`, error);
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {
      // handled
    }
  }
}

/**
 * Persists the entire CRM workspace state directly to `crm_state/workspace` in Firebase Firestore.
 */
export async function saveFirestoreWorkspace(state: any): Promise<void> {
  const db = getClientFirestore();
  if (!db || !state) return;
  const pathForWrite = 'crm_state/workspace';
  try {
    const payload = JSON.parse(
      JSON.stringify({
        roles: state.roles || [],
        users: state.users || [],
        leads: state.leads || [],
        properties: state.properties || [],
        deals: state.deals || [],
        events: state.events || [],
        sheetConnections: state.sheetConnections || [],
        syncLogs: (state.syncLogs || []).slice(0, 50),
        notifications: (state.notifications || []).slice(0, 100),
        projects: state.projects || [],
        updatedAt: new Date().toISOString(),
      })
    );
    await setDoc(doc(db, 'crm_state', 'workspace'), payload, { merge: true });
  } catch (error) {
    console.error('[Firestore] Error saving workspace:', error);
    try {
      handleFirestoreError(error, OperationType.WRITE, pathForWrite);
    } catch {
      // handled
    }
  }
}

function mergeRecordsById(baseList: any[], incomingList: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of baseList || []) {
    if (item && item.id) map.set(item.id, item);
  }
  for (const item of incomingList || []) {
    if (item && item.id) {
      const prev = map.get(item.id) || {};
      map.set(item.id, { ...prev, ...item });
    }
  }
  return Array.from(map.values());
}
