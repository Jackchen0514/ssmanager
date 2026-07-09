import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateApiToken, hashApiToken } from '../auth/apiTokens.js';

export const tokensRouter = Router();

tokensRouter.get('/', (req, res) => {
  const tokens = db.prepare(
    'SELECT id, name, token_prefix, last_used_at, created_at FROM api_tokens ORDER BY created_at DESC'
  ).all();
  res.json(tokens);
});

const createSchema = z.object({ name: z.string().min(1).max(100) });

tokensRouter.post('/', asyncHandler(async (req, res) => {
  const { name } = createSchema.parse(req.body);
  const token = generateApiToken();
  const tokenPrefix = token.slice(0, 12);

  const info = db.prepare(
    'INSERT INTO api_tokens (name, token_hash, token_prefix) VALUES (?, ?, ?)'
  ).run(name, hashApiToken(token), tokenPrefix);

  // The full token is only ever returned here, at creation time -- only its
  // hash is stored, so it can't be recovered/displayed again afterwards.
  res.status(201).json({
    id: info.lastInsertRowid,
    name,
    token,
    token_prefix: tokenPrefix,
    created_at: new Date().toISOString(),
  });
}));

tokensRouter.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM api_tokens WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'token not found' });
  res.status(204).end();
});
