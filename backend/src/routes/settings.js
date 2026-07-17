import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const settingsRouter = Router();

const managerConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  server_host: z.string().optional(),
  server_host_v6: z.string().optional(),
  poll_interval_ms: z.number().int().min(1000).optional(),
  reconcile_interval_ms: z.number().int().min(5000).optional(),
  connect_timeout_ms: z.number().int().min(200).optional(),
  binary_path: z.string().min(1).optional(),
  binary_args: z.string().optional(),
});

settingsRouter.get('/manager', (req, res) => {
  res.json(db.prepare('SELECT * FROM manager_config WHERE id = 1').get());
});

settingsRouter.put('/manager', (req, res) => {
  const current = db.prepare('SELECT * FROM manager_config WHERE id = 1').get();
  const body = managerConfigSchema.partial().parse(req.body);
  const next = { ...current, ...body };

  db.prepare(`
    UPDATE manager_config SET host=@host, port=@port, server_host=@server_host,
      server_host_v6=@server_host_v6,
      poll_interval_ms=@poll_interval_ms,
      reconcile_interval_ms=@reconcile_interval_ms, connect_timeout_ms=@connect_timeout_ms,
      binary_path=@binary_path, binary_args=@binary_args, updated_at=datetime('now')
    WHERE id = 1
  `).run(next);

  res.json(db.prepare('SELECT * FROM manager_config WHERE id = 1').get());
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

settingsRouter.put('/password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
}));
