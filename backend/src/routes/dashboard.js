import { Router } from 'express';
import { db } from '../db/index.js';
import { pingManager } from '../manager/managerService.js';
import { processSupervisor } from '../manager/processSupervisor.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (req, res) => {
  const portCount = db.prepare('SELECT COUNT(*) AS n FROM ports').get().n;
  const enabledCount = db.prepare('SELECT COUNT(*) AS n FROM ports WHERE enabled = 1').get().n;
  const totalBytes = db.prepare('SELECT COALESCE(SUM(total_bytes), 0) AS n FROM ports').get().n;

  const today = new Date().toISOString().slice(0, 10);
  const todayBytes = db.prepare(
    'SELECT COALESCE(SUM(bytes), 0) AS n FROM traffic_daily WHERE day = ?'
  ).get(today).n;

  let managerConnected = false;
  try {
    await pingManager();
    managerConnected = true;
  } catch {
    managerConnected = false;
  }

  res.json({
    portCount,
    enabledCount,
    totalBytes,
    todayBytes,
    managerConnected,
    process: processSupervisor.status(),
  });
});

dashboardRouter.get('/traffic', (req, res) => {
  const days = Math.min(Number(req.query.days ?? 7), 90);

  const rows = db.prepare(`
    SELECT day, SUM(bytes) AS bytes FROM traffic_daily
    WHERE day >= date('now', ?)
    GROUP BY day
  `).all(`-${days - 1} days`);

  const byDay = new Map(rows.map((r) => [r.day, r.bytes]));
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({ day, bytes: byDay.get(day) ?? 0 });
  }

  res.json(series);
});
