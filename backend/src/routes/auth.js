import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// In-memory only (resets on restart) -- keyed by username rather than IP
// since the panel is typically reached through an SSH tunnel or reverse
// proxy, where every request would otherwise appear to come from the same
// source address.
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000;
const loginAttempts = new Map();

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);

  const attempt = loginAttempts.get(username);
  if (attempt?.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: `登录失败次数过多，请 ${Math.ceil(retryAfterSeconds / 60)} 分钟后重试`,
      retryAfterSeconds,
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const failCount = (attempt?.failCount ?? 0) + 1;
    if (failCount >= MAX_FAILED_ATTEMPTS) {
      loginAttempts.set(username, { failCount: 0, lockedUntil: Date.now() + LOCKOUT_MS });
    } else {
      loginAttempts.set(username, { failCount, lockedUntil: 0 });
    }
    return res.status(401).json({ error: 'invalid username or password' });
  }

  loginAttempts.delete(username);
  const token = jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  res.json({ token });
}));

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});
