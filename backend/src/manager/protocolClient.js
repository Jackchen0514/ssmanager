import dgram from 'node:dgram';

/**
 * Thin client for the shadowsocks-rust manager protocol (UDP, text commands):
 *   add: {"server_port":8388,"password":"x","method":"aes-256-gcm"}  -> "ok"
 *   remove: {"server_port":8388}                                     -> "ok"
 *   list                                                             -> {"servers":[{"server_port":8388}, ...]}
 *   ping                                                             -> "stat: {\"8388\":12345}"
 *
 * Kept isolated from business logic so the wire format can be adjusted in one
 * place if a real ssmanager's replies differ from the documented format.
 */
export class ManagerProtocolClient {
  constructor({ host, port, timeoutMs = 3000 }) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  _send(message) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        fn(value);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error(`manager request timed out after ${this.timeoutMs}ms: ${message}`));
      }, this.timeoutMs);

      socket.once('error', (err) => finish(reject, err));
      socket.once('message', (buf) => finish(resolve, buf.toString('utf8')));

      socket.send(message, this.port, this.host, (err) => {
        if (err) finish(reject, err);
      });
    });
  }

  async add({ serverPort, password, method, plugin, pluginOpts, tcpMaxConnections, udpMaxAssociations, maxOnlineIps }) {
    const payload = { server_port: serverPort, password, method };
    if (plugin) payload.plugin = plugin;
    if (pluginOpts) payload.plugin_opts = pluginOpts;
    // Requires ssmanager >= v1.23.8 (Jackchen0514/shadowsocks-rust fork); older
    // builds silently ignore unknown fields in the add: request, so it's safe
    // to always send these when set even against a stock/older binary.
    if (tcpMaxConnections) payload.tcp_max_connections = tcpMaxConnections;
    if (udpMaxAssociations) payload.udp_max_associations = udpMaxAssociations;
    if (maxOnlineIps) payload.max_online_ips = maxOnlineIps;
    const reply = await this._send(`add: ${JSON.stringify(payload)}`);
    return this._expectOk(reply, 'add');
  }

  async remove({ serverPort }) {
    const reply = await this._send(`remove: ${JSON.stringify({ server_port: serverPort })}`);
    return this._expectOk(reply, 'remove');
  }

  async list() {
    const reply = await this._send('list');
    const parsed = this._parseJsonBody(reply);
    // Real shadowsocks-rust (v1.24.0) replies with a bare JSON array of
    // {server_port, password, ...}; older docs/forks describe {"servers":[...]}.
    // Accept both.
    const servers = Array.isArray(parsed) ? parsed : (parsed?.servers ?? []);
    return servers.map((s) => s.server_port);
  }

  /** Returns a Map<serverPort:number, cumulativeBytes:number> */
  async ping() {
    const reply = await this._send('ping');
    const parsed = this._parseJsonBody(reply);
    const stats = new Map();
    for (const [port, bytes] of Object.entries(parsed ?? {})) {
      stats.set(Number(port), Number(bytes));
    }
    return stats;
  }

  _expectOk(reply, op) {
    if (reply.trim().toLowerCase().startsWith('ok')) return true;
    throw new Error(`manager ${op} failed: ${reply}`);
  }

  /** Replies look like "list\n{...}" or "stat: {...}" or a bare JSON body. */
  _parseJsonBody(reply) {
    const trimmed = reply.trim();
    const colonIdx = trimmed.indexOf(':');
    const jsonStart = trimmed.indexOf('{');
    const bracketStart = trimmed.indexOf('[');
    let candidate = trimmed;
    if (jsonStart !== -1 && (bracketStart === -1 || jsonStart < bracketStart)) {
      candidate = trimmed.slice(jsonStart);
    } else if (bracketStart !== -1) {
      candidate = trimmed.slice(bracketStart);
    } else if (colonIdx !== -1) {
      candidate = trimmed.slice(colonIdx + 1).trim();
    }
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}
