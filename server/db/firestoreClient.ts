import 'dotenv/config';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AppletFirebaseConfig {
  projectId?: string;
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

// Configure ignoreUndefinedProperties on Firestore instance
try {
  adminFirestore.settings({ ignoreUndefinedProperties: true });
} catch {
  // settings() may already have been called
}

/**
 * Probes whether the current process has active IAM / Service Account credentials
 * to reach Cloud Firestore via firebase-admin.
 */
let firestoreConnectivityChecked = false;
let firestoreDirectAvailable = true;

export async function verifyFirestoreConnectivity(): Promise<boolean> {
  if (firestoreConnectivityChecked) return firestoreDirectAvailable;
  firestoreConnectivityChecked = true;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FIRESTORE_PROBE_TIMEOUT')), 3500)
    );
    await Promise.race([
      adminFirestore.collection('settings').doc('global').get(),
      timeoutPromise,
    ]);
    firestoreDirectAvailable = true;
    console.log(
      `[Firestore] Connected to Cloud Firestore via firebase-admin (project=${FIREBASE_PROJECT_ID}, database=${FIRESTORE_DATABASE_ID})`
    );
  } catch (err: any) {
    firestoreDirectAvailable = false;
    console.warn(
      `[Firestore] Cloud Firestore ADC/ServiceAccount credentials not yet active in this environment (${err?.message || err}). Running with Firestore-compatible transactional store until credentials are provided.`
    );
  }
  return firestoreDirectAvailable;
}

export function isCloudFirestoreActive(): boolean {
  return firestoreDirectAvailable;
}
