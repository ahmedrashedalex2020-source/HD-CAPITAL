import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SECRET_FILE_PATH = path.resolve(__dirname, '../data/.session_secret');

function loadOrCreateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32) {
    return process.env.SESSION_SECRET.trim();
  }
  try {
    const dir = path.dirname(SECRET_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE_PATH)) {
      const existing = fs.readFileSync(SECRET_FILE_PATH, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE_PATH, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.createHash('sha256').update(`propsphere_fallback_${__dirname}`).digest('hex');
  }
}

const SESSION_SECRET = loadOrCreateSessionSecret();
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
const DEFAULT_TOKEN_TTL_MS = SESSION_TIMEOUT_MS;

/**
 * Legacy SHA-256 hash used only for backward-compatible verification during migration.
 */
export function legacySha256Hash(password: string): string {
  return crypto.createHash('sha256').update(`propsphere_salt_${password}`).digest('hex');
}

/**
 * Hashes a password using crypto.scryptSync with a unique 16-byte random salt.
 * Output format: `scrypt$<saltHex>$<derivedKeyHex>`
 */
export function hashPasswordSecure(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against a stored hash (`scrypt$...` or legacy SHA-256).
 * Uses constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
 */
export function verifyPasswordSecure(
  password: string,
  storedHash: string
): { valid: boolean; needsUpgrade: boolean } {
  if (!password || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, originalHex] = parts;
    try {
      const derivedBuf = crypto.scryptSync(String(password), salt, 64);
      const originalBuf = Buffer.from(originalHex, 'hex');
      if (derivedBuf.length !== originalBuf.length) {
        return { valid: false, needsUpgrade: false };
      }
      const valid = crypto.timingSafeEqual(derivedBuf, originalBuf);
      return { valid, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // Legacy SHA-256 fallback (upgrades to scrypt on successful login)
  try {
    const candidateHex = legacySha256Hash(String(password));
    const candidateBuf = Buffer.from(candidateHex, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (candidateBuf.length !== storedBuf.length) {
      return { valid: false, needsUpgrade: false };
    }
    const valid = crypto.timingSafeEqual(candidateBuf, storedBuf);
    return { valid, needsUpgrade: valid };
  } catch {
    return { valid: false, needsUpgrade: false };
  }
}

export interface SessionTokenPayload {
  userId: string;
  roleId: string;
  username: string;
  iat: number;
  exp: number;
}

/**
 * Creates an HMAC-SHA256 signed session token (`<base64urlPayload>.<base64urlSignature>`).
 */
export function signSessionToken(
  user: { id: string; roleId: string; username: string },
  ttlMs: number = DEFAULT_TOKEN_TTL_MS
): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    userId: user.id,
    roleId: user.roleId,
    username: user.username,
    iat: now,
    exp: now + ttlMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token and checks expiration.
 */
export function verifySessionToken(token?: string | null): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.replace(/^Bearer\s+/i, '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSigB64] = parts;
  if (!payloadB64 || !providedSigB64) return null;

  try {
    const expectedSigB64 = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');

    const providedBuf = Buffer.from(providedSigB64, 'utf-8');
    const expectedBuf = Buffer.from(expectedSigB64, 'utf-8');
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as SessionTokenPayload;

    if (!decoded || !decoded.userId || typeof decoded.exp !== 'number') {
      return null;
    }
    if (Date.now() > decoded.exp) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export type PermissionScope = 'all' | 'team' | 'own' | 'none';

export function checkScopeAccess(
  scope: PermissionScope | undefined,
  currentUser: { id: string; assignedProjects?: string[] },
  resourceOwnerId?: string,
  resourceProject?: string
): boolean {
  const effectiveScope = scope || 'none';
  if (effectiveScope === 'none') return false;
  if (effectiveScope === 'all') return true;
  if (effectiveScope === 'own') {
    return Boolean(resourceOwnerId && resourceOwnerId === currentUser.id);
  }
  if (effectiveScope === 'team') {
    if (resourceOwnerId && resourceOwnerId === currentUser.id) return true;
    const userProjects = Array.isArray(currentUser.assignedProjects)
      ? currentUser.assignedProjects
      : [];
    if (resourceProject && userProjects.includes(resourceProject)) return true;
    return false;
  }
  return false;
}
