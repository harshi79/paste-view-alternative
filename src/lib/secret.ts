/**
 * Single source of truth for the JWT signing secret.
 *
 * VibeBin signs two cookie-bound JWTs (`vb_session` for users, `vb_admin`
 * for the admin panel). Both are verified in the Node runtime (src/lib/auth.ts)
 * AND in the edge middleware (middleware.ts), so the secret must resolve
 * identically in both — this module is the only place it is read.
 *
 * There is deliberately NO fallback value. If AUTH_SECRET is missing, weak,
 * or matches a known compromised/committed secret, authentication fails safe:
 * - token issuance (login / admin login) throws → the API returns 500;
 * - token verification treats every presented token as invalid.
 *
 * The edge runtime cannot use `node:crypto`, so this module is plain TS
 * (process.env + TextEncoder only) and safe to import from middleware.
 */

export const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Secrets that must never be accepted, even if explicitly set via env.
 * The first entry was the old hardcoded fallback that was committed to this
 * repository; anyone with read access to the repo history can sign tokens
 * with it, so the app rejects it outright.
 */
const KNOWN_BAD_SECRETS = new Set<string>([
  'vibebin-dev-secret-do-not-use-in-production-change-me',
]);

export class AuthSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthSecretError';
  }
}

function resolveRaw(): string {
  return (process.env.AUTH_SECRET ?? '').trim();
}

/**
 * Returns the configured secret as bytes.
 * Throws AuthSecretError when AUTH_SECRET is missing, too short, or a
 * known compromised value. Callers in verification paths should treat the
 * throw as "no valid session" (they already catch around token checks).
 */
export function getAuthSecret(): Uint8Array {
  const raw = resolveRaw();
  if (!raw) {
    throw new AuthSecretError(
      'AUTH_SECRET is not set. Authentication is disabled until you set it ' +
        'to a random string of at least ' +
        MIN_AUTH_SECRET_LENGTH +
        ' characters, e.g.: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (KNOWN_BAD_SECRETS.has(raw)) {
    throw new AuthSecretError(
      'AUTH_SECRET is set to a known compromised secret that was committed ' +
        'to this repository. It cannot be used. Generate a new random ' +
        MIN_AUTH_SECRET_LENGTH +
        '-character secret instead.',
    );
  }
  if (raw.length < MIN_AUTH_SECRET_LENGTH) {
    throw new AuthSecretError(
      'AUTH_SECRET is too weak: it must be at least ' +
        MIN_AUTH_SECRET_LENGTH +
        ' characters long (got ' +
        raw.length +
        '). Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Safe variant for code paths that must decide "valid or not" without
 * throwing (edge middleware): null means every token must be rejected.
 */
export function getAuthSecretOrNull(): Uint8Array | null {
  try {
    return getAuthSecret();
  } catch {
    return null;
  }
}
