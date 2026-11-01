import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
const GOOGLE_TOKEN_SESSION_KEY = 'propsphere_google_oauth_token';
const GOOGLE_TOKEN_EXP_KEY = 'propsphere_google_oauth_exp';

function loadSessionGoogleToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const tok = window.sessionStorage.getItem(GOOGLE_TOKEN_SESSION_KEY);
    const exp = Number(window.sessionStorage.getItem(GOOGLE_TOKEN_EXP_KEY) || '0');
    if (tok && (!exp || Date.now() < exp)) {
      return tok;
    }
    window.sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY);
    window.sessionStorage.removeItem(GOOGLE_TOKEN_EXP_KEY);
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveSessionGoogleToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(GOOGLE_TOKEN_SESSION_KEY, token);
      window.sessionStorage.setItem(GOOGLE_TOKEN_EXP_KEY, String(Date.now() + 55 * 60 * 1000));
    } else {
      window.sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY);
      window.sessionStorage.removeItem(GOOGLE_TOKEN_EXP_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

let cachedAccessToken: string | null = loadSessionGoogleToken();

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        cachedAccessToken = loadSessionGoogleToken();
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      saveSessionGoogleToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Sheets access token');
    }
    cachedAccessToken = credential.accessToken;
    saveSessionGoogleToken(cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    cachedAccessToken = loadSessionGoogleToken();
  }
  return cachedAccessToken;
};

export const googleLogout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  saveSessionGoogleToken(null);
};

