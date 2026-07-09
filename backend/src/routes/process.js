import { Router } from 'express';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { processSupervisor } from '../manager/processSupervisor.js';

export const processRouter = Router();

function launchConfig() {
  const cfg = db.prepare('SELECT binary_path, binary_args FROM manager_config WHERE id = 1').get();
  const args = cfg.binary_args.trim().length ? cfg.binary_args.trim().split(/\s+/) : [];
  return { binaryPath: cfg.binary_path, args };
}

processRouter.get('/status', (req, res) => {
  res.json(processSupervisor.status());
});

processRouter.get('/logs', (req, res) => {
  const tail = Math.min(Number(req.query.tail ?? 200), 500);
  res.json({ logs: processSupervisor.getLogs(tail) });
});

processRouter.post('/start', asyncHandler(async (req, res) => {
  const { binaryPath, args } = launchConfig();
  const status = processSupervisor.start(binaryPath, args);
  res.json(status);
}));

processRouter.post('/stop', (req, res) => {
  processSupervisor.stop();
  res.json({ ok: true });
});

processRouter.post('/restart', (req, res) => {
  const { binaryPath, args } = launchConfig();
  processSupervisor.restart(binaryPath, args);
  res.json({ ok: true });
});
