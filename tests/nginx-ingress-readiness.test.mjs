import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand, waitForReplacement, withCleanup } from './nginx-ingress-gate.mjs';

const expected = {
    id: 'a'.repeat(64), instance: 'replacement', address: '192.0.2.12', port: 4000,
    peer: '192.0.2.2', host: 'ffg.nginx-gate.test', siteName: 'Fruition Forest Garden'
};

function healthy(socket = {}, health = {}) {
    const report = { instance: expected.instance, upstreamAddress: '::ffff:' + expected.address,
        upstreamPort: expected.port, socketPeer: expected.peer, hostname: expected.host, ...socket };
    return {
        status: 200,
        headers: { 'x-nginx-gate-observation': Buffer.from(JSON.stringify(report)).toString('base64url') },
        body: Buffer.from(JSON.stringify({ status: 'ok', siteName: expected.siteName, ...health })).toString('base64')
    };
}

function clock(timeout = 1000) {
    let elapsed = 0;
    return { timeout, now: () => elapsed, pause: ms => { elapsed += ms; } };
}

const unexpectedDiagnostics = () => assert.fail('Diagnostics should run only on failure');

test('accepts the exact replacement identity, socket and site', async () => {
    await waitForReplacement(expected, () => healthy(), unexpectedDiagnostics, clock());
});

test('retries transient 502 and connection refusal before accepting the replacement', async () => {
    const replies = [{ status: 502 }, { connectionError: 'ECONNREFUSED' }, healthy()];
    const timing = clock();
    await waitForReplacement(expected, () => replies.shift(), unexpectedDiagnostics, timing);
    assert.equal(replies.length, 0);
    assert.equal(timing.now(), 500);
});

for (const [name, response, failure] of [
    ['old instance even if Docker reuses its address', healthy({ instance: 'old' }), /unexpected app instance/],
    ['wrong site', healthy({}, { siteName: 'The Tecnoagrarian' }), /unexpected site/],
    ['wrong host', healthy({ hostname: 'tta.nginx-gate.test' }), /unexpected site/],
    ['wrong upstream address', healthy({ upstreamAddress: '192.0.2.99' }), /Docker metadata/],
    ['wrong upstream port', healthy({ upstreamPort: 4002 }), /Docker metadata/],
    ['changed immediate peer', healthy({ socketPeer: '192.0.2.99' }), /socket peer changed/],
    ['bare HTTP 200', { status: 200, headers: {} }, /lacks valid application health or socket observation/],
    ['application HTTP 502', { ...healthy(), status: 502 }, /Application returned HTTP 502/],
    ['application HTTP 500', { status: 500 }, /Unexpected readiness HTTP status 500/],
    ['TLS verification failure', { connectionError: 'ERR_TLS_CERT_ALTNAME_INVALID' }, /Non-retryable readiness transport/]
]) {
    test('rejects ' + name + ' immediately', async () => {
        let attempts = 0;
        let diagnostics = 0;
        await assert.rejects(waitForReplacement(expected, () => { attempts += 1; return response; },
            () => { diagnostics += 1; return {}; }, clock()), failure);
        assert.equal(attempts, 1);
        assert.equal(diagnostics, 1);
    });
}

test('caps retries and per-probe time at the deadline and reports bounded evidence', async () => {
    const timing = clock(600);
    const probeBudgets = [];
    let diagnosticCalls = 0;
    await assert.rejects(waitForReplacement(expected, budget => {
        probeBudgets.push(budget);
        return probeBudgets.length === 2 ? { connectionError: 'ECONNREFUSED' } : {
            status: 502, body: 'sensitive response body sentinel', headers: { 'set-cookie': 'sensitive cookie sentinel' }
        };
    }, () => {
        diagnosticCalls += 1;
        return { containerState: 'running', loopbackHealth: '200', lastNginxUpstream: '192.0.2.10:4000',
            nginxErrors: ['connect() failed'] };
    }, timing), error => {
        assert.match(error.message, /^nginx replacement readiness timed out: /);
        assert.doesNotMatch(error.message, /sensitive/);
        assert.deepEqual(JSON.parse(error.message.slice(error.message.indexOf('{'))), {
            expectedContainer: expected.id, expectedUpstream: '192.0.2.12:4000', lastStatus: 502,
            lastConnectionError: 'ECONNREFUSED', lastObservedUpstream: null, attempts: 3, elapsedMs: 600, containerState: 'running',
            loopbackHealth: '200', lastNginxUpstream: '192.0.2.10:4000', nginxErrors: ['connect() failed']
        });
        return true;
    });
    assert.deepEqual(probeBudgets, [600, 350, 100]);
    assert.equal(diagnosticCalls, 1);
    assert.equal(timing.now(), 600);
});

test('a successful response after the deadline cannot pass', async () => {
    const timing = clock(100);
    await assert.rejects(waitForReplacement(expected, () => {
        timing.pause(100);
        return healthy();
    }, () => ({}), timing), /readiness timed out/);
});

test('a probe receives the lesser of the remaining budget and the command ceiling', async () => {
    const timing = clock(15000);
    const argumentsSeen = [];
    await waitForReplacement(expected, (budget, deadline) => {
        argumentsSeen.push([budget, deadline]);
        if (argumentsSeen.length > 1) return healthy();
        timing.pause(9000);
        return { status: 502 };
    }, unexpectedDiagnostics, timing);
    assert.deepEqual(argumentsSeen, [[6500, 15000], [5750, 15000]]);
});

test('an in-flight probe exhausting the deadline reports its timeout without retrying', async () => {
    const timing = clock(100);
    await assert.rejects(waitForReplacement(expected, budget => {
        timing.pause(budget);
        throw Object.assign(new Error('synthetic command output'), { code: 'ETIMEDOUT' });
    }, () => ({}), timing), error => {
        assert.match(error.message, /^Docker readiness command timed out: /);
        assert.match(error.message, /"attempts":1/);
        assert.equal(error.cause.cause.code, 'ETIMEDOUT');
        return true;
    });
});

const nodeCommand = (source, { budget = 3000, args = [], ...options } = {}) =>
    runCommand(process.execPath, ['-e', source, ...args], { deadline: performance.now() + budget, ...options });

async function pidFile(t) {
    const directory = await mkdtemp(path.join(tmpdir(), 'sites-nginx-commands-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return path.join(directory, 'pid');
}

async function readPid(file) {
    const deadline = performance.now() + 1500;
    while (performance.now() < deadline) {
        try {
            const pid = Number(await readFile(file, 'utf8'));
            if (pid > 1) return pid;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        await delay(10);
    }
    assert.fail('Fixture did not record a child PID');
}

async function assertStopped(pid) {
    const deadline = performance.now() + 1500;
    while (performance.now() < deadline) {
        try {
            process.kill(pid, 0);
            // A zombie has exited and cannot keep descriptors open. PID 1
            // reaps an adopted descendant independently of the test process.
            if (process.platform === 'linux') {
                const state = await readFile('/proc/' + pid + '/stat', 'utf8');
                if (state.slice(state.lastIndexOf(')') + 2).startsWith('Z')) return;
            }
        } catch (error) {
            if (error.code === 'ESRCH' || error.code === 'ENOENT') return;
            throw error;
        }
        await delay(10);
    }
    assert.fail('Fixture process is still running: ' + pid);
}

const recordPid = 'require("node:fs").writeFileSync(process.argv[1], String(process.pid));';
const stall = 'process.on("SIGTERM", () => {}); ' + recordPid + ' setTimeout(() => process.exit(0), 5000);';

test('command passes input and returns trimmed stdout after a successful exit', async () => {
    assert.equal(await nodeCommand('process.stdin.pipe(process.stdout);', { input: '  fixture output\n' }), 'fixture output');
});

test('command reports nonzero exit without exposing captured output', async () => {
    await assert.rejects(nodeCommand('process.stderr.write("private sentinel"); process.exitCode = 7;'), error => {
        assert.equal(error.code, 'COMMAND_FAILED');
        assert.equal(error.status, 7);
        assert.doesNotMatch(error.message, /private sentinel/);
        return true;
    });
});

test('command reports a missing executable', async () => {
    await assert.rejects(runCommand('/nonexistent-nginx-gate-command', [], { deadline: performance.now() + 1000 }), { code: 'ENOENT' });
});

test('an already expired deadline prevents launch', async () => {
    await assert.rejects(runCommand('/nonexistent-nginx-gate-command', [], { deadline: performance.now() - 1 }), { code: 'ETIMEDOUT' });
});

test('consecutive stalls are forcibly terminated and the next command can run', async t => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const file = await pidFile(t);
        const started = performance.now();
        await assert.rejects(nodeCommand(stall, { budget: 650, args: [file] }), { code: 'ETIMEDOUT' });
        assert.ok(performance.now() - started < 1800, 'Command must return promptly even when TERM is ignored');
        await assertStopped(await readPid(file));
    }
    assert.equal(await nodeCommand('console.log("next command")'), 'next command');
});

test('aborting a running command preserves cancellation when it exits successfully on TERM', async t => {
    const file = await pidFile(t);
    const controller = new AbortController();
    const source = 'process.on("SIGTERM", () => {require("node:fs").appendFileSync(process.argv[1], "\\nTERM"); process.exit(0);}); ' +
        recordPid + ' setTimeout(() => process.exit(1), 5000);';
    const rejected = assert.rejects(nodeCommand(source, { args: [file], signal: controller.signal }), { code: 'ABORT_ERR' });
    const pid = await readPid(file);
    controller.abort();
    await rejected;
    await assertStopped(pid);
    assert.equal(await readFile(file, 'utf8'), pid + '\nTERM');
});

test('an exited launcher cannot leave a descendant holding output pipes', async t => {
    const file = await pidFile(t);
    const launcher = 'require("node:child_process").spawn(process.execPath, ["-e", process.argv[2], process.argv[1]], ' +
        '{stdio:["ignore",1,2]}).unref();';
    const started = performance.now();
    await assert.rejects(nodeCommand(launcher, { budget: 650, args: [file, stall] }), { code: 'ETIMEDOUT' });
    assert.ok(performance.now() - started < 1800, 'Inherited stdout/stderr must not keep the command pending');
    await assertStopped(await readPid(file));
});

for (const abort of [false, true]) {
    for (const inheritsOutput of [false, true]) {
        const cancellation = abort ? 'abort' : 'timeout';
        const output = inheritsOutput ? 'inherited output pipes' : 'no inherited output pipes';
        test(cancellation + ' stops a TERM-resistant descendant with ' + output, async t => {
            const childFile = await pidFile(t);
            const launcherFile = await pidFile(t);
            const witnessFile = await pidFile(t);
            const termMarker = 'require("node:fs").appendFileSync(process.argv[1], "\\nTERM");';
            const emergencyExit = 'setInterval(() => {if (require("node:fs").existsSync(process.argv[1] + ".stop")) ' +
                'process.exit(0);}, 20).unref(); setTimeout(() => process.exit(0), 5500);';
            const descendant = 'process.on("SIGTERM", () => {' + termMarker + '}); ' + recordPid + emergencyExit;
            const launcher = 'const { spawn } = require("node:child_process"); ' +
                'process.on("SIGTERM", () => {' + termMarker + 'process.exit(0);}); ' + recordPid +
                ' spawn(process.execPath, ["-e", process.argv[3], process.argv[2]], ' +
                '{stdio: ' + (inheritsOutput ? '["ignore",1,2]' : '"ignore"') + '}).unref(); ' + emergencyExit;
            const controller = new AbortController();
            const witnessController = new AbortController();
            const witness = 'process.on("SIGTERM", () => {' + termMarker + 'process.exit(1);}); ' + recordPid + emergencyExit;
            const witnessDone = nodeCommand(witness, { budget: 5000, args: [witnessFile], signal: witnessController.signal })
                .catch(error => error);
            let launcherDone;
            async function cleanFixture(file) {
                // Fixture-owned sentinel provides cleanup even with the old wrapper.
                await writeFile(file + '.stop', '');
                const recorded = await readFile(file, 'utf8').catch(error => {
                    if (error.code !== 'ENOENT') throw error;
                    return '';
                });
                const pid = Number(recorded.split('\n')[0]);
                if (Number.isInteger(pid) && pid > 1) await assertStopped(pid);
            }

            try {
                const witnessPid = await readPid(witnessFile);
                const budget = 1000;
                const started = performance.now();
                const rejected = assert.rejects(nodeCommand(launcher, {
                    budget, args: [launcherFile, childFile, descendant], signal: controller.signal
                }), { code: abort ? 'ABORT_ERR' : 'ETIMEDOUT' });
                // Attach immediately even if reading fixture evidence fails.
                launcherDone = rejected.catch(() => {});
                const [launcherPid, childPid] = await Promise.all([readPid(launcherFile), readPid(childFile)]);
                if (abort) controller.abort();
                await rejected;
                assert.ok(performance.now() - started < budget + 400, 'Cancellation exceeded its command budget');
                assert.equal(await readFile(launcherFile, 'utf8'), launcherPid + '\nTERM');
                assert.equal(await readFile(childFile, 'utf8'), childPid + '\nTERM');
                await assertStopped(launcherPid);
                await assertStopped(childPid);
                process.kill(witnessPid, 0);
                assert.equal(await readFile(witnessFile, 'utf8'), String(witnessPid));
                assert.equal(await nodeCommand('console.log("next command")'), 'next command');
            } finally {
                controller.abort();
                witnessController.abort();
                await Promise.all([witnessDone, launcherDone]);
                await cleanFixture(launcherFile);
                await cleanFixture(childFile);
                await cleanFixture(witnessFile);
            }
        });
    }
}

for (const stream of ['stdout', 'stderr']) {
    test('command enforces its ' + stream + ' byte limit', async () => {
        await assert.rejects(nodeCommand('process.' + stream + '.write("private sentinel".repeat(100));', { maxBuffer: 64 }),
            { code: 'ENOBUFS', message: 'Command exceeded the ' + stream + ' limit' });
    });
}

test('a stalled diagnostic preserves the original readiness assertion', async () => {
    const started = performance.now();
    await assert.rejects(waitForReplacement(expected, () => healthy({ instance: 'old' }), async () => {
        await nodeCommand('setTimeout(() => {}, 5000);', { budget: 400 });
        assert.fail('Expected a bounded diagnostic timeout');
    }), error => {
        assert.match(error.message, /^Readiness response came from an unexpected app instance: /);
        assert.match(error.message, /"diagnostics":"unavailable"/);
        assert.match(error.message, /"lastObservedUpstream":"192\.0\.2\.12:4000"/);
        assert.match(error.cause.message, /unexpected app instance/);
        return true;
    });
    assert.ok(performance.now() - started < 1500, 'Diagnostic timeout must not hide or stall the assertion');
});

test('a stalled cleanup preserves both its timeout and the primary assertion', async () => {
    const primary = new Error('primary assertion');
    const started = performance.now();
    await assert.rejects(withCleanup(() => { throw primary; }, () =>
        nodeCommand('setTimeout(() => {}, 5000);', { budget: 400 })), error => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.cause, primary);
        assert.equal(error.errors[0], primary);
        assert.equal(error.errors[1].code, 'ETIMEDOUT');
        return true;
    });
    assert.ok(performance.now() - started < 1500, 'Cleanup must return after its timeout');
});
