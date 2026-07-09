import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { ManagerProtocolClient } from '../src/manager/protocolClient.js';

/** Spins up a tiny in-process fake manager for the duration of one test. */
async function withFakeManager(handler, fn) {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (buf, rinfo) => {
    const reply = (msg) => socket.send(msg, rinfo.port, rinfo.address);
    handler(buf.toString('utf8'), reply);
  });
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const { port } = socket.address();

  try {
    const client = new ManagerProtocolClient({ host: '127.0.0.1', port, timeoutMs: 1000 });
    await fn(client);
  } finally {
    socket.close();
  }
}

test('add sends correct payload and resolves on ok', async () => {
  await withFakeManager(
    (msg, reply) => {
      assert.match(msg, /^add: /);
      const body = JSON.parse(msg.slice(4));
      assert.equal(body.server_port, 8388);
      assert.equal(body.password, 'secret');
      assert.equal(body.method, 'aes-256-gcm');
      reply('ok');
    },
    async (client) => {
      const ok = await client.add({ serverPort: 8388, password: 'secret', method: 'aes-256-gcm' });
      assert.equal(ok, true);
    }
  );
});

test('remove resolves on ok', async () => {
  await withFakeManager(
    (msg, reply) => {
      assert.match(msg, /^remove: /);
      reply('ok');
    },
    async (client) => {
      const ok = await client.remove({ serverPort: 8388 });
      assert.equal(ok, true);
    }
  );
});

test('list parses the real shadowsocks-rust bare-array reply', async () => {
  // Verified against the actual `ssmanager` v1.24.0 binary: `list` replies with
  // a bare JSON array of {server_port, password, ...}, not {"servers":[...]}.
  await withFakeManager(
    (msg, reply) => {
      assert.equal(msg, 'list');
      reply(JSON.stringify([
        { server_port: 8388, password: 'secret1' },
        { server_port: 8389, password: 'secret2' },
      ]));
    },
    async (client) => {
      const ports = await client.list();
      assert.deepEqual(ports, [8388, 8389]);
    }
  );
});

test('list also accepts a legacy {"servers":[...]} reply shape', async () => {
  await withFakeManager(
    (msg, reply) => {
      assert.equal(msg, 'list');
      reply(JSON.stringify({ servers: [{ server_port: 8388 }, { server_port: 8389 }] }));
    },
    async (client) => {
      const ports = await client.list();
      assert.deepEqual(ports, [8388, 8389]);
    }
  );
});

test('ping parses stat map', async () => {
  await withFakeManager(
    (msg, reply) => {
      assert.equal(msg, 'ping');
      reply(`stat: ${JSON.stringify({ 8388: 12345, 8389: 999 })}`);
    },
    async (client) => {
      const stats = await client.ping();
      assert.equal(stats.get(8388), 12345);
      assert.equal(stats.get(8389), 999);
    }
  );
});

test('add rejects when manager does not reply ok', async () => {
  await withFakeManager(
    (msg, reply) => reply('fail: port in use'),
    async (client) => {
      await assert.rejects(() => client.add({ serverPort: 8388, password: 'x', method: 'aes-256-gcm' }));
    }
  );
});

test('request times out when manager is silent', async () => {
  await withFakeManager(
    () => {},
    async (client) => {
      await assert.rejects(() => client.list());
    }
  );
});
