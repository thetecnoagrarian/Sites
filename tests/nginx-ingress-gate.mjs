import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isIP, SocketAddress } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Invoke with the two existing candidate image IDs in FFG_IMAGE and TTA_IMAGE.
// No port publishing, production Compose, or host data volumes are used.
const [mode] = process.argv.slice(2);
const runId = process.env.NGINX_GATE_ID || (mode === '--cleanup' ? '' : randomUUID());
const prefix = 'sites-nginx-gate-' + runId;
const label = 'com.sites.nginx-gate=' + runId;
const scratch = path.resolve(process.env.RUNNER_TEMP || tmpdir(), prefix);
const back = prefix + '-back';
const front = prefix + '-front';
const proxy = prefix + '-proxy';
const clientA = prefix + '-client-a';
const clientB = prefix + '-client-b';
const readinessClient = prefix + '-readiness';
const bridgePeer = prefix + '-bridge-peer';
const dockerSocket = process.env.NGINX_GATE_DOCKER_SOCKET || '/var/run/docker.sock';
assert.ok(path.isAbsolute(dockerSocket), 'The gate requires a local Docker Unix socket');
const dockerEnv = { ...process.env };
delete dockerEnv.DOCKER_CONTEXT;
delete dockerEnv.DOCKER_HOST;
const dockerBin = process.env.DOCKER_BIN || 'docker';
const commandAbort = new AbortController();
const nginxImage = 'nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236';
const fixture = name => fileURLToPath(new URL('./fixtures/' + name, import.meta.url));
const clientScript = readFileSync(fixture('nginx-ingress-client.mjs'), 'utf8');
const cert = path.join(scratch, 'server.crt');
const nginxConfig = '/run/nginx-gate/nginx.conf';
const nginxErrorLog = '/var/log/nginx/gate-error.log';
const limit = 4;
const exemptLimit = 10000;
const wrongPeer = '192.0.2.250';
const readinessInterval = 250;
const sites = [
    { key: 'ffg', siteName: 'Fruition Forest Garden', port: 4000, image: process.env.FFG_IMAGE },
    { key: 'tta', siteName: 'The Tecnoagrarian', port: 4002, image: process.env.TTA_IMAGE }
].map(site => ({ ...site, name: prefix + '-' + site.key, host: site.key + '.nginx-gate.test' }));

const terminationGrace = 100;
const reapGrace = 50;
const timeoutError = () => Object.assign(new Error('Command timed out'), { code: 'ETIMEDOUT' });
const abortError = () => Object.assign(new Error('Command aborted'), { code: 'ABORT_ERR' });

function superviseCommand(file, args) {
    assert.ok(process.send, 'The command supervisor requires its parent IPC channel');
    let stopping = false;
    let reported = false;
    let released = false;

    function stop(grace) {
        if (stopping || released) return;
        stopping = true;
        // This process is the detached session leader. It keeps its own group
        // alive through escalation, even when the command and its pipes close.
        // The caller never signals a numeric group ID that could have been reused.
        process.kill(-process.pid, 'SIGTERM');
        setTimeout(() => process.kill(-process.pid, 'SIGKILL'), grace);
    }

    const report = result => {
        if (stopping || !process.connected) return;
        reported = true;
        process.send({ type: 'result', ...result }, () => {});
    };
    process.on('SIGTERM', () => stop(terminationGrace));
    process.on('disconnect', () => stop(0));
    process.stdout.on('error', () => stop(0));
    process.stderr.on('error', () => stop(0));
    process.on('message', message => {
        if (message.type === 'stop') stop(message.grace);
        if (message.type === 'release' && reported && !stopping) {
            released = true;
            process.disconnect();
        }
    });
    process.once('message', message => {
        if (message.type !== 'start' || stopping) return;
        let command;
        try { command = spawn(file, args, { stdio: [0, 'pipe', 'pipe'] }); }
        catch (error) {
            report({ spawnError: error.code ?? 'ERR_COMMAND_SPAWN' });
            return;
        }
        let spawnError;
        command.on('error', error => { spawnError = error.code; });
        for (const [source, destination] of [[command.stdout, process.stdout], [command.stderr, process.stderr]]) {
            source.on('error', () => stop(0));
            source.pipe(destination, { end: false });
        }
        command.once('close', (status, signal) => report({ status, signal, spawnError }));
    });
    process.send({ type: 'ready' }, () => {});
}

export async function runCommand(file, args, { deadline, env, input, signal, maxBuffer = 2 * 1024 * 1024 }) {
    if (signal?.aborted) throw abortError();
    // Reserve time for TERM, KILL and reaping inside the command's deadline.
    const executeUntil = deadline - terminationGrace - reapGrace;
    if (performance.now() >= executeUntil) throw timeoutError();

    return new Promise((resolve, reject) => {
        // A detached POSIX supervisor owns the process group. Uninterruptible
        // tasks, descendants that leave the group and daemon-owned work remain
        // outside the termination guarantee.
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--command-supervisor', file, ...args],
            { env, detached: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        const stdout = [];
        let stdoutBytes = 0, stderrBytes = 0;
        let failure, result, settleTimer, finished = false;
        const remaining = until => Math.max(0, Math.ceil(until - performance.now()));
        const executeTimer = setTimeout(() => stop(timeoutError()), remaining(executeUntil));
        const send = message => {
            if (child.connected) child.send(message, () => {});
        };

        function finish(error) {
            if (finished) return;
            finished = true;
            clearTimeout(executeTimer);
            clearTimeout(settleTimer);
            signal?.removeEventListener('abort', onAbort);
            if (child.connected) child.disconnect();
            child.stdin.destroy();
            child.stdout.destroy();
            child.stderr.destroy();
            child.unref();
            if (error) reject(error);
            else resolve(Buffer.concat(stdout, stdoutBytes).toString('utf8').trim());
        }

        function stop(error) {
            if (failure || finished) return;
            failure = error;
            clearTimeout(executeTimer);
            const stopBy = Math.min(deadline, performance.now() + terminationGrace + reapGrace);
            send({ type: 'stop', grace: remaining(stopBy - reapGrace) });
            // The supervisor handles escalation on its own if the caller's
            // deadline comes first. Open pipes cannot keep the caller pending.
            settleTimer = setTimeout(() => finish(failure), remaining(stopBy));
        }

        const onAbort = () => stop(abortError());
        const outputLimit = stream => stop(Object.assign(new Error('Command exceeded the ' + stream + ' limit'),
            { code: 'ENOBUFS' }));
        child.stdout.on('data', chunk => {
            if (failure || finished) return;
            stdoutBytes += chunk.length;
            if (stdoutBytes > maxBuffer) outputLimit('stdout');
            else stdout.push(chunk);
        });
        child.stderr.on('data', chunk => {
            if (failure || finished) return;
            stderrBytes += chunk.length;
            if (stderrBytes > maxBuffer) outputLimit('stderr');
        });
        for (const stream of [child.stdout, child.stderr]) {
            stream.on('error', error => stop(Object.assign(new Error('Command output failed'), { code: error.code })));
        }
        child.on('error', error => finish(failure ?? Object.assign(new Error('Command could not start'), { code: error.code })));
        child.stdin.on('error', error => {
            if (error.code !== 'EPIPE') stop(Object.assign(new Error('Command stdin failed'), { code: error.code }));
        });
        child.on('message', message => {
            if (failure || finished) return;
            if (performance.now() >= executeUntil) {
                stop(timeoutError());
            } else if (message.type === 'ready') {
                send({ type: 'start' });
            } else if (message.type === 'result') {
                result = message;
                send({ type: 'release' });
            }
        });
        child.once('close', (status, exitSignal) => {
            if (finished) return;
            if (failure) {
                finish(failure);
            } else if (performance.now() >= executeUntil) {
                finish(timeoutError());
            } else if (status !== 0 || !result) {
                finish(Object.assign(new Error('Command supervisor exited before completing the command'),
                    { code: 'COMMAND_FAILED', status, signal: exitSignal }));
            } else if (result.spawnError) {
                finish(Object.assign(new Error('Command could not start'), { code: result.spawnError }));
            } else if (result.status !== 0) {
                finish(Object.assign(new Error(result.signal ? 'Command terminated by ' + result.signal :
                    'Command exited with status ' + result.status), { code: 'COMMAND_FAILED', status: result.status, signal: result.signal }));
            } else {
                finish();
            }
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        child.stdin.end(input);
    });
}

function docker(args, input, { timeout = 20000, deadline = Infinity, signal = commandAbort.signal } = {}) {
    return runCommand(dockerBin, ['--host', 'unix://' + dockerSocket, ...args], {
        env: dockerEnv, input, signal, deadline: Math.min(deadline, performance.now() + timeout)
    });
}

const mount = (source, target) => ['--mount', 'type=bind,source=' + source + ',target=' + target + ',readonly'];
const container = async name => JSON.parse(await docker(['container', 'inspect', '--format',
    '{"ports":{{json .HostConfig.PortBindings}},"publishAll":{{json .HostConfig.PublishAllPorts}},"networks":{{json .NetworkSettings.Networks}}}', name]));
async function isolated(name, networks) {
    const info = await container(name);
    assert.deepEqual(Object.keys(info.ports ?? {}), [], name + ' must have no host bindings');
    assert.equal(info.publishAll, false);
    assert.deepEqual(Object.keys(info.networks).sort(), [...networks].sort(), name + ' network attachments');
    return info.networks;
}

function canonical(address) {
    if (isIP(address) === 4) return address;
    assert.equal(isIP(address), 6, 'Expected an observed IPv4 or IPv6 address');
    const normalized = new SocketAddress({ address, family: 'ipv6' }).address;
    const mapped = normalized.slice('::ffff:'.length);
    return normalized.startsWith('::ffff:') && isIP(mapped) === 4 ? mapped : normalized;
}

const ids = async (kind, args, options) =>
    (await docker([kind, ...args, '--filter', 'label=' + label], undefined, options)).split(/\s+/).filter(Boolean);
const containers = options => ids('ps', ['-aq'], options);
const networks = options => ids('network', ['ls', '-q'], options);

async function cleanup() {
    const options = { signal: null };
    const failures = [];
    for (const [list, remove, resource] of [[containers, ['rm', '-fv'], 'containers'], [networks, ['network', 'rm'], 'networks']]) {
        try {
            const owned = await list(options);
            if (owned.length) await docker([...remove, ...owned], undefined, options);
            assert.deepEqual(await list(options), [], 'Gate ' + resource + ' must be removed');
        } catch (error) {
            failures.push(new Error('Could not clean up gate ' + resource, { cause: error }));
        }
    }
    try { rmSync(scratch, { recursive: true, force: true }); }
    catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'nginx gate cleanup failed');
}

export async function withCleanup(action, cleanupAction) {
    let primary;
    try {
        await action();
    } catch (error) {
        primary = error;
        throw error;
    } finally {
        try { await cleanupAction(); }
        catch (error) {
            if (primary) throw new AggregateError([primary, error], 'nginx gate and cleanup failed', { cause: primary });
            throw error;
        }
    }
}

async function startClient(name, network) {
    await docker(['run', '-d', '--pull=never', '--name', name, '--label', label, '--network', network, '--no-healthcheck',
        ...mount(cert, '/tmp/nginx-gate.crt'), '--entrypoint', 'node', sites[0].image, '-e', 'setInterval(() => {}, 60000)']);
    return (await isolated(name, [network]))[network];
}

async function startSite(site, peer, exempt) {
    const instance = randomUUID();
    const id = await docker(['run', '-d', '--pull=never', '--name', site.name, '--label', label, '--network', back,
        '--network-alias', site.key + '-gate', '--no-healthcheck',
        ...mount(fixture('nginx-ingress-observer.mjs'), '/app/nginx-ingress-observer.mjs'),
        '-e', 'NGINX_GATE_INSTANCE=' + instance, '-e', 'NODE_ENV=production', '-e', 'APP_ROLE=production', '-e', 'PORT=' + site.port,
        '-e', 'SESSION_SECRET=nginx-gate-synthetic-only-session', '-e', 'DATABASE_PATH=/app/data/blog.db',
        '-e', 'UPLOADS_PATH=/app/data/uploads', '-e', 'BASE_URL=https://' + site.host, '-e', 'LOG_LEVEL=warn',
        '-e', 'RATE_LIMIT_WINDOW_MS=900000', '-e', 'RATE_LIMIT_MAX_REQUESTS=' + limit,
        '-e', 'TRUSTED_INGRESS_PEERS=' + peer, '-e', 'TRUSTED_IPS=' + exempt,
        site.image, 'node', '--import', '/app/nginx-ingress-observer.mjs', 'src/app.js']);
    assert.match(id, /^[a-f0-9]{64}$/);
    const healthUrl = 'http://127.0.0.1:' + site.port + '/health';
    const deadline = performance.now() + 30000;
    let ready = false;
    while (performance.now() < deadline) {
        try {
            const status = await docker(['exec', id, 'curl', '-sS', '--max-time', '2', '-o', '/dev/null', '-w', '%{http_code}', healthUrl],
                undefined, { timeout: 3000, deadline });
            if (status === '200' && performance.now() < deadline) {
                ready = true;
                break;
            }
        } catch (error) {
            if (error.code === 'ABORT_ERR') throw error;
            // Curl may fail while the application is booting.
        }
        const pause = deadline - performance.now();
        if (pause > 0) await delay(Math.min(readinessInterval, pause));
    }
    assert.ok(ready, site.key + ' loopback health did not become ready for ' + id);
    assert.equal(await docker(['container', 'inspect', '--format', '{{.State.Running}}', id]), 'true');
    const address = (await isolated(id, [back]))[back].IPAddress;
    assert.equal(isIP(address), 4);
    return { id, instance, address };
}

async function wire(site, source, address, pathname, { tls = true, sharedNamespace = false, timeout, deadline, ...options } = {}) {
    const command = sharedNamespace
        ? ['run', '--rm', '-i', '--pull=never', '--label', label, '--network', 'container:' + proxy,
            '--no-healthcheck', '--entrypoint', 'node', sites[0].image]
        : ['exec', '-i', source, 'node'];
    const args = { tls, host: site.host, address, port: tls ? 8443 : site.port, pathname, ...options };
    const output = await docker([...command, '--input-type=module', '-e', clientScript], JSON.stringify(args), { timeout, deadline });
    try { return JSON.parse(output); }
    catch { throw new Error('Malformed synthetic client response'); }
}

function readObservation(response) {
    const value = response.headers['x-nginx-gate-observation'];
    assert.ok(value, 'Missing observation of the real Express socket and identity');
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function observation(response, { status = 200, peer, ip, secure, ips = [] }) {
    assert.equal(response.status, status);
    const report = readObservation(response);
    assert.equal(canonical(report.socketPeer), peer);
    assert.equal(report.clientIp, ip);
    assert.equal(canonical(report.ip), ip);
    assert.deepEqual(report.ips, ips);
    assert.equal(report.protocol, secure ? 'https' : 'http');
    return report;
}

const transientConnectionErrors = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT']);

export async function waitForReplacement(expected, probe, diagnostics, {
    timeout = 15000, now = () => performance.now(), pause = delay
} = {}) {
    const started = now();
    const deadline = started + timeout;
    let attempts = 0;
    let lastStatus = null;
    let lastConnectionError = null;
    let lastObservedUpstream = null;
    try {
        for (let remaining = deadline - now(); remaining > 0; remaining = deadline - now()) {
            attempts += 1;
            let response;
            try {
                response = await probe(Math.min(6500, remaining), deadline);
            } catch (error) {
                const reason = error.code === 'ETIMEDOUT' ? 'Docker readiness command timed out' :
                    'Docker readiness probe failed to execute';
                throw new Error(reason, { cause: error });
            }
            assert.ok(response && typeof response === 'object', 'Missing readiness probe result');
            if (response.connectionError !== undefined) {
                assert.ok(transientConnectionErrors.has(response.connectionError), 'Non-retryable readiness transport failure');
                lastConnectionError = response.connectionError;
            } else {
                lastStatus = Number.isInteger(response.status) ? response.status : null;
                assert.ok(lastStatus === 200 || lastStatus === 502,
                    'Unexpected readiness HTTP status ' + (lastStatus ?? 'unknown'));
                if (lastStatus === 502) {
                    assert.ok(!response.headers?.['x-nginx-gate-observation'], 'Application returned HTTP 502 during readiness');
                }
                if (lastStatus === 200) {
                    let report, health;
                    try {
                        report = readObservation(response);
                        health = json(response);
                    } catch {
                        throw new Error('Readiness response lacks valid application health or socket observation');
                    }
                    if (isIP(report?.upstreamAddress) && Number.isInteger(report.upstreamPort) &&
                        report.upstreamPort > 0 && report.upstreamPort <= 65535) {
                        lastObservedUpstream = canonical(report.upstreamAddress) + ':' + report.upstreamPort;
                    }
                    verifyReplacement(report, health, expected);
                    if (now() < deadline) return;
                }
            }
            const wait = deadline - now();
            if (wait > 0) await pause(Math.min(readinessInterval, wait));
        }
        throw new Error('nginx replacement readiness timed out');
    } catch (error) {
        const elapsedMs = Math.round(now() - started);
        let evidence;
        try { evidence = await diagnostics(); }
        catch { evidence = { diagnostics: 'unavailable' }; }
        throw new Error(error.message + ': ' + JSON.stringify({
            expectedContainer: expected.id, expectedUpstream: expected.address + ':' + expected.port,
            lastStatus, lastConnectionError, lastObservedUpstream, attempts, elapsedMs, ...evidence
        }), { cause: error });
    }
}

function verifyReplacement(report, health, expected) {
    assert.ok(health?.status === 'ok' && health.siteName === expected.siteName &&
        report?.hostname === expected.host, 'Readiness response came from an unexpected site');
    assert.ok(report.instance === expected.instance, 'Readiness response came from an unexpected app instance');
    assert.ok(canonical(report.upstreamAddress) === expected.address && report.upstreamPort === expected.port,
        'Readiness upstream socket disagrees with replacement Docker metadata');
    assert.ok(canonical(report.socketPeer) === expected.peer, 'Readiness nginx socket peer changed');
}

async function readinessDiagnostics(site, id) {
    const deadline = performance.now() + 2000;
    const read = async args => {
        try { return await docker(args, undefined, { deadline, signal: null }); }
        catch { return ''; }
    };
    const [state, health, log] = await Promise.all([
        read(['container', 'inspect', '--format', '{{.State.Status}}', id]),
        read(['exec', id, 'curl', '-sS', '--max-time', '1', '-o', '/dev/null', '-w', '%{http_code}',
            'http://127.0.0.1:' + site.port + '/health']),
        read(['exec', proxy, 'tail', '-n', '30', nginxErrorLog])
    ]);
    const lines = log.split('\n').filter(line => line.includes('host: "' + site.host + '"'));
    const addresses = lines.flatMap(line => [...line.matchAll(/upstream: "http:\/\/([\d.]+):(\d+)\//g)])
        .filter(([, ip]) => isIP(ip) === 4);
    const lastUpstream = addresses.at(-1);
    return {
        containerState: /^[a-z]+$/.test(state) ? state : 'unavailable',
        loopbackHealth: /^\d{3}$/.test(health) ? health : 'unavailable',
        lastNginxUpstream: lastUpstream ? lastUpstream[1] + ':' + lastUpstream[2] : null,
        nginxLogAvailable: log !== '',
        nginxErrors: ['could not be resolved', 'no resolver defined', 'connect() failed', 'upstream timed out',
            'upstream prematurely closed'].filter(kind => lines.some(line => line.includes(kind)))
    };
}

function forwarded(report, site, client) {
    // isIP accepts only one address, so this also rejects a comma-joined chain.
    assert.equal(canonical(report.before.for), client);
    assert.equal(report.before.proto, 'https');
    assert.equal(report.before.host, site.host);
    assert.equal(report.before.forwarded, null);
    assert.equal(report.before.realIp, null);
    assert.equal(report.hostname, site.host);
}

function bucket(response, capacity, used) {
    assert.equal(response.headers['ratelimit-limit'], String(capacity));
    assert.equal(response.headers['ratelimit-remaining'], String(Math.max(0, capacity - used)));
}

const spoofed = ip => ({
    'x-forwarded-for': [ip, '198.51.100.25'],
    'x-forwarded-proto': 'http',
    'x-forwarded-host': 'unsanctioned.nginx-gate.test',
    forwarded: 'for=198.51.100.25',
    'x-real-ip': '198.51.100.25'
});

async function detectWrongPeer(site, proxyIp, peers, nexus) {
    const clients = [[clientA, peers.a4], [clientB, peers.b4]];
    let measured;
    for (const [index, [source, ip]] of clients.entries()) {
        const response = await wire(site, source, nexus.v4, '/health');
        const report = observation(response, { peer: proxyIp, ip: proxyIp, secure: false });
        measured = canonical(report.socketPeer);
        forwarded(report, site, ip);
        bucket(response, limit, index + 1);
        assert.equal(response.headers['set-cookie'], undefined);
    }
    const login = await wire(site, clientB, nexus.v4, '/login');
    assert.equal(login.status, 200);
    assert.equal(login.headers['set-cookie'], undefined, 'A wrong peer must be detected even when /health returns 200');
    return measured;
}

async function verifyTrust(site, address, proxyIp, peers, nexus) {
    for (let i = 1; i <= limit + 1; i += 1) {
        const headers = i === 1 ? {} : spoofed(peers.b4);
        if (i === 2) headers['x-forwarded-for'] = peers.b4;
        const response = await wire(site, clientA, nexus.v4, '/health', { headers });
        const report = observation(response, {
            status: i > limit ? 429 : 200, peer: proxyIp, ip: peers.a4, secure: true, ips: [peers.a4]
        });
        forwarded(report, site, peers.a4);
        bucket(response, limit, i);
    }
    const exempt = await wire(site, clientB, nexus.v4, '/health');
    forwarded(observation(exempt, { peer: proxyIp, ip: peers.b4, secure: true, ips: [peers.b4] }), site, peers.b4);
    bucket(exempt, exemptLimit, 1);
    for (const [source, ip] of [[clientA, peers.a6], [clientB, peers.b6]]) {
        const v6 = await wire(site, source, nexus.v6, '/health', { headers: spoofed(peers.b4) });
        forwarded(observation(v6, { peer: proxyIp, ip, secure: true, ips: [ip] }), site, ip);
        bucket(v6, limit, 1);
    }

    const directHeaders = { ...spoofed(peers.b4), 'x-forwarded-for': peers.b4, 'x-forwarded-proto': 'https' };
    const direct = await wire(site, bridgePeer, address, '/health', { tls: false, headers: directHeaders });
    const report = observation(direct, { peer: peers.bridge, ip: peers.bridge, secure: false });
    assert.equal(report.before.for, peers.b4);
    assert.equal(report.hostname, site.host);
    bucket(direct, limit, 1);
    const directLogin = await wire(site, bridgePeer, address, '/login', { tls: false, headers: directHeaders });
    assert.equal(directLogin.status, 200);
    assert.equal(directLogin.headers['set-cookie'], undefined);

    // Use the actual nginx network namespace for upstream fault injection.
    // The public nginx listener always uses the production header contract.
    const fromProxy = headers => wire(site, proxy, address, '/health', { tls: false, sharedNamespace: true, headers });
    const mapped = await fromProxy({ 'x-forwarded-for': '::ffff:' + peers.b4, 'x-forwarded-proto': 'https' });
    observation(mapped, { peer: proxyIp, ip: peers.b4, secure: true, ips: [peers.b4] });
    bucket(mapped, exemptLimit, 2);
    for (const [index, value] of [undefined, 'invalid-address', [peers.b4, peers.a4]].entries()) {
        const headers = { 'x-forwarded-proto': 'https' };
        if (value !== undefined) headers['x-forwarded-for'] = value;
        const response = await fromProxy(headers);
        observation(response, { peer: proxyIp, ip: proxyIp, secure: true });
        bucket(response, limit, index + 1);
    }
}

const responseBytes = response => Buffer.from(response.body, 'base64');
const html = response => responseBytes(response).toString('utf8');
const json = response => JSON.parse(html(response));
function hidden(response, name) {
    assert.equal(response.status, 200);
    const value = html(response).match(new RegExp('name="' + name + '"\\s+value="([^"]+)"'))?.[1];
    assert.ok(value, 'Missing synthetic form field ' + name);
    return value;
}
const database = (site, sql) => docker(['exec', '-i', site.name, 'sqlite3', '-bail', '/app/data/blog.db'], sql);

async function verifySessionsAndMedia(site, proxyAddress, photo, historical) {
    await database(site, readFileSync(fixture('local-test-seed.sql')));
    await docker(['exec', '-i', site.name, 'node', '--input-type=module', '-e', [
        'import { readFileSync, mkdirSync, writeFileSync } from "node:fs";',
        'const bytes = Buffer.from(readFileSync(0, "utf8"), "base64");',
        'mkdirSync("/app/data/uploads/temp", { recursive: true });',
        'writeFileSync("/app/data/uploads/gate-historical.webp", bytes);',
        'writeFileSync("/app/data/uploads/temp/gate-private.webp", bytes);'
    ].join('\n')], historical.toString('base64'));
    const send = (pathname, options) => wire(site, clientB, proxyAddress, pathname, options);
    const guestEditor = await send('/admin/posts/new');
    assert.equal(guestEditor.status, 302);
    assert.equal(guestEditor.headers.location, '/login');
    const login = await send('/login');
    const csrf = hidden(login, '_csrf');
    const secureCookie = login.headers['set-cookie']?.find(header => header.startsWith('blog.sid='));
    assert.ok(secureCookie && /;\s*Secure(?:;|$)/i.test(secureCookie), 'Expected a Secure session cookie over nginx TLS');
    const cookie = secureCookie.split(';', 1)[0];
    const session = { cookie };
    const credentials = { username: 'mode-b-multer-admin', password: 'ModeB-Multer-Synthetic-Only-2026' };
    assert.equal((await send('/login', { method: 'POST', form: credentials, headers: session })).status, 403);
    const accepted = await send('/login', { method: 'POST', form: { ...credentials, _csrf: csrf }, headers: session });
    assert.equal(accepted.status, 302);
    assert.equal(accepted.headers.location, '/admin');
    const updatedCookie = accepted.headers['set-cookie']?.find(header => header.startsWith('blog.sid='));
    if (updatedCookie) {
        assert.match(updatedCookie, /;\s*Secure(?:;|$)/i);
        session.cookie = updatedCookie.split(';', 1)[0];
    }
    assert.equal((await send('/admin/dashboard', { headers: session })).status, 200);

    const form = await send('/admin/posts/new', { headers: session });
    const author = await database(site, "SELECT id FROM public_people WHERE public_key = 'mode-b-author-one';");
    assert.match(author, /^[1-9][0-9]*$/);
    const fields = {
        _csrf: hidden(form, '_csrf'), mediaOperationId: hidden(form, 'mediaOperationId'),
        title: 'Synthetic nginx ingress publication', body: 'Synthetic test content.', created_at: '2026-08-20',
        authorIds: author, authorPositions: '1', publisherId: author
    };
    const create = '/admin/dashboard/posts/create';
    if (site.key === 'ffg') {
        fields.galleryDraftId = hidden(form, 'galleryDraftId');
        fields.galleryDraftRevision = hidden(form, 'galleryDraftRevision');
        fields.galleryKnownPhotos = '[]';
        const saved = await send(create, { method: 'POST', form: { ...fields, submitIntent: 'draft' },
            headers: { ...session, accept: 'application/json' } });
        assert.equal(saved.status, 200);
        const draft = json(saved);
        assert.equal(draft.previewUrl, '/admin/gallery-drafts/' + fields.galleryDraftId + '/preview');
        assert.equal((await send(draft.previewUrl, { headers: session })).status, 200);
        const anonymous = await send(draft.previewUrl);
        assert.equal(anonymous.status, 302);
        assert.equal(anonymous.headers.location, '/login');
        fields.galleryDraftRevision = String(draft.revision);
    }
    const published = await send(create, { method: 'POST', form: fields, image: photo.toString('base64'), headers: session });
    assert.equal(published.status, 302);
    assert.equal(published.headers.location, '/admin/dashboard');
    const images = JSON.parse(await database(site, "SELECT images FROM posts WHERE title = 'Synthetic nginx ingress publication';"));
    const media = images[0]?.medium;
    assert.match(media, /^\/uploads\/m1-[a-f0-9-]{36}-medium\.webp$/);

    const publicMedia = await send(media);
    assert.equal(publicMedia.status, 200);
    assert.match(publicMedia.headers['content-type'], /^image\/webp\b/);
    assert.ok(responseBytes(publicMedia).length > 0);
    assert.ok(publicMedia.headers.etag, 'Accepted media must provide an ETag');
    const head = await send(media, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.etag, publicMedia.headers.etag);
    assert.equal(head.headers['content-length'], publicMedia.headers['content-length']);
    assert.equal(responseBytes(head).length, 0);
    const conditional = { 'if-none-match': publicMedia.headers.etag };
    assert.equal((await send(media, { headers: conditional })).status, 304);

    const legacy = await send('/uploads/gate-historical.webp');
    assert.equal(legacy.status, 200);
    assert.ok(responseBytes(legacy).equals(historical), 'Legacy URL must retain the synthetic bytes');
    const filename = path.posix.basename(media);
    const candidate = filename.slice(3, -'-medium.webp'.length);
    for (const denied of ['/uploads/.media/post/' + candidate + '/' + filename, '/uploads/temp/gate-private.webp']) {
        for (const method of ['GET', 'HEAD']) {
            const response = await send(denied, { method, headers: conditional });
            assert.equal(response.status, 404);
            assert.equal(response.headers['cache-control'], 'no-store');
        }
    }
    // A cached ETag must not bypass verification of changed synthetic bytes.
    await docker(['exec', site.name, 'node', '-e',
        'require("node:fs").appendFileSync(process.argv[1], "synthetic change")',
        '/app/data/uploads/.media/post/' + candidate + '/' + filename]);
    for (const method of ['GET', 'HEAD']) {
        const response = await send(media, { method, headers: conditional });
        assert.equal(response.status, 404);
        assert.equal(response.headers['cache-control'], 'no-store');
    }
}

async function run() {
    for (const site of sites) assert.match(site.image ?? '', /^sha256:[a-f0-9]{64}$/, 'Use the exact built candidate image IDs');
    assert.deepEqual(await containers(), [], 'Gate namespace is already in use');
    assert.deepEqual(await networks(), [], 'Gate network namespace is already in use');
    mkdirSync(scratch, { mode: 0o700 });
    await withCleanup(async () => {
        const { default: sharp } = await import('sharp');
        const image = { create: { width: 32, height: 16, channels: 3, background: '#287a56' } };
        const [photo, historical] = await Promise.all([sharp(image).png().toBuffer(), sharp(image).webp().toBuffer()]);
        await runCommand('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
            '-subj', '/CN=' + sites[0].host, '-addext', 'subjectAltName=' + sites.map(site => 'DNS:' + site.host).join(','),
            '-out', cert, '-keyout', path.join(scratch, 'server.key')],
        { deadline: performance.now() + 15000, signal: commandAbort.signal });
        chmodSync(cert, 0o644);
        // Resolver caches are worker-local. Probe the single worker that will handle the assertions.
        writeFileSync(path.join(scratch, 'nginx.conf'), [
            'user nginx;', 'worker_processes 1;', 'error_log ' + nginxErrorLog + ' warn;', 'events {}',
            'http { include /etc/nginx/conf.d/default.conf; }\n'
        ].join('\n'));
        await docker(['pull', nginxImage], undefined, { timeout: 120000 });
        for (const [name, dualStack] of [[back, false], [front, true]]) {
            await docker(['network', 'create', '--driver', 'bridge', '--internal', '--label', label, '--ipv6=' + dualStack, name]);
            assert.equal(await docker(['network', 'inspect', '--format', '{{.Internal}}|{{.EnableIPv6}}', name]), 'true|' + dualStack);
        }
        await docker(['run', '-d', '--pull=never', '--name', proxy, '--label', label, '--network', front,
            ...mount(fixture('nginx-ingress.conf'), '/etc/nginx/conf.d/default.conf'), ...mount(scratch, '/run/nginx-gate'),
            nginxImage, 'nginx', '-c', nginxConfig, '-g', 'daemon off;']);
        await docker(['network', 'connect', back, proxy]);
        await docker(['exec', proxy, 'nginx', '-t', '-c', nginxConfig]);
        const attached = await isolated(proxy, [back, front]);
        const proxyIp = canonical(attached[back].IPAddress);
        assert.notEqual(proxyIp, wrongPeer);
        const nexus = { v4: attached[front].IPAddress, v6: attached[front].GlobalIPv6Address };
        assert.equal(isIP(nexus.v4), 4);
        assert.equal(isIP(nexus.v6), 6);
        const a = await startClient(clientA, front);
        const b = await startClient(clientB, front);
        const rogue = await startClient(bridgePeer, back);
        await startClient(readinessClient, front);
        const peers = { a4: canonical(a.IPAddress), b4: canonical(b.IPAddress), a6: canonical(a.GlobalIPv6Address),
            b6: canonical(b.GlobalIPv6Address), bridge: canonical(rogue.IPAddress) };
        assert.notEqual(peers.a4, peers.b4);
        assert.notEqual(peers.a6, peers.b6);
        assert.notEqual(peers.bridge, proxyIp);

        for (const site of sites) {
            console.log(site.key + ' measuring nginx socket and checking valid-but-wrong configuration');
            const original = await startSite(site, wrongPeer, peers.b4);
            const observedPeer = await detectWrongPeer(site, proxyIp, peers, nexus);
            await docker(['rm', '-fv', original.id]);
            const replacement = await startSite(site, observedPeer, peers.b4);
            assert.notEqual(replacement.id, original.id);
            assert.notEqual(replacement.instance, original.instance);
            await waitForReplacement({ ...site, ...replacement, peer: observedPeer },
                (timeout, deadline) => wire(site, readinessClient, nexus.v4, '/health', { timeout, deadline, reportTransportError: true }),
                () => readinessDiagnostics(site, replacement.id));
            await verifyTrust(site, replacement.address, observedPeer, peers, nexus);
            await verifySessionsAndMedia(site, nexus.v4, photo, historical);
            console.log(site.key + ' passed ingress, identity, session and media assertions');
        }
    }, cleanup);
}

if (import.meta.main && mode === '--command-supervisor') {
    superviseCommand(process.argv[3], process.argv.slice(4));
} else if (import.meta.main) {
    assert.ok(mode === undefined || mode === '--cleanup');
    assert.match(runId, /^[a-z0-9][a-z0-9-]{0,63}$/);
    const interrupt = () => { process.exitCode = 130; commandAbort.abort(); };
    const terminate = () => { process.exitCode = 143; commandAbort.abort(); };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    try {
        if (mode === '--cleanup') await cleanup();
        else await run();
    } finally {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', terminate);
    }
}
