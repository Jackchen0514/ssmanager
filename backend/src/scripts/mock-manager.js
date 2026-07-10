import dgram from 'node:dgram';

/**
 * Minimal fake ssmanager implementing the same UDP text protocol as
 * shadowsocks-rust's manager mode (add/remove/list/ping). Useful for local
 * development, demos, and integration tests when a real ssserver/ssmanager
 * binary isn't available. Traffic counters grow by a random amount on every
 * `ping` to simulate live usage.
 *
 * Usage: node src/scripts/mock-manager.js [host] [port]
 */

const host = process.argv[2] ?? '127.0.0.1';
const port = Number(process.argv[3] ?? 6100);

const servers = new Map(); // server_port -> { password, method, cumulativeBytes }

function parseBody(text) {
  const idx = text.indexOf(':');
  if (idx === -1) return null;
  return JSON.parse(text.slice(idx + 1).trim());
}

const socket = dgram.createSocket('udp4');

socket.on('message', (buf, rinfo) => {
  const text = buf.toString('utf8');
  const reply = (msg) => socket.send(msg, rinfo.port, rinfo.address);

  try {
    if (text.startsWith('add:')) {
      const body = parseBody(text);
      servers.set(body.server_port, {
        password: body.password,
        method: body.method,
        cumulativeBytes: 0,
      });
      console.log(`[mock-manager] add ${body.server_port}`);
      reply('ok');
    } else if (text.startsWith('remove:')) {
      const body = parseBody(text);
      servers.delete(body.server_port);
      console.log(`[mock-manager] remove ${body.server_port}`);
      reply('ok');
    } else if (text.trim() === 'list') {
      // Matches the real shadowsocks-rust ssmanager (v1.24.0): a bare JSON array.
      const list = [...servers.entries()].map(([server_port, info]) => ({
        server_port,
        password: info.password,
      }));
      reply(JSON.stringify(list));
    } else if (text.trim() === 'ping') {
      const stat = {};
      for (const [serverPort, info] of servers) {
        info.cumulativeBytes += Math.floor(Math.random() * 50_000);
        stat[serverPort] = info.cumulativeBytes;
      }
      reply(`stat: ${JSON.stringify(stat)}`);
    } else if (text.trim() === 'conn-stat') {
      // Matches the real shadowsocks-rust ssmanager fork (v1.23.9+): fake
      // some plausible live connection counts so the panel has something to show.
      const list = [...servers.keys()].map((server_port) => {
        const tcpConnCount = Math.floor(Math.random() * 5);
        const ips = Array.from({ length: Math.max(1, tcpConnCount) }, (_, i) => `10.0.0.${i + 1}`).slice(0, tcpConnCount);
        return {
          server_port,
          tcp_conn_count: tcpConnCount,
          udp_assoc_count: Math.floor(Math.random() * 3),
          online_ip_count: ips.length,
          online_ips: ips,
        };
      });
      reply(JSON.stringify(list));
    } else {
      console.warn(`[mock-manager] unknown command: ${text}`);
    }
  } catch (err) {
    console.error(`[mock-manager] failed to handle "${text}":`, err.message);
  }
});

socket.bind(port, host, () => {
  console.log(`[mock-manager] listening on udp://${host}:${port}`);
});
