import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';
import morgan from 'morgan';

const request = (port, path, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({
    host: '127.0.0.1',
    port,
    path,
    headers
  }, (res) => {
    res.resume();
    res.once('end', () => resolve(res.statusCode));
  });

  req.once('error', reject);
  req.end();
});

test('combined logging escapes request-controlled remote-user control characters', async (t) => {
  const logEvents = [];
  const app = express();

  app.use(morgan('combined', {
    stream: {
      write: (message) => logEvents.push(message)
    }
  }));
  app.get('/ordinary', (req, res) => res.sendStatus(204));
  app.get('/malicious', (req, res) => res.sendStatus(204));

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  assert.equal(await request(port, '/ordinary'), 204);

  const username = `attacker${String.fromCharCode(10)}forged-entry${String.fromCharCode(13, 9, 0)}end\\slash`;
  const authorization = `Basic ${Buffer.from(`${username}:test-only`, 'latin1').toString('base64')}`;
  assert.equal(await request(port, '/malicious', { authorization }), 204);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(logEvents.length, 2, 'Morgan should emit one event per request');

  const [ordinaryEvent, maliciousEvent] = logEvents;
  assert.match(ordinaryEvent, /GET \/ordinary HTTP\/1\.1" 204 /);
  assert.equal((ordinaryEvent.match(/\n/g) || []).length, 1, 'ordinary event should have one line terminator');

  assert.match(maliciousEvent, /GET \/malicious HTTP\/1\.1" 204 /);
  assert.equal((maliciousEvent.match(/\n/g) || []).length, 1, 'request data must not add a physical log line');

  const maliciousPayload = maliciousEvent.slice(0, -1);
  assert.doesNotMatch(maliciousPayload, /[\u0000-\u001f\u007f]/u);
  assert.ok(
    maliciousPayload.includes('attacker\\nforged-entry\\r\\t\\u0000end\\\\slash'),
    'Morgan should visibly escape control characters and backslashes'
  );
});
