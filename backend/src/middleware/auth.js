import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { API_TOKEN_PREFIX, hashApiToken } from '../auth/apiTokens.js';

function authenticateApiToken(req, res, next, token) {
  const row = db.prepare('SELECT * FROM api_tokens WHERE token_hash = ?').get(hashApiToken(token));
  if (!row) {
    return res.status(401).json({ error: 'invalid or revoked API token' });
  }
  db.prepare(`UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);

  // API tokens act with the same access as the (single) admin account.
  const admin = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  req.user = { sub: admin?.id, username: admin?.username ?? 'api-token', apiTokenId: row.id };
  next();
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }
  const token = header.slice('Bearer '.length);

  if (token.startsWith(API_TOKEN_PREFIX)) {
    return authenticateApiToken(req, res, next, token);
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
