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
    tcpMaxConnections: port.tcp_max_connections || undefined,
    udpMaxAssociations: port.udp_max_associations || undefined,
    maxOnlineIps: port.max_online_ips || undefined,
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

/** Current cumulative byte count the manager reports for one port, or null if absent. */
export async function getCurrentCumulative(serverPort) {
  const client = makeClient();
  const stats = await client.ping();
  return stats.has(serverPort) ? stats.get(serverPort) : null;
}

/**
 * Live TCP/UDP connection counts for one port, or null if the manager doesn't
 * know about this port (or doesn't support conn-stat, e.g. ssmanager < v1.23.9).
 */
export async function getConnStat(serverPort) {
  const client = makeClient();
  const stats = await client.connStat();
  return stats.has(serverPort) ? stats.get(serverPort) : null;
}

/**
 * Pull cumulative traffic per port from the manager and fold it into
 * total_bytes (monotonic across ssserver restarts) + today's traffic_daily row.
 * Ports that cross their traffic_limit_bytes get pulled from the manager and
 * marked limit_exceeded so the panel can no longer be used until reset/raised.
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
  const markLimitExceeded = db.prepare(
    `UPDATE ports SET enabled = 0, limit_exceeded = 1, updated_at = datetime('now') WHERE id = ?`
  );

  const today = new Date().toISOString().slice(0, 10);
  const overLimit = [];
  const applyStat = db.transaction((serverPort, cumulative) => {
    const port = getPort.get(serverPort);
    if (!port) return;

    const delta = cumulative >= port.last_cumulative_bytes
      ? cumulative - port.last_cumulative_bytes
      : cumulative; // ssserver restarted, counter reset to 0

    const newTotal = port.total_bytes + delta;
    updatePort.run(cumulative, newTotal, port.id);
    if (delta > 0) upsertDaily.run(port.id, today, delta);

    if (port.enabled && port.traffic_limit_bytes > 0 && newTotal >= port.traffic_limit_bytes) {
      overLimit.push(port);
    }
  });

  for (const [serverPort, cumulative] of stats) {
    applyStat(serverPort, cumulative);
  }

  for (const port of overLimit) {
    try {
      await removePortFromManager(port.server_port);
    } catch (err) {
      console.error(`[managerService] failed to remove over-limit port ${port.server_port}:`, err.message);
    }
    markLimitExceeded.run(port.id);
  }

  return stats;
}

/**
 * Pull any enabled port whose expires_at has passed and mark it expired.
 * Compared in JS (not SQL string comparison) since expires_at is stored as a
 * full ISO 8601 string and SQLite has no real datetime type to compare against.
 */
export async function checkExpiredPorts() {
  const candidates = db.prepare(
    `SELECT * FROM ports WHERE enabled = 1 AND expires_at IS NOT NULL AND expires_at != ''`
  ).all();
  const now = Date.now();
  const expired = candidates.filter((p) => new Date(p.expires_at).getTime() <= now);

  const markExpired = db.prepare(
    `UPDATE ports SET enabled = 0, expired = 1, updated_at = datetime('now') WHERE id = ?`
  );
  for (const port of expired) {
    try {
      await removePortFromManager(port.server_port);
    } catch (err) {
      console.error(`[managerService] failed to remove expired port ${port.server_port}:`, err.message);
    }
    markExpired.run(port.id);
  }

  return expired.map((p) => p.server_port);
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
      tcpMaxConnections: port.tcp_max_connections || undefined,
      udpMaxAssociations: port.udp_max_associations || undefined,
      maxOnlineIps: port.max_online_ips || undefined,
    });
  }

  return { remoteCount: remotePorts.size, readdedCount: missing.length, readded: missing.map((p) => p.server_port) };
}
