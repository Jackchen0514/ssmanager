import crypto from 'node:crypto';

// Prefix makes tokens greppable/identifiable at a glance (same idea as
// GitHub's ghp_/gho_ prefixes) and lets requireAuth cheaply tell an API
// token apart from a JWT without attempting a JWT verify first.
export const API_TOKEN_PREFIX = 'ssm_';

export function generateApiToken() {
  return API_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
}

// Tokens are high-entropy random strings, not user-chosen passwords, so a
// fast SHA-256 lookup hash is appropriate here -- unlike account passwords,
// which use bcrypt.
export function hashApiToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
