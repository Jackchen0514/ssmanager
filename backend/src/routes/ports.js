import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { addPortToManager, removePortFromManager } from '../manager/managerService.js';

export const portsRouter = Router();

const portSchema = z.object({
  server_port: z.number().int().min(1).max(65535),
  password: z.string().min(1),
  method: z.string().min(1).default('aes-256-gcm'),
  plugin: z.string().optional().nullable(),
  plugin_opts: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
});

const updateSchema = portSchema.partial();

function findPortOr404(id) {
  const port = db.prepare('SELECT * FROM ports WHERE id = ?').get(id);
  if (!port) {
    const err = new Error('port not found');
    err.status = 404;
    throw err;
  }
  return port;
}

portsRouter.get('/', (req, res) => {
  const ports = db.prepare('SELECT * FROM ports ORDER BY server_port').all();
  res.json(ports);
});

portsRouter.post('/', asyncHandler(async (req, res) => {
  const body = portSchema.parse(req.body);

  const existing = db.prepare('SELECT id FROM ports WHERE server_port = ?').get(body.server_port);
  if (existing) {
    return res.status(409).json({ error: `port ${body.server_port} already exists` });
  }

  const insert = db.prepare(`
    INSERT INTO ports (server_port, password, method, plugin, plugin_opts, remark, enabled)
    VALUES (@server_port, @password, @method, @plugin, @plugin_opts, @remark, @enabled)
  `);
  const info = insert.run({
    server_port: body.server_port,
    password: body.password,
    method: body.method,
    plugin: body.plugin ?? null,
    plugin_opts: body.plugin_opts ?? null,
    remark: body.remark ?? null,
    enabled: body.enabled ? 1 : 0,
  });

  if (body.enabled) {
    try {
      await addPortToManager({ server_port: body.server_port, ...body });
    } catch (err) {
      db.prepare('DELETE FROM ports WHERE id = ?').run(info.lastInsertRowid);
      return res.status(502).json({ error: `manager rejected new port: ${err.message}` });
    }
  }

  res.status(201).json(findPortOr404(info.lastInsertRowid));
}));

portsRouter.put('/:id', asyncHandler(async (req, res) => {
  const current = findPortOr404(req.params.id);
  const body = updateSchema.parse(req.body);
  const next = { ...current, ...body };

  if (next.server_port !== current.server_port) {
    const clash = db.prepare('SELECT id FROM ports WHERE server_port = ? AND id != ?')
      .get(next.server_port, current.id);
    if (clash) return res.status(409).json({ error: `port ${next.server_port} already exists` });
  }

  // Manager has no "update" command: apply by removing the old port (if it was
  // live) and re-adding under the new config when the port should be enabled.
  if (current.enabled) {
    await removePortFromManager(current.server_port).catch(() => {});
  }
  if (next.enabled) {
    await addPortToManager(next);
  }

  db.prepare(`
    UPDATE ports SET server_port=@server_port, password=@password, method=@method,
      plugin=@plugin, plugin_opts=@plugin_opts, remark=@remark, enabled=@enabled,
      updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id: current.id,
    server_port: next.server_port,
    password: next.password,
    method: next.method,
    plugin: next.plugin ?? null,
    plugin_opts: next.plugin_opts ?? null,
    remark: next.remark ?? null,
    enabled: next.enabled ? 1 : 0,
  });

  res.json(findPortOr404(current.id));
}));

portsRouter.post('/:id/toggle', asyncHandler(async (req, res) => {
  const port = findPortOr404(req.params.id);
  const nextEnabled = port.enabled ? 0 : 1;

  if (nextEnabled) {
    await addPortToManager(port);
  } else {
    await removePortFromManager(port.server_port);
  }

  db.prepare(`UPDATE ports SET enabled = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(nextEnabled, port.id);
  res.json(findPortOr404(port.id));
}));

portsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const port = findPortOr404(req.params.id);
  if (port.enabled) {
    await removePortFromManager(port.server_port).catch(() => {});
  }
  db.prepare('DELETE FROM ports WHERE id = ?').run(port.id);
  res.status(204).end();
}));

portsRouter.get('/:id/traffic', (req, res) => {
  const port = findPortOr404(req.params.id);
  const days = Math.min(Number(req.query.days ?? 7), 90);

  const rows = db.prepare(`
    SELECT day, bytes FROM traffic_daily
    WHERE port_id = ? AND day >= date('now', ?)
    ORDER BY day
  `).all(port.id, `-${days - 1} days`);

  const byDay = new Map(rows.map((r) => [r.day, r.bytes]));
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({ day, bytes: byDay.get(day) ?? 0 });
  }

  res.json(series);
});
