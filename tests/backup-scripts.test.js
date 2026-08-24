const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const containerScript = path.join(rootDir, 'scripts', 'backup.sh');
const hostScript = path.join(rootDir, 'scripts', 'backup-host.sh');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  });
}

function startAsync(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    ...options,
  });
  let stdout = '';
  let stderr = '';
  const result = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });

  return { child, result };
}

function runAsync(command, args, options = {}) {
  return startAsync(command, args, options).result;
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for test condition');
}

function makeTempDir(t, prefix) {
  const directory = fs.mkdtempSync(path.join(rootDir, `.tmp-${prefix}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createSyntheticData(baseDir) {
  const dataDir = path.join(baseDir, 'data');
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, 'synthetic.txt'), 'synthetic upload\n');

  const databasePath = path.join(dataDir, 'blog.db');
  const sqlite = run('sqlite3', [
    databasePath,
    'CREATE TABLE verification (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO verification (value) VALUES (\'synthetic\');',
  ]);
  assert.equal(sqlite.status, 0, sqlite.stderr);

  return dataDir;
}

function createFakeDocker(baseDir) {
  const fakeDocker = path.join(baseDir, 'docker');
  const script = `#!/bin/bash
set -eu

printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
command_name=$1
shift

if [ "$command_name" = exec ]; then
    while [ "\${1:-}" = -i ] || [ "\${1:-}" = -e ]; do
        if [ "$1" = -i ]; then
            shift
        else
            shift 2
        fi
    done

    container=$1
    shift
    operation=$1
    shift

    case "$operation" in
        mkdir)
            mkdir "$FAKE_DOCKER_ROOT$1"
            ;;
        bash)
            cat >/dev/null
            if [ -n "\${FAKE_DOCKER_DELAY_SECONDS:-}" ]; then
                sleep "$FAKE_DOCKER_DELAY_SECONDS"
            fi
            stage="$FAKE_DOCKER_ROOT$FAKE_CONTAINER_STAGE_DIR"
            printf 'synthetic database backup\\n' > "$stage/blog.db"
            tar -czf "$stage/uploads.tar.gz" -C "$FAKE_DOCKER_ROOT/source" uploads/
            ;;
        cksum)
            if [ "\${FAKE_DOCKER_BAD_CHECKSUM:-}" = uploads ] && [ "\${1##*/}" = uploads.tar.gz ]; then
                printf '0 0 %s\\n' "$1"
            else
                cksum "$FAKE_DOCKER_ROOT$1"
            fi
            ;;
        rm)
            [ "$1" = -f ]
            shift
            for target in "$@"; do
                rm -f "$FAKE_DOCKER_ROOT$target"
            done
            ;;
        rmdir)
            rmdir "$FAKE_DOCKER_ROOT$1"
            ;;
        *)
            printf 'unsupported fake docker exec operation: %s\\n' "$operation" >&2
            exit 90
            ;;
    esac
elif [ "$command_name" = cp ]; then
    source_path=$1
    destination=$2
    remote_path=\${source_path#*:}

    if [ "\${FAKE_DOCKER_FAIL_COPY:-}" = uploads ] && [ "\${remote_path##*/}" = uploads.tar.gz ]; then
        exit 44
    fi

    cp "$FAKE_DOCKER_ROOT$remote_path" "$destination"
else
    printf 'unsupported fake docker command: %s\\n' "$command_name" >&2
    exit 91
fi
`;

  fs.writeFileSync(fakeDocker, script, { mode: 0o755 });
  return fakeDocker;
}

function createHostHarness(t) {
  const baseDir = makeTempDir(t, 'backup-host-test');
  const containerRoot = path.join(baseDir, 'container');
  const sourceUploads = path.join(containerRoot, 'source', 'uploads');
  const hostRoot = path.join(baseDir, 'host storage');
  const dockerLog = path.join(baseDir, 'docker.log');
  const stageDir = '/tmp/blog-backup-staging';

  fs.mkdirSync(sourceUploads, { recursive: true });
  fs.mkdirSync(path.join(containerRoot, 'tmp'), { recursive: true });
  fs.mkdirSync(hostRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceUploads, 'synthetic.txt'), 'synthetic upload\n');
  fs.writeFileSync(dockerLog, '');

  const fakeDocker = createFakeDocker(baseDir);
  const env = {
    ...process.env,
    BACKUP_RUN_ID: 'test-run',
    BACKUP_RETENTION_DAYS: '28',
    BACKUP_SITES: 'ffg:ffg-blog-prod',
    CONTAINER_STAGE_DIR: stageDir,
    DOCKER_BIN: fakeDocker,
    FAKE_CONTAINER_STAGE_DIR: stageDir,
    FAKE_DOCKER_LOG: dockerLog,
    FAKE_DOCKER_ROOT: containerRoot,
    HOST_BACKUP_DIR: hostRoot,
  };

  return { baseDir, containerRoot, dockerLog, env, hostRoot, stageDir };
}

test('container backup creates exactly one verified set in explicit staging', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-container-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');

  const result = run('bash', [containerScript], {
    env: { ...process.env, BACKUP_DIR: stagingDir, DATA_DIR: dataDir },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /BACKUP_STAGE_READY/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['blog.db', 'uploads.tar.gz']);

  const integrity = run('sqlite3', ['-readonly', path.join(stagingDir, 'blog.db'), 'PRAGMA integrity_check;']);
  assert.equal(integrity.status, 0, integrity.stderr);
  assert.equal(integrity.stdout.trim(), 'ok');
  assert.equal(run('gzip', ['-t', path.join(stagingDir, 'uploads.tar.gz')]).status, 0);
});

test('container backup refuses non-empty staging instead of accumulating another set', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-container-bounded-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  fs.mkdirSync(stagingDir);
  fs.writeFileSync(path.join(stagingDir, 'prior-failure.marker'), 'preserve\n');

  const result = run('bash', [containerScript], {
    env: { ...process.env, BACKUP_DIR: stagingDir, DATA_DIR: dataDir },
  });

  assert.equal(result.status, 4);
  assert.match(result.stderr, /not empty/);
  assert.deepEqual(fs.readdirSync(stagingDir), ['prior-failure.marker']);
});

test('host orchestration transfers only the new set and retains it outside the container', (t) => {
  const harness = createHostHarness(t);
  const result = run('bash', [hostScript], { env: harness.env });

  assert.equal(result.status, 0, result.stderr);
  const finalSet = path.join(harness.hostRoot, 'ffg', 'backup-set-test-run');
  assert.deepEqual(fs.readdirSync(finalSet).sort(), ['blog.db', 'uploads.tar.gz']);
  assert.equal(fs.existsSync(path.join(harness.containerRoot, harness.stageDir)), false);

  const dockerLog = fs.readFileSync(harness.dockerLog, 'utf8');
  const copyLines = dockerLog.split('\n').filter((line) => line.startsWith('cp '));
  assert.equal(copyLines.length, 2);
  assert.match(copyLines[0], /\/tmp\/blog-backup-staging\/blog\.db/);
  assert.match(copyLines[1], /\/tmp\/blog-backup-staging\/uploads\.tar\.gz/);
  assert.doesNotMatch(dockerLog, /\/app\/backups/);
});

test('FFG and TTA use the same verified host-managed flow', (t) => {
  const harness = createHostHarness(t);
  const result = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_SITES: 'tta:tta-blog-prod ffg:ffg-blog-prod' },
  });

  assert.equal(result.status, 0, result.stderr);
  for (const site of ['tta', 'ffg']) {
    const finalSet = path.join(harness.hostRoot, site, 'backup-set-test-run');
    assert.deepEqual(fs.readdirSync(finalSet).sort(), ['blog.db', 'uploads.tar.gz']);
  }

  const dockerLog = fs.readFileSync(harness.dockerLog, 'utf8');
  assert.match(dockerLog, /exec -i -e BACKUP_DIR=\/tmp\/blog-backup-staging tta-blog-prod bash -s/);
  assert.match(dockerLog, /exec -i -e BACKUP_DIR=\/tmp\/blog-backup-staging ffg-blog-prod bash -s/);
});

test('unsafe path-like site input is rejected before Docker work', (t) => {
  const harness = createHostHarness(t);
  const result = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_SITES: '..:ffg-blog-prod' },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /dot path segments/);
  assert.equal(fs.readFileSync(harness.dockerLog, 'utf8'), '');
  assert.equal(fs.readdirSync(harness.hostRoot).length, 0);
});

test('host retention removes only expired managed sets and preserves legacy backups', (t) => {
  const harness = createHostHarness(t);
  const siteDir = path.join(harness.hostRoot, 'ffg');
  const expiredSet = path.join(siteDir, 'backup-set-expired');
  const currentSet = path.join(siteDir, 'backup-set-current');
  const legacySet = path.join(siteDir, 'container_backups_legacy');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

  for (const directory of [expiredSet, currentSet, legacySet]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'marker'), 'preserve test\n');
  }
  fs.utimesSync(expiredSet, oldTime, oldTime);
  fs.utimesSync(legacySet, oldTime, oldTime);

  const result = run('bash', [hostScript], { env: harness.env });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(expiredSet), false);
  assert.equal(fs.existsSync(currentSet), true);
  assert.equal(fs.existsSync(legacySet), true);
});

test('failed host copy preserves staging, skips retention, and blocks accumulation', (t) => {
  const harness = createHostHarness(t);
  const expiredSet = path.join(harness.hostRoot, 'ffg', 'backup-set-expired');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.mkdirSync(expiredSet, { recursive: true });
  fs.utimesSync(expiredSet, oldTime, oldTime);

  const failedEnv = { ...harness.env, FAKE_DOCKER_FAIL_COPY: 'uploads' };
  const first = run('bash', [hostScript], { env: failedEnv });

  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /Uploads transfer failed/);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', 'backup-set-test-run')), false);
  assert.equal(fs.existsSync(path.join(harness.containerRoot, harness.stageDir)), true);
  assert.equal(fs.existsSync(expiredSet), true);

  const dockerLogAfterFailure = fs.readFileSync(harness.dockerLog, 'utf8');
  assert.doesNotMatch(dockerLogAfterFailure, /exec ffg-blog-prod rm -f/);

  const retryEnv = { ...harness.env, BACKUP_RUN_ID: 'retry-run' };
  const second = run('bash', [hostScript], { env: retryEnv });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /prior failed run/);
});

test('global lock rejects overlapping and stale backup runs before Docker work', async (t) => {
  const harness = createHostHarness(t);
  const lockDir = path.join(harness.hostRoot, '.backup-run.lock');
  const firstPromise = runAsync('bash', [hostScript], {
    env: { ...harness.env, FAKE_DOCKER_DELAY_SECONDS: '1' },
  });

  await waitFor(() => fs.existsSync(lockDir));

  const overlapping = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_RUN_ID: 'overlap-run' },
  });
  assert.equal(overlapping.status, 7);
  assert.match(overlapping.stderr, /active or .* stale/);

  const first = await firstPromise;
  assert.equal(first.status, 0, first.stderr);
  assert.equal(fs.existsSync(lockDir), false);

  fs.mkdirSync(lockDir);
  const logBeforeStaleAttempt = fs.readFileSync(harness.dockerLog, 'utf8');
  const stale = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_RUN_ID: 'stale-lock-run' },
  });
  assert.equal(stale.status, 7);
  assert.match(stale.stderr, /active or .* stale/);
  assert.equal(fs.readFileSync(harness.dockerLog, 'utf8'), logBeforeStaleAttempt);
  assert.equal(fs.existsSync(lockDir), true);
});

test('SIGTERM releases the lock but preserves fail-closed staging', async (t) => {
  const harness = createHostHarness(t);
  const lockDir = path.join(harness.hostRoot, '.backup-run.lock');
  const containerStage = path.join(harness.containerRoot, harness.stageDir);
  const hostStage = path.join(harness.hostRoot, 'ffg', '.staging-backup-set-test-run');
  const finalSet = path.join(harness.hostRoot, 'ffg', 'backup-set-test-run');
  const running = startAsync('bash', [hostScript], {
    env: { ...harness.env, FAKE_DOCKER_DELAY_SECONDS: '1' },
  });

  await waitFor(() => fs.existsSync(lockDir) && fs.existsSync(containerStage));
  assert.equal(running.child.kill('SIGTERM'), true);

  const result = await running.result;
  assert.equal(result.status, 143, result.stderr);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /Backup interrupted/);
  assert.equal(fs.existsSync(lockDir), false);
  assert.equal(fs.existsSync(containerStage), true);
  assert.equal(fs.existsSync(hostStage), true);
  assert.equal(fs.existsSync(finalSet), false);

  const retry = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_RUN_ID: 'post-signal-run' },
  });
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /prior failed run/);
});

test('checksum mismatch prevents promotion and suppresses retention', (t) => {
  const harness = createHostHarness(t);
  const siteDir = path.join(harness.hostRoot, 'ffg');
  const expiredSet = path.join(siteDir, 'backup-set-expired');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.mkdirSync(expiredSet, { recursive: true });
  fs.utimesSync(expiredSet, oldTime, oldTime);

  const result = run('bash', [hostScript], {
    env: { ...harness.env, FAKE_DOCKER_BAD_CHECKSUM: 'uploads' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum verification failed/);
  assert.equal(fs.existsSync(path.join(siteDir, 'backup-set-test-run')), false);
  assert.equal(fs.existsSync(path.join(siteDir, '.staging-backup-set-test-run')), true);
  assert.equal(fs.existsSync(path.join(harness.containerRoot, harness.stageDir)), true);
  assert.equal(fs.existsSync(expiredSet), true);

  const dockerLog = fs.readFileSync(harness.dockerLog, 'utf8');
  assert.doesNotMatch(dockerLog, /exec ffg-blog-prod rm -f/);
});
