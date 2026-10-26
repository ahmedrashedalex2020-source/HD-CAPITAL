import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  terminate,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firestoreAvailable = true;

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

function disableFirestoreCircuit(): void {
  firestoreAvailable = false;
  if (firestoreDb) {
    const dbToTerminate = firestoreDb;
    firestoreDb = null;
     void terminate(dbToTerminate).catch(() => {});
  }
}

export function getClientFirestore(): Firestore | null {
  // Only initialize client-side Firestore in browser contexts
  if (typeof window === 'undefined' || !firestoreAvailable) return null;
  if (firestoreDb) return firestoreDb;
  try {
    const cfg = getFirebaseConfig();
    if (!cfg.projectId || !cfg.apiKey) {
      firestoreAvailable = false;
      return null;
    }
    firebaseApp = getApps().length === 0 ? initializeApp(cfg) : getApp();
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    const dbId = env.VITE_FIRESTORE_DATABASE_ID || (appletConfig as any).firestoreDatabaseId;
    firestoreDb =
      dbId && dbId !== '(default)'
        ? getFirestore(firebaseApp, dbId)
        : getFirestore(firebaseApp);
    return firestoreDb;
  } catch {
    firestoreAvailable = false;
    return null;
  }
}

function withFastTimeout<T>(promise: Promise<T>, ms = 1200): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FIRESTORE_CLIENT_TIMEOUT')), ms)
    ),
  ]);
}

/**
 * Fetches the shared CRM workspace state and users collection directly from Firebase Firestore.
 * Uses a fast 1.2s circuit breaker so unprovisioned or offline Firestore never slows down the UI.
 */
export async function fetchFirestoreWorkspace(): Promise<any | null> {
  const db = getClientFirestore();
  if (!db) return null;

  try {
    const [workspaceSnap, usersSnap] = await withFastTimeout(
      Promise.all([
        getDoc(doc(db, 'crm_state', 'workspace')),
        getDocs(collection(db, 'users')).catch(() => null),
      ]),
      1200
    );

    const workspaceData = workspaceSnap.exists() ? workspaceSnap.data() : {};
    const collectionUsers: any[] = [];
    if (usersSnap) {
      usersSnap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u && u.id) collectionUsers.push(u);
      });
    }

    if (!workspaceSnap.exists() && collectionUsers.length === 0) {
      return null;
    }

    return {
      ...workspaceData,
      users:
        collectionUsers.length > 0
          ? mergeRecordsById(workspaceData.users || [], collectionUsers)
          : workspaceData.users || [],
    };
  } catch {
    disableFirestoreCircuit();
    return null;
  }
}

/**
 * Queries Firebase Firestore directly for a user by username (used during login on mobile/Vercel).
 */
export async function queryFirestoreUserByUsername(username: string): Promise<any | null> {
  const db = getClientFirestore();
  if (!db) return null;
  const cleanUsername = String(username || '').trim().toLowerCase();
  if (!cleanUsername) return null;

  try {
    const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
    const snap = await withFastTimeout(getDocs(q), 1200);
    if (!snap.empty) {
      return snap.docs[0].data();
    }

    const wsSnap = await withFastTimeout(getDoc(doc(db, 'crm_state', 'workspace')), 1200);
    if (wsSnap.exists()) {
      const ws = wsSnap.data();
      if (Array.isArray(ws.users)) {
        const found = ws.users.find(
          (u: any) => String(u.username || '').trim().toLowerCase() === cleanUsername
        );
        if (found) return found;
      }
    }
  } catch {
    disableFirestoreCircuit();
  }
  return null;
}

/**
 * Persists a single user record directly to the `users` collection in Firebase Firestore.
 */
export async function saveFirestoreUser(user: any): Promise<void> {
  const db = getClientFirestore();
  if (!db || !user || !user.id) return;
  try {
    const cleanUser = JSON.parse(JSON.stringify(user));
    await withFastTimeout(setDoc(doc(db, 'users', user.id), cleanUser, { merge: true }), 1200);
  } catch {
    disableFirestoreCircuit();
  }
}

/**
 * Deletes a user record from the `users` collection in Firebase Firestore.
 */
export async function removeFirestoreUser(userId: string): Promise<void> {
  const db = getClientFirestore();
  if (!db || !userId) return;
  try {
    await withFastTimeout(deleteDoc(doc(db, 'users', userId)), 1200);
  } catch {
    disableFirestoreCircuit();
  }
}

/**
 * Persists the entire CRM workspace state to `crm_state/workspace` in Firebase Firestore.
 */
export async function saveFirestoreWorkspace(state: any): Promise<void> {
  const db = getClientFirestore();
  if (!db || !state) return;
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
        syncLogs: (state.syncLogs || []).slice(0, 30),
        notifications: (state.notifications || []).slice(0, 60),
        projects: state.projects || [],
        updatedAt: new Date().toISOString(),
      })
    );
    await withFastTimeout(
      setDoc(doc(db, 'crm_state', 'workspace'), payload, { merge: true }),
      1500
    );
  } catch {
    disableFirestoreCircuit();
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
