import { db } from '../db/index.js';
import { ManagerProtocolClient } from './protocolClient.js';

function getManagerConfig() {
  return db.prepare('SELECT * FROM manager_config WHERE id = 1').get();
}

function makeClient() {
  const cfg = getManagerConfig();
  return new ManagerProtocolClient({
    host: cfg.host,
    port: cfg.port,
    timeoutMs: cfg.connect_timeout_ms,
  });
}

export async function addPortToManager(port) {
  const client = makeClient();
  await client.add({
    serverPort: port.server_port,
    password: port.password,
    method: port.method,
    plugin: port.plugin ?? undefined,
    pluginOpts: port.plugin_opts ?? undefined,
  });
}

export async function removePortFromManager(serverPort) {
  const client = makeClient();
  await client.remove({ serverPort });
}

export async function pingManager() {
  const client = makeClient();
  await client.list();
  return true;
}

/**
 * Pull cumulative traffic per port from the manager and fold it into
 * total_bytes (monotonic across ssserver restarts) + today's traffic_daily row.
 */
export async function pollStats() {
  const client = makeClient();
  const stats = await client.ping();

  const getPort = db.prepare('SELECT * FROM ports WHERE server_port = ?');
  const updatePort = db.prepare(
    `UPDATE ports SET last_cumulative_bytes = ?, total_bytes = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const upsertDaily = db.prepare(`
    INSERT INTO traffic_daily (port_id, day, bytes) VALUES (?, ?, ?)
    ON CONFLICT(port_id, day) DO UPDATE SET bytes = bytes + excluded.bytes
  `);

  const today = new Date().toISOString().slice(0, 10);
  const applyStat = db.transaction((serverPort, cumulative) => {
    const port = getPort.get(serverPort);
    if (!port) return;

    const delta = cumulative >= port.last_cumulative_bytes
      ? cumulative - port.last_cumulative_bytes
      : cumulative; // ssserver restarted, counter reset to 0

    const newTotal = port.total_bytes + delta;
    updatePort.run(cumulative, newTotal, port.id);
    if (delta > 0) upsertDaily.run(port.id, today, delta);
  });

  for (const [serverPort, cumulative] of stats) {
    applyStat(serverPort, cumulative);
  }

  return stats;
}

/**
 * Re-add any enabled DB port missing from the manager's live list.
 * Handles the case where ssmanager was restarted and lost its in-memory state.
 */
export async function reconcile() {
  const client = makeClient();
  const remotePorts = new Set(await client.list());
  const enabledPorts = db.prepare('SELECT * FROM ports WHERE enabled = 1').all();

  const missing = enabledPorts.filter((p) => !remotePorts.has(p.server_port));
  for (const port of missing) {
    await client.add({
      serverPort: port.server_port,
      password: port.password,
      method: port.method,
      plugin: port.plugin ?? undefined,
      pluginOpts: port.plugin_opts ?? undefined,
    });
  }

  return { remoteCount: remotePorts.size, readdedCount: missing.length, readded: missing.map((p) => p.server_port) };
}
