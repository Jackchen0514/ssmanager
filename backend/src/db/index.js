import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS manager_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    server_host TEXT NOT NULL DEFAULT '',
    poll_interval_ms INTEGER NOT NULL DEFAULT 10000,
    reconcile_interval_ms INTEGER NOT NULL DEFAULT 60000,
    connect_timeout_ms INTEGER NOT NULL DEFAULT 3000,
    binary_path TEXT NOT NULL DEFAULT 'ssmanager',
    binary_args TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_port INTEGER NOT NULL UNIQUE,
    password TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'aes-256-gcm',
    plugin TEXT,
    plugin_opts TEXT,
    remark TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_cumulative_bytes INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS traffic_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port_id INTEGER NOT NULL REFERENCES ports(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0,
    UNIQUE(port_id, day)
  );
`);

const managerConfigRow = db.prepare('SELECT id FROM manager_config WHERE id = 1').get();
if (!managerConfigRow) {
  db.prepare(
    `INSERT INTO manager_config (id, host, port, binary_path, binary_args)
     VALUES (1, ?, ?, ?, ?)`
  ).run(config.defaultManagerHost, config.defaultManagerPort, config.defaultBinaryPath, config.defaultBinaryArgs);
}
