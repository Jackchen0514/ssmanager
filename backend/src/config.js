import 'dotenv/config';
import path from 'node:path';

function projectRoot() {
  return path.resolve(import.meta.dirname, '..');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // 127.0.0.1 by default: the panel itself has no TLS and is meant to be
  // reached via an SSH tunnel or your own reverse proxy (nginx/caddy), not
  // exposed directly to the internet. Set PANEL_HOST=0.0.0.0 to bind on all
  // interfaces if you really want direct public access.
  host: process.env.PANEL_HOST ?? '127.0.0.1',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  dbPath: path.resolve(projectRoot(), process.env.DB_PATH ?? './data/ssmanager.db'),
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'change-me',
  defaultManagerHost: process.env.MANAGER_HOST ?? '127.0.0.1',
  defaultManagerPort: Number(process.env.MANAGER_PORT ?? 6100),
  defaultBinaryPath: process.env.SSMANAGER_BIN ?? 'ssmanager',
  defaultBinaryArgs: process.env.SSMANAGER_ARGS ?? '--manager-addr 127.0.0.1:6100 -s 0.0.0.0 -m aes-256-gcm',
  // When set, the backend also serves the built frontend (frontend/dist) as
  // static files and falls back to index.html for client-side routing, so the
  // whole panel is reachable from a single Node process/port.
  frontendDistPath: process.env.FRONTEND_DIST_PATH
    ? path.resolve(process.env.FRONTEND_DIST_PATH)
    : path.resolve(projectRoot(), '../frontend/dist'),
};
