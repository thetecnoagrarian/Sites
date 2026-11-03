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

  return {
    child,
    result,
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
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

function createFakeSqlite(baseDir) {
  const binDir = path.join(baseDir, 'fake-sqlite-bin');
  const fakeSqlite = path.join(binDir, 'sqlite3');
  const attemptFile = path.join(baseDir, 'sqlite-backup-attempts');
  const realSqlite = run('which', ['sqlite3']).stdout.trim();
  assert.ok(realSqlite, 'sqlite3 CLI path is required for the fake wrapper');

  fs.mkdirSync(binDir);
  fs.writeFileSync(attemptFile, '0\n');
  fs.writeFileSync(fakeSqlite, `#!/bin/bash
set -eu

if printf '%s\\n' "$*" | grep -Fq '.backup '; then
    attempt=$(cat "$FAKE_SQLITE_ATTEMPT_FILE")
    attempt=$((attempt + 1))
    printf '%s\\n' "$attempt" > "$FAKE_SQLITE_ATTEMPT_FILE"

    if [ "$attempt" -le "\${FAKE_SQLITE_FAIL_ATTEMPTS:-0}" ]; then
        : > "$BACKUP_DIR/blog.db"
        printf '%s\\n' "\${FAKE_SQLITE_ERROR:-Error: database is locked}" >&2
        exit 1
    fi
fi

exec "$REAL_SQLITE" "$@"
`, { mode: 0o755 });

  return {
    attemptFile,
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      REAL_SQLITE: realSqlite,
      FAKE_SQLITE_ATTEMPT_FILE: attemptFile,
    },
  };
}

async function startExclusiveWriteLock(t, databasePath) {
  const running = startAsync('sqlite3', [databasePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let released = false;

  running.child.stdin.write("BEGIN EXCLUSIVE;\nUPDATE verification SET value = 'locked';\n.print LOCK_HELD\n");
  await waitFor(() => running.getStdout().includes('LOCK_HELD'));

  const release = async () => {
    if (released) return;
    released = true;
    running.child.stdin.write('ROLLBACK;\n.quit\n');
    running.child.stdin.end();
    const result = await running.result;
    assert.equal(result.status, 0, result.stderr);
  };

  t.after(async () => {
    if (!released) {
      running.child.kill('SIGKILL');
      await running.result;
    }
  });

  return { release };
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
    container_root="$FAKE_DOCKER_ROOT/$container"

    case "$operation" in
        mkdir)
            mkdir "$container_root$1"
            ;;
        bash)
            cat >/dev/null
            stage="$container_root$FAKE_CONTAINER_STAGE_DIR"
            if [ -n "\${FAKE_DOCKER_DELAY_SECONDS:-}" ]; then
                sleep "$FAKE_DOCKER_DELAY_SECONDS"
            fi

            failure_container=\${FAKE_DOCKER_BACKUP_FAILURE_CONTAINER:-$container}
            if [ "$container" = "$failure_container" ] && [ "\${FAKE_DOCKER_BACKUP_FAILURE:-}" = locked ]; then
                : > "$stage/blog.db"
                printf 'Error: database is locked\n' >&2
                exit 45
            fi

            if [ "$container" = "$failure_container" ] && [ "\${FAKE_DOCKER_BACKUP_FAILURE:-}" = nonlock ]; then
                printf 'Error: disk I/O error\n' >&2
                exit 46
            fi

            printf 'synthetic database backup\\n' > "$stage/blog.db"
            if [ "\${FAKE_DOCKER_INVALID_ARCHIVE:-}" = 1 ]; then
                printf 'not a gzip archive\\n' > "$stage/uploads.tar.gz"
            else
                tar -czf "$stage/uploads.tar.gz" -C "$container_root/source" uploads/
            fi
            ;;
        cksum)
            if [ "\${FAKE_DOCKER_BAD_CHECKSUM:-}" = uploads ] && [ "\${1##*/}" = uploads.tar.gz ]; then
                printf '0 0 %s\\n' "$1"
            else
                cksum "$container_root$1"
            fi
            ;;
        rm)
            [ "$1" = -f ]
            shift
            for target in "$@"; do
                rm -f "$container_root$target"
            done
            ;;
        rmdir)
            rmdir "$container_root$1"
            ;;
        *)
            printf 'unsupported fake docker exec operation: %s\\n' "$operation" >&2
            exit 90
            ;;
    esac
elif [ "$command_name" = cp ]; then
    source_path=$1
    destination=$2
    container=\${source_path%%:*}
    remote_path=\${source_path#*:}
    container_root="$FAKE_DOCKER_ROOT/$container"

    if [ "\${FAKE_DOCKER_FAIL_COPY:-}" = uploads ] && [ "\${remote_path##*/}" = uploads.tar.gz ]; then
        exit 44
    fi

    cp "$container_root$remote_path" "$destination"
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
  const hostRoot = path.join(baseDir, 'host storage');
  const dockerLog = path.join(baseDir, 'docker.log');
  const stageDir = '/tmp/blog-backup-staging';

  for (const container of ['ffg-blog-prod', 'tta-blog-prod']) {
    const sourceUploads = path.join(containerRoot, container, 'source', 'uploads');
    fs.mkdirSync(sourceUploads, { recursive: true });
    fs.mkdirSync(path.join(containerRoot, container, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(sourceUploads, 'synthetic.txt'), `synthetic upload for ${container}\n`);
  }
  fs.mkdirSync(hostRoot, { recursive: true });
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

  const containerStage = (container = 'ffg-blog-prod') => path.join(containerRoot, container, stageDir);
  return { baseDir, containerRoot, containerStage, dockerLog, env, hostRoot, stageDir };
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

test('container backup rejects timeout and backoff values outside bounded ranges', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-config-bounds-test');
  const dataDir = createSyntheticData(baseDir);
  const invalidConfigurations = [
    { BACKUP_SQLITE_BUSY_TIMEOUT_MS: '0' },
    { BACKUP_SQLITE_BUSY_TIMEOUT_MS: '-1' },
    { BACKUP_SQLITE_BUSY_TIMEOUT_MS: '30001' },
    { BACKUP_SQLITE_BUSY_TIMEOUT_MS: 'not-a-number' },
    { BACKUP_SQLITE_RETRY_DELAY_SECONDS: '3' },
    { BACKUP_SQLITE_RETRY_DELAY_SECONDS: '-1' },
  ];

  invalidConfigurations.forEach((configuration, index) => {
    const stagingDir = path.join(baseDir, `staging-${index}`);
    const result = run('bash', [containerScript], {
      env: {
        ...process.env,
        BACKUP_DIR: stagingDir,
        DATA_DIR: dataDir,
        ...configuration,
      },
    });

    assert.equal(result.status, 2, `configuration should fail: ${JSON.stringify(configuration)}`);
    assert.equal(fs.existsSync(stagingDir), false);
  });
});

test('container backup retries one busy failure and succeeds on attempt two', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-retry-once-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  const fakeSqlite = createFakeSqlite(baseDir);
  const result = run('bash', [containerScript], {
    env: {
      ...process.env,
      ...fakeSqlite.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      FAKE_SQLITE_FAIL_ATTEMPTS: '1',
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '25',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(fakeSqlite.attemptFile, 'utf8').trim(), '2');
  assert.match(result.stderr, /attempt 1\/3 failed because the database was busy or locked/);
  assert.match(result.stdout, /attempt 2\/3 succeeded/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['blog.db', 'uploads.tar.gz']);
});

test('container backup retries two busy failures and succeeds on attempt three', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-retry-twice-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  const fakeSqlite = createFakeSqlite(baseDir);
  const result = run('bash', [containerScript], {
    env: {
      ...process.env,
      ...fakeSqlite.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      FAKE_SQLITE_FAIL_ATTEMPTS: '2',
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '25',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(fakeSqlite.attemptFile, 'utf8').trim(), '3');
  assert.match(result.stderr, /attempt 2\/3 failed because the database was busy or locked/);
  assert.match(result.stdout, /attempt 3\/3 succeeded/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['blog.db', 'uploads.tar.gz']);
});

test('container backup preserves final busy failure evidence after three attempts', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-retry-exhausted-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  const fakeSqlite = createFakeSqlite(baseDir);
  const result = run('bash', [containerScript], {
    env: {
      ...process.env,
      ...fakeSqlite.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      FAKE_SQLITE_FAIL_ATTEMPTS: '3',
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '25',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  assert.equal(result.status, 5);
  assert.equal(fs.readFileSync(fakeSqlite.attemptFile, 'utf8').trim(), '3');
  assert.match(result.stderr, /retry budget exhausted and staging was preserved/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['.sqlite-backup-error.log', 'blog.db']);
  assert.equal(fs.statSync(path.join(stagingDir, 'blog.db')).size, 0);
  assert.match(fs.readFileSync(path.join(stagingDir, '.sqlite-backup-error.log'), 'utf8'), /database is locked/);
});

test('container backup does not retry non-lock SQLite failures', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-nonretryable-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  const fakeSqlite = createFakeSqlite(baseDir);
  const result = run('bash', [containerScript], {
    env: {
      ...process.env,
      ...fakeSqlite.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      FAKE_SQLITE_FAIL_ATTEMPTS: '3',
      FAKE_SQLITE_ERROR: 'Error: disk I/O error',
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '25',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  assert.equal(result.status, 5);
  assert.equal(fs.readFileSync(fakeSqlite.attemptFile, 'utf8').trim(), '1');
  assert.match(result.stderr, /non-retryable SQLite error/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['.sqlite-backup-error.log', 'blog.db']);
});

test('container backup does not treat arbitrary locked wording as SQLite lock contention', (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-nonlock-wording-test');
  const dataDir = createSyntheticData(baseDir);
  const stagingDir = path.join(baseDir, 'staging');
  const fakeSqlite = createFakeSqlite(baseDir);
  const result = run('bash', [containerScript], {
    env: {
      ...process.env,
      ...fakeSqlite.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      FAKE_SQLITE_FAIL_ATTEMPTS: '3',
      FAKE_SQLITE_ERROR: 'Error: output destination locked by policy',
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '25',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  assert.equal(result.status, 5);
  assert.equal(fs.readFileSync(fakeSqlite.attemptFile, 'utf8').trim(), '1');
  assert.match(result.stderr, /non-retryable SQLite error/);
});

test('SQLite busy timeout waits for a short real write lock and then succeeds', async (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-real-short-lock-test');
  const dataDir = createSyntheticData(baseDir);
  const databasePath = path.join(dataDir, 'blog.db');
  const stagingDir = path.join(baseDir, 'staging');
  const lock = await startExclusiveWriteLock(t, databasePath);
  const startedAt = Date.now();
  const backup = startAsync('bash', [containerScript], {
    env: {
      ...process.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '1000',
      BACKUP_SQLITE_BACKUP_ATTEMPTS: '1',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });

  await waitFor(() => backup.getStdout().includes('attempt 1/1'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await lock.release();
  const result = await backup.result;
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.status, 0, result.stderr);
  assert.ok(elapsedMs >= 75, `backup returned too early after ${elapsedMs}ms`);
  assert.ok(elapsedMs < 2000, `backup exceeded the bounded timeout at ${elapsedMs}ms`);
  assert.match(result.stdout, /busy timeout 1000ms/);
  assert.deepEqual(fs.readdirSync(stagingDir).sort(), ['blog.db', 'uploads.tar.gz']);
});

test('real write lock beyond the retry budget preserves final staging evidence', async (t) => {
  if (run('sqlite3', ['--version']).status !== 0) {
    t.skip('sqlite3 CLI is unavailable');
    return;
  }

  const baseDir = makeTempDir(t, 'backup-real-long-lock-test');
  const dataDir = createSyntheticData(baseDir);
  const databasePath = path.join(dataDir, 'blog.db');
  const stagingDir = path.join(baseDir, 'staging');
  const lock = await startExclusiveWriteLock(t, databasePath);
  const result = await runAsync('bash', [containerScript], {
    env: {
      ...process.env,
      BACKUP_DIR: stagingDir,
      DATA_DIR: dataDir,
      BACKUP_SQLITE_BUSY_TIMEOUT_MS: '75',
      BACKUP_SQLITE_BACKUP_ATTEMPTS: '3',
      BACKUP_SQLITE_RETRY_DELAY_SECONDS: '0',
    },
  });
  await lock.release();

  assert.equal(result.status, 5);
  assert.match(result.stderr, /attempt 3\/3 failed because the database was busy or locked/);
  assert.match(result.stderr, /retry budget exhausted/);
  assert.equal(fs.existsSync(path.join(stagingDir, '.sqlite-backup-error.log')), true);
  assert.equal(fs.existsSync(path.join(stagingDir, 'uploads.tar.gz')), false);
});

test('host orchestration transfers only the new set and retains it outside the container', (t) => {
  const harness = createHostHarness(t);
  const result = run('bash', [hostScript], { env: harness.env });

  assert.equal(result.status, 0, result.stderr);
  const finalSet = path.join(harness.hostRoot, 'ffg', 'backup-set-test-run');
  assert.deepEqual(fs.readdirSync(finalSet).sort(), ['blog.db', 'uploads.tar.gz']);
  assert.equal(fs.existsSync(harness.containerStage()), false);

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

test('host retention removes only expired timestamp-only scheduled sets', (t) => {
  const harness = createHostHarness(t);
  const siteDir = path.join(harness.hostRoot, 'ffg');
  const expiredSet = path.join(siteDir, 'backup-set-2026-10-18_02-00-01');
  const currentSet = path.join(siteDir, 'backup-set-2026-11-01_02-00-01');
  const protectedSets = [
    'backup-set-tta-migration-2026-09-23_07-47-40',
    'backup-set-tta-authorship-backfill-2026-09-25_07-30-40',
    'backup-set-ffg3-publication-2026-09-29',
    'backup-set-2026-11-03_11-36-tta-recovery',
    'backup-set-2026-11-01_02-00-01-extra',
    'backup-set-2026-11-01',
    'backup-set-foo',
    'backup-set-',
    'backup-set-2026-99-99_99-99-99',
    'backup-set-2026-02-30_02-00-01',
    'container_backups_legacy',
  ].map((name) => path.join(siteDir, name));
  const externalTarget = path.join(harness.baseDir, 'external-retention-target');
  const scheduledNameSymlink = path.join(siteDir, 'backup-set-2026-10-19_02-00-01');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

  for (const directory of [expiredSet, currentSet, ...protectedSets]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'marker'), 'preserve test\n');
  }
  for (const directory of [expiredSet, ...protectedSets]) {
    fs.utimesSync(directory, oldTime, oldTime);
  }
  fs.mkdirSync(externalTarget);
  fs.writeFileSync(path.join(externalTarget, 'outside-marker'), 'must remain\n');
  fs.symlinkSync(externalTarget, scheduledNameSymlink, 'dir');
  fs.lutimesSync(scheduledNameSymlink, oldTime, oldTime);

  const result = run('bash', [hostScript], { env: harness.env });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(expiredSet), false);
  assert.equal(fs.existsSync(currentSet), true);
  for (const protectedSet of protectedSets) {
    assert.equal(fs.existsSync(protectedSet), true, `${path.basename(protectedSet)} must be preserved`);
  }
  assert.equal(fs.lstatSync(scheduledNameSymlink).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(externalTarget, 'outside-marker')), true);
});

test('failed host copy preserves staging, skips retention, and blocks accumulation', (t) => {
  const harness = createHostHarness(t);
  const expiredSet = path.join(harness.hostRoot, 'ffg', 'backup-set-2026-01-01_00-00-00');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.mkdirSync(expiredSet, { recursive: true });
  fs.utimesSync(expiredSet, oldTime, oldTime);

  const failedEnv = { ...harness.env, FAKE_DOCKER_FAIL_COPY: 'uploads' };
  const first = run('bash', [hostScript], { env: failedEnv });

  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /Uploads transfer failed/);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', 'backup-set-test-run')), false);
  assert.equal(fs.existsSync(harness.containerStage()), true);
  assert.equal(fs.existsSync(expiredSet), true);
  const failureMarker = path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE');
  assert.equal(fs.existsSync(failureMarker), true);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /summary=uploads_transfer_failed/);
  assert.match(first.stdout, /BACKUP_FAILURE_MARKER\|site=ffg/);

  const dockerLogAfterFailure = fs.readFileSync(harness.dockerLog, 'utf8');
  assert.doesNotMatch(dockerLogAfterFailure, /exec ffg-blog-prod rm -f/);

  const retryEnv = { ...harness.env, BACKUP_RUN_ID: 'retry-run' };
  const second = run('bash', [hostScript], { env: retryEnv });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /prior failed run/);
  const refreshedMarker = fs.readFileSync(failureMarker, 'utf8');
  assert.match(refreshedMarker, /run_id=retry-run/);
  assert.match(refreshedMarker, /summary=container_staging_unavailable/);
  assert.equal(fs.readdirSync(path.dirname(failureMarker)).some((name) => name.startsWith('.BACKUP_FAILURE.tmp.')), false);
});

test('invalid uploads archive preserves staging and creates a stage-specific marker', (t) => {
  const harness = createHostHarness(t);
  const result = run('bash', [hostScript], {
    env: { ...harness.env, FAKE_DOCKER_INVALID_ARCHIVE: '1' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /uploads archive failed verification/);
  assert.equal(fs.existsSync(harness.containerStage()), true);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', '.staging-backup-set-test-run')), true);
  const marker = fs.readFileSync(path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE'), 'utf8');
  assert.match(marker, /summary=uploads_archive_verification_failed/);
});

test('one-site failure marker persists through failure and clears after verified recovery', (t) => {
  const harness = createHostHarness(t);
  const siteDir = path.join(harness.hostRoot, 'tta');
  const expiredScheduled = path.join(siteDir, 'backup-set-2026-01-01_00-00-00');
  const protectedAnchor = path.join(siteDir, 'backup-set-tta-migration-2026-01-01_00-00-00');
  const ffgMarker = path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE');
  const existingFfgMarker = 'status=failed\nsite=ffg\nrun_id=older-ffg-run\n';
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

  for (const directory of [expiredScheduled, protectedAnchor]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'marker'), 'retention fixture\n');
    fs.utimesSync(directory, oldTime, oldTime);
  }
  fs.mkdirSync(path.dirname(ffgMarker), { recursive: true });
  fs.writeFileSync(ffgMarker, existingFfgMarker, { mode: 0o600 });

  const failed = run('bash', [hostScript], {
    env: {
      ...harness.env,
      BACKUP_SITES: 'tta:tta-blog-prod',
      FAKE_DOCKER_BACKUP_FAILURE: 'locked',
    },
  });
  const failureMarker = path.join(siteDir, 'BACKUP_FAILURE');
  const containerStage = harness.containerStage('tta-blog-prod');
  const hostStage = path.join(siteDir, '.staging-backup-set-test-run');

  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Container backup creation failed/);
  assert.match(failed.stderr, /host retention was skipped/);
  assert.equal(fs.existsSync(containerStage), true);
  assert.equal(fs.existsSync(hostStage), true);
  assert.equal(fs.existsSync(expiredScheduled), true);
  assert.equal(fs.existsSync(protectedAnchor), true);
  assert.equal(fs.existsSync(failureMarker), true);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /site=tta/);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /run_id=test-run/);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /failed_at_utc=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /summary=container_backup_creation_failed/);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /operator_action=inspect_logs_and_preserved_staging/);
  assert.equal(fs.statSync(failureMarker).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(siteDir).some((name) => name.startsWith('.BACKUP_FAILURE.tmp.')), false);
  assert.match(failed.stdout, /BACKUP_FAILURE_MARKER\|site=tta/);
  assert.equal(fs.readFileSync(ffgMarker, 'utf8'), existingFfgMarker);

  fs.rmSync(containerStage, { recursive: true });
  fs.rmSync(hostStage, { recursive: true });

  const recovered = run('bash', [hostScript], {
    env: {
      ...harness.env,
      BACKUP_RUN_ID: 'recovery-run',
      BACKUP_SITES: 'tta:tta-blog-prod',
    },
  });

  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(fs.existsSync(path.join(siteDir, 'backup-set-recovery-run')), true);
  assert.equal(fs.existsSync(failureMarker), false);
  assert.match(recovered.stdout, /BACKUP_FAILURE_CLEARED\|site=tta/);
  assert.equal(fs.existsSync(expiredScheduled), false);
  assert.equal(fs.existsSync(protectedAnchor), true);
  assert.equal(fs.readFileSync(ffgMarker, 'utf8'), existingFfgMarker);
});

test('TTA failure does not block FFG completion or permit global retention', (t) => {
  const harness = createHostHarness(t);
  const expiredFfgSet = path.join(harness.hostRoot, 'ffg', 'backup-set-2026-01-01_00-00-00');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.mkdirSync(expiredFfgSet, { recursive: true });
  fs.utimesSync(expiredFfgSet, oldTime, oldTime);

  const result = run('bash', [hostScript], {
    env: {
      ...harness.env,
      BACKUP_SITES: 'tta:tta-blog-prod ffg:ffg-blog-prod',
      FAKE_DOCKER_BACKUP_FAILURE: 'locked',
      FAKE_DOCKER_BACKUP_FAILURE_CONTAINER: 'tta-blog-prod',
    },
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', 'backup-set-test-run')), true);
  assert.equal(fs.existsSync(expiredFfgSet), true, 'retention must be skipped after any site failure');
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'tta', 'backup-set-test-run')), false);
  const ttaMarker = path.join(harness.hostRoot, 'tta', 'BACKUP_FAILURE');
  assert.equal(fs.existsSync(ttaMarker), true);
  assert.match(fs.readFileSync(ttaMarker, 'utf8'), /summary=container_backup_creation_failed/);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE')), false);
});

test('FFG failure does not block TTA completion or permit global retention', (t) => {
  const harness = createHostHarness(t);
  const expiredTtaSet = path.join(harness.hostRoot, 'tta', 'backup-set-2026-01-01_00-00-00');
  const oldTime = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.mkdirSync(expiredTtaSet, { recursive: true });
  fs.utimesSync(expiredTtaSet, oldTime, oldTime);

  const result = run('bash', [hostScript], {
    env: {
      ...harness.env,
      BACKUP_SITES: 'ffg:ffg-blog-prod tta:tta-blog-prod',
      FAKE_DOCKER_BACKUP_FAILURE: 'locked',
      FAKE_DOCKER_BACKUP_FAILURE_CONTAINER: 'ffg-blog-prod',
    },
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'tta', 'backup-set-test-run')), true);
  assert.equal(fs.existsSync(expiredTtaSet), true, 'retention must be skipped after any site failure');
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'ffg', 'backup-set-test-run')), false);
  const ffgMarker = path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE');
  assert.equal(fs.existsSync(ffgMarker), true);
  assert.match(fs.readFileSync(ffgMarker, 'utf8'), /summary=container_backup_creation_failed/);
  assert.equal(fs.existsSync(path.join(harness.hostRoot, 'tta', 'BACKUP_FAILURE')), false);
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
  const containerStage = harness.containerStage();
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
  const failureMarker = path.join(harness.hostRoot, 'ffg', 'BACKUP_FAILURE');
  assert.equal(fs.existsSync(failureMarker), true);
  assert.match(fs.readFileSync(failureMarker, 'utf8'), /summary=backup_interrupted/);

  const retry = run('bash', [hostScript], {
    env: { ...harness.env, BACKUP_RUN_ID: 'post-signal-run' },
  });
  assert.notEqual(retry.status, 0);
  assert.match(retry.stderr, /prior failed run/);
});

test('checksum mismatch prevents promotion and suppresses retention', (t) => {
  const harness = createHostHarness(t);
  const siteDir = path.join(harness.hostRoot, 'ffg');
  const expiredSet = path.join(siteDir, 'backup-set-2026-01-01_00-00-00');
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
  assert.equal(fs.existsSync(harness.containerStage()), true);
  assert.equal(fs.existsSync(expiredSet), true);

  const dockerLog = fs.readFileSync(harness.dockerLog, 'utf8');
  assert.doesNotMatch(dockerLog, /exec ffg-blog-prod rm -f/);
});
