#!/usr/bin/env bash
set -euo pipefail
umask 077

historical_sha=b50a41f02aeda58d36798997ff8bd2f9fe56a018
here=$(cd -- "$(dirname -- "$0")" && pwd -P)
fixture="$here/fixtures/native-recovery-site.mjs"
host_check="$here/fixtures/native-recovery-host.py"

fail() { printf 'Recovery rehearsal: %s\n' "$*" >&2; exit 1; }

verify_database() (
    local capture
    capture=$(mktemp -d "${TMPDIR:-/tmp}/recovery-sqlite-output.XXXXXX") || return 1
    trap 'rm -rf -- "$capture"' EXIT
    printf 'ok\n' > "$capture/expected" || return 1

    if ! sqlite3 -batch -bail -init /dev/null -readonly "$1" 'PRAGMA integrity_check;' \
        > "$capture/stdout" 2> "$capture/stderr"; then
        printf 'SQLite integrity command failed.\n' >&2
        head -c 4096 "$capture/stderr" >&2
        return 21
    fi
    if ! cmp -s "$capture/stdout" "$capture/expected"; then
        printf 'SQLite integrity output was not exactly ok.\n' >&2
        return 22
    fi
    if ! sqlite3 -batch -bail -init /dev/null -readonly "$1" 'PRAGMA foreign_key_check;' \
        > "$capture/stdout" 2> "$capture/stderr"; then
        printf 'SQLite foreign-key command failed.\n' >&2
        head -c 4096 "$capture/stderr" >&2
        return 23
    fi
    if ! cmp -s "$capture/stdout" /dev/null; then
        printf 'SQLite foreign-key check returned rows or unexpected output.\n' >&2
        return 24
    fi
)

database_self_test() (
    set -e
    local directory actual
    directory=$(mktemp -d "${TMPDIR:-/tmp}/recovery-fk.XXXXXX")
    trap 'rm -rf -- "$directory"' EXIT
    local schema='CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id));'
    sqlite3 -batch -bail -init /dev/null "$directory/valid.db" "$schema"
    sqlite3 -batch -bail -init /dev/null "$directory/violations.db" "PRAGMA foreign_keys=OFF; $schema INSERT INTO child VALUES(42);"
    sqlite3 -batch -bail -init /dev/null "$directory/fk-error.db" 'CREATE TABLE parent(id INTEGER); CREATE TABLE child(parent_id REFERENCES parent(id));'
    printf '%s\n' 'synthetic corrupt database' > "$directory/corrupt.db"

    expect_database() {
        local expected=$1
        actual=0
        verify_database "$directory/$2" || actual=$?
        [[ "$actual" == "$expected" ]] || {
            printf 'Synthetic database control %s expected %s, got %s.\n' "$2" "$expected" "$actual" >&2
            return 1
        }
    }
    expect_database 0 valid.db
    expect_database 24 violations.db
    expect_database 23 fk-error.db
    expect_database 21 missing.db
    expect_database 21 corrupt.db
    # Exercise the real output/status assertions with deterministic fake output.
    (
        sqlite3() { printf '%s\n' unexpected; }
        expect_database 22 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '%s\n' unexpected; fi
        }
        expect_database 24 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '\n'; fi
        }
        expect_database 24 valid.db
    )
    (
        sqlite3() { printf 'ok\n\n'; }
        expect_database 22 valid.db
    )
    (
        sqlite3() { printf 'ok\n\000'; }
        expect_database 22 valid.db
    )
    (
        sqlite3() {
            if [[ "$*" == *integrity_check* ]]; then printf '%s\n' ok
            else printf '\000'; fi
        }
        expect_database 24 valid.db
    )
    printf 'SQLite controls passed: 1 clean database and 10 expected rejections.\n'
)

one_writer() {
    local container=$1 volume=$2 site=$3 stage=$4
    local format='{{.Id}} {{.State.Running}} {{.State.Pid}}'
    local state_pattern='^([0-9a-f]{64}) (true|false) ([^[:space:]]+)$'
    local before after id running pid after_id
    local running_after=unknown pid_after=unknown pid_changed=unknown after_state=docker-inspect-after-failed
    local expected report census_matches=no census_status=0 census_reason=none
    local stdout_file="$scratch/writer-census.stdout"
    local stderr_file="$scratch/writer-census.stderr" stderr_present=no
    local context="site=$site stage=$stage expected=one-app-pid-O_RDWR-row"

    if ! before=$(docker inspect --format "$format" "$container" 2>/dev/null); then
        fail "writer census $context classification=docker-inspect-before-failed census-exit=not-run"
    fi
    [[ "$before" =~ $state_pattern ]] ||
        fail "writer census $context classification=invalid-docker-inspect-output census-exit=not-run"
    read -r id running pid <<< "$before"
    context+=" container=$id running-before=$running"
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] ||
        fail "writer census $context expected-pid=invalid classification=invalid-docker-pid census-exit=not-run"
    context+=" expected-pid=$pid"
    [[ "$running" == true ]] ||
        fail "writer census $context classification=container-not-running-before census-exit=not-run"
    expected="[[$pid, 2]]"

    (
        if { exec 3>"$stderr_file"; } 2>/dev/null; then
            census "$volume" writer-census 2>&3 3>&-
        else
            census "$volume" writer-census 2>/dev/null
        fi
    ) >"$stdout_file" || census_status=$?
    if after=$(docker inspect --format "$format" "$container" 2>/dev/null); then
        after_state=invalid-docker-inspect-output
        if [[ "$after" =~ $state_pattern ]]; then
            read -r after_id running_after pid_after <<< "$after"
            if [[ "$pid_after" =~ ^[0-9]+$ ]]; then
                pid_changed=no
                [[ "$pid_after" == "$pid" ]] || pid_changed=yes
                after_state=unchanged
                if [[ "$after_id" != "$id" ]]; then after_state=container-id-changed
                elif [[ "$running_after" != true ]]; then after_state=container-not-running-after
                elif [[ "$pid_after" == 0 ]]; then after_state=invalid-docker-pid-after
                elif [[ "$pid_changed" == yes ]]; then after_state=application-pid-changed
                fi
            else
                pid_after=invalid
                after_state=invalid-docker-pid-after
            fi
        fi
    fi

    if [[ "$census_status" == 0 ]] && printf '%s\n' "$expected" | cmp -s "$stdout_file" -; then
        census_matches=yes
    fi
    if [[ "$census_matches" == yes && "$after_state" == unchanged ]]; then
        printf 'Writer census passed: %s census-exit=0 running-after=true pid-after=%s pid-changed=no observed=%s\n' \
            "$context" "$pid_after" "$expected" || :
        return 0
    fi

    [[ ! -s "$stderr_file" ]] || stderr_present=yes
    context+=" census-exit=$census_status census-stderr=$stderr_present"
    context+=" running-after=$running_after pid-after=$pid_after pid-changed=$pid_changed"
    if [[ "$census_status" == 0 ]]; then
        [[ "$census_matches" == yes ]] || census_reason=unexpected-normalized-census
        if report=$(python3 "$host_check" writer-report "$stderr_file" "$pid" 2>/dev/null <"$stdout_file"); then
            printf '%s\n' "$report" >&2
        else
            printf 'diagnostic report unavailable\n' >&2
        fi
    elif [[ "$census_status" == 2 ]] && grep -Fxq 'incomplete-process-enumeration' "$stderr_file" 2>/dev/null; then
        census_reason=incomplete-process-enumeration
        context+=" observed=unavailable"
    else
        census_reason=census-process-failure
        context+=" observed=unavailable"
    fi
    fail "writer census $context census-classification=$census_reason container-classification=$after_state"
}

writer_self_test() (
    scratch=$(mktemp -d "${TMPDIR:-/tmp}/recovery-writer.XXXXXX")
    trap 'rm -rf -- "$scratch"' EXIT
    local id mock_before mock_after normal extra_output=no test_group=original site=ffg stage=pre-publication-startup
    printf -v id '%064d' 1
    normal="$id true 321"
    mock_before=$normal
    mock_after=$normal

    docker() {
        local snapshot=$mock_before
        [[ ! -s "$scratch/inspected" ]] || snapshot=$mock_after
        printf '1\n' > "$scratch/inspected"
        if [[ "$snapshot" == inspect-error ]]; then
            printf 'private-path-sentinel\n' >&2
            return 7
        fi
        printf '%s\n' "$snapshot"
    }

    census() {
        [[ "$1/$2" == synthetic/writer-census ]] || return 18
        python3 -c 'import json, runpy, sys
rows = json.loads(sys.argv[2])
if sys.argv[3] in ("valid", "unreadable", "unwritable"):
    runpy.run_path(sys.argv[1])["emit_writer_census"](rows)
else:
    print(json.dumps([(pid, access) for pid, access, _ in rows]))' "$host_check" "$rows" "$mock_report" || return "$?"
        case "$mock_report" in
            malformed) printf '{private-path-sentinel}\n' >&2 ;;
            unexpected) printf '["private-path-sentinel"]\n' >&2 ;;
            unreadable)
                rm -- "$scratch/writer-census.stderr"
                mkdir -- "$scratch/writer-census.stderr"
                ;;
        esac
        [[ "$mock_status" != 2 ]] || printf 'incomplete-process-enumeration\n' >&2
        [[ "$extra_output" == no ]] || printf 'private-path-sentinel\n'
        return "$mock_status"
    }

    check() {
        local expected_status=$1 message=$2 rows=$3 mock_status=${4:-0} mock_report=${5:-valid}
        local result status=0
        : > "$scratch/inspected"
        if [[ -d "$scratch/writer-census.stderr" ]]; then
            rmdir -- "$scratch/writer-census.stderr"
        fi
        if [[ "$mock_report" == unwritable ]]; then
            rm -f -- "$scratch/writer-census.stderr"
            mkdir -- "$scratch/writer-census.stderr"
        fi
        result=$(one_writer synthetic synthetic "$site" "$stage" 2>&1) || status=$?
        [[ "$status" == "$expected_status" && "$result" == *"site=$site stage=$stage"* &&
            "$result" == *"$message"* && "$result" != *private-path-sentinel* ]] ||
            fail "writer self-test expected $message in $site $stage (status $status): $result"
        printf 'Writer diagnostic control passed: %s %s %s %s\n' "$test_group" "$site" "$stage" "$message"
    }

    local exact='[[321, 2, "database"]]'
    check 0 'observed=[[321, 2]]' "$exact"
    check 1 zero-relevant-descriptors '[]'
    check 1 unexpected-process-identity '[[654, 2, "database"]]'
    check 1 unexpected-access-mode '[[321, 0, "database"]]'
    check 1 multiple-writer-processes '[[321, 2, "database"], [654, 2, "database"]]'
    check 1 unexpected-descriptor-count-or-grouping '[[321, 2, "database"], [321, 2, "wal"]]'
    check 1 '"omitted":1' '[[321,2,"database"],
        [321,0,"uploads"],[321,0,"uploads"],[321,0,"uploads"],[321,0,"uploads"],
        [321,0,"uploads"],[321,0,"uploads"],[321,0,"uploads"],[321,0,"uploads"]]'
    local stable='census-stderr=yes running-after=true pid-after=321 pid-changed=no observed=unavailable'
    check 1 "census-exit=19 $stable census-classification=census-process-failure" "$exact" 19 malformed
    check 1 "census-exit=2 $stable census-classification=incomplete-process-enumeration" "$exact" 2 malformed
    extra_output=yes
    check 1 'census-classification=unexpected-normalized-census' "$exact"
    extra_output=no
    mock_before="$id true 0"
    check 1 'classification=invalid-docker-pid census-exit=not-run' "$exact"
    mock_before=inspect-error
    check 1 'classification=docker-inspect-before-failed census-exit=not-run' "$exact"
    mock_before=$normal
    site=tta
    stage=post-publication
    mock_after="$id true 654"
    check 1 'pid-changed=yes census-classification=none container-classification=application-pid-changed' "$exact"
    mock_after="$id false 0"
    check 1 container-not-running-after "$exact"
    mock_after=inspect-error
    check 1 docker-inspect-after-failed "$exact"

    mock_after=$normal
    local multiple='[[321, 2, "database"], [321, 2, "wal"]]'
    test_group=A; check 0 'Writer census passed' "$exact"
    test_group=B; check 0 'Writer census passed' "$exact" 0 missing
    test_group=C; check 0 'Writer census passed' "$exact" 0 malformed
    test_group=D; check 0 'Writer census passed' "$exact" 0 unreadable
    test_group=E; check 1 zero-relevant-descriptors '[]'
    test_group=F; check 1 'diagnostic report unavailable' '[]' 0 missing
    test_group=G; check 1 'diagnostic report invalid' '[]' 0 malformed
    test_group=H; check 1 'diagnostic report unavailable' '[]' 0 unreadable
    test_group=I; check 1 census-classification=census-process-failure "$exact" 19
    test_group=J; check 1 census-classification=census-process-failure "$exact" 19 malformed
    test_group=K; check 0 'pid-changed=no' "$exact"
    mock_after="$id true 654"
    test_group=L; check 1 application-pid-changed "$exact"
    mock_after=$normal
    test_group=M; check 1 unexpected-descriptor-count-or-grouping "$multiple"
    test_group=N; check 1 unexpected-descriptor-count-or-grouping "$multiple" 0 malformed
    test_group=extra; check 1 'diagnostic report invalid' '[[321, 0, "database"]]' 0 unexpected
    check 0 'Writer census passed' "$exact" 0 unwritable
    check 1 'diagnostic report unavailable' '[]' 0 unwritable
)

watchdog_notice() {
    local destination=$1
    shift
    local -a notice=(timeout --foreground -k 0.1s 0.1s printf "$@")
    # Redirect the waiting shell as well as the child. A foreground signal
    # can make Bash itself write a diagnostic before it runs the EXIT trap.
    if [[ "$destination" == 2 ]]; then
        { "${notice[@]}" >&3 3>&-; } 3>&2 2>/dev/null || :
    else
        { "${notice[@]}" >&"$destination"; } 2>/dev/null || :
    fi
}

watchdog_command() {
    local limit=$1
    shift
    # Preserve the controller's bounded stderr, but keep the watchdog and
    # Bash's own signal notices off the console pipes.
    { exec 3>&2; } || exec 3>/dev/null
    exec 2>/dev/null
    exec timeout --foreground -k 3s "$limit" bash -c 'exec "$@" 2>&3 3>&-' bash "$@"
}

lifetime() {
    local limit status=0
    case "$2" in
        init:*|sample:*) limit=11s ;;
        publish:*) limit=183s ;;
        idle) limit=53s ;;
        *) return 2 ;;
    esac
    watchdog_command "$limit" python3 "$host_check" lifetime "$scratch/ffg-lifetime.json" "$1" "$2" &
    diagnostic_watchdog=$!
    wait "$diagnostic_watchdog" 2>/dev/null || status=$?
    diagnostic_watchdog=
    if [[ "$status" == 124 || "$status" == 137 ]]; then
        watchdog_notice 2 'FFG lifetime observation failed: controller-timeout\n'
    fi
    return "$status"
}

stop_owned_job() {
    local pid=$1 attempt
    kill -TERM "$pid" 2>/dev/null || :
    for ((attempt = 0; attempt < 50; attempt++)); do
        if ! kill -0 "$pid" 2>/dev/null; then
            wait "$pid" 2>/dev/null || :
            return 0
        fi
        sleep 0.1
    done
    kill -KILL "$pid" 2>/dev/null || :
    for ((attempt = 0; attempt < 10; attempt++)); do
        if ! kill -0 "$pid" 2>/dev/null; then
            wait "$pid" 2>/dev/null || :
            return 0
        fi
        sleep 0.1
    done
    return 1
}

observe_shutdown() {
    local volume=$1 directory=$2 stage=$3 mounted holders status=0
    if ! mounted=$(timeout -k 1s 10s docker ps -q --no-trunc --filter "volume=$volume" 2>/dev/null); then
        watchdog_notice 2 'FFG shutdown safety failed: %s mount-check-unavailable\n' "$stage"
        status=1
    elif [[ -n "$mounted" ]]; then
        watchdog_notice 2 'FFG shutdown safety failed: %s running-volume-mount\n' "$stage"
        status=1
    fi
    # Sample even after a mount failure to report the descriptor result separately.
    lifetime "$directory" "sample:$stage" || status=1
    if ! holders=$(timeout -k 1s 12s sudo -n timeout -k 1s 10s python3 "$host_check" census "$directory" 2>/dev/null); then
        watchdog_notice 2 'FFG shutdown safety failed: %s canonical-census-unavailable\n' "$stage"
        status=1
    elif [[ "$holders" != '[]' ]]; then
        watchdog_notice 2 'FFG shutdown safety failed: %s surviving-publication-descriptors\n' "$stage"
        status=1
    fi
    if [[ "$status" == 0 ]]; then
        watchdog_notice 1 'FFG shutdown safety passed: %s no running mounts and zero publication descriptors\n' "$stage"
    fi
    return "$status"
}

stop_observed_app() {
    local container=$1 volume=$2 directory=$3 id removed status=0
    local format='{{.State.Running}} {{.State.Pid}} {{.HostConfig.RestartPolicy.Name}}'
    if [[ -n "${observed_removal_id:-}" ]]; then
        # A signal can arrive after rm but before the final descriptor census.
        id=$observed_removal_id
        if ! removed=$(timeout -k 1s 10s docker ps -aq --no-trunc --filter "id=$id" 2>/dev/null); then
            watchdog_notice 2 'FFG shutdown safety failed: application-removal-unverified\n'
            return 1
        fi
    else
        if ! id=$(timeout -k 1s 10s docker inspect --format '{{.Id}} {{.HostConfig.RestartPolicy.Name}}' "$container" 2>/dev/null) ||
            [[ ! "$id" =~ ^[0-9a-f]{64}\ no$ ]]; then
            watchdog_notice 2 'FFG shutdown safety failed: restart-policy-or-container-identity\n'
            return 1
        fi
        id=${id% no}
        if ! timeout -k 1s 20s docker stop -t 10 "$id" >/dev/null 2>&1 ||
            [[ "$(timeout -k 1s 10s docker inspect --format "$format" "$id" 2>/dev/null)" != 'false 0 no' ]]; then
            watchdog_notice 2 'FFG shutdown safety failed: application-did-not-stop\n'
            return 1
        fi
        watchdog_notice 1 'FFG application stopped with restart disabled and PID zero\n'
        observe_shutdown "$volume" "$directory" after-stop || status=1
        observed_removal_id=$id
        removed=$id
    fi
    if [[ -n "$removed" ]] && {
        ! timeout -k 1s 10s docker rm "$id" >/dev/null 2>&1 ||
        ! removed=$(timeout -k 1s 10s docker ps -aq --no-trunc --filter "id=$id" 2>/dev/null) ||
        [[ -n "$removed" ]]
    }; then
        watchdog_notice 2 'FFG shutdown safety failed: application-removal-unverified\n'
        return 1
    fi
    watchdog_notice 1 'FFG application removal verified\n'
    observe_shutdown "$volume" "$directory" after-removal || status=1
    observed_container= observed_removal_id=
    return "$status"
}

publish_observed_ffg() {
    local container=$1 volume=$2 lifetime_volume application_pid writer_status=not-run diagnostic_status=0 idle_status=0
    if ! lifetime_volume=$(volume_path "$volume" bounded 2>/dev/null); then
        watchdog_notice 2 'FFG lifetime observation failed: unable to resolve diagnostic volume\n'
        exit 1
    fi
    observed_volume=$volume observed_directory=$lifetime_volume observed_container=$container
    if application_pid=$(timeout -k 1s 10s docker inspect --format '{{.State.Pid}}' "$container" 2>/dev/null); then
        lifetime "$lifetime_volume" "init:$application_pid" && lifetime "$lifetime_volume" sample:startup &&
            lifetime "$lifetime_volume" "publish:$container" || diagnostic_status=$?
    else
        watchdog_notice 2 'FFG lifetime observation failed: application-pid-unavailable\n'
        diagnostic_status=1
    fi
    if [[ "$diagnostic_status" == 0 ]]; then
        # Run the canonical check before idle observations can change the result.
        writer_status=0
        (one_writer "$container" "$volume" ffg post-publication) || writer_status=$?
        lifetime "$lifetime_volume" sample:publication-complete || diagnostic_status=$?
        lifetime "$lifetime_volume" idle || idle_status=$?
        [[ "$diagnostic_status" != 0 ]] || diagnostic_status=$idle_status
    fi
    if [[ "$writer_status" != 0 || "$diagnostic_status" != 0 ]]; then
        stop_observed_app "$container" "$volume" "$lifetime_volume" ||
            watchdog_notice 2 'FFG shutdown safety failed during diagnostic teardown\n'
        watchdog_notice 2 'FFG recovery stopped before checkpoint: writer-status=%s diagnostic-status=%s\n' \
            "$writer_status" "$diagnostic_status"
        if [[ "$writer_status" != 0 && "$writer_status" != not-run ]]; then exit "$writer_status"; fi
        exit "$diagnostic_status"
    fi
}

lifetime_shell_self_test() (
    local mock_mount= mock_holders='[]' mock_removed=no mock_id result status=0 real_watchdog
    real_watchdog=$(declare -f watchdog_notice lifetime)
    printf -v mock_id '%064d' 1
    timeout() { if [[ "$1" == --foreground ]]; then shift; fi; shift 3; "$@"; }
    sudo() { printf '%s\n' "$mock_holders"; }
    volume_path() { printf '/synthetic-volume\n'; }
    lifetime() { :; }
    docker() {
        case "$1" in
            inspect)
                case "$3" in
                    '{{.Id}} {{.HostConfig.RestartPolicy.Name}}') printf '%s no\n' "$mock_id" ;;
                    '{{.State.Running}} {{.State.Pid}} {{.HostConfig.RestartPolicy.Name}}') printf 'false 0 no\n' ;;
                    '{{.State.Pid}}') printf '321\n' ;;
                    *) return 2 ;;
                esac ;;
            stop) : ;;
            rm) mock_removed=yes ;;
            ps)
                if [[ "$2" == -aq ]]; then
                    [[ "$mock_removed" == yes ]] || printf '%s\n' "$mock_id"
                else
                    printf '%s' "$mock_mount"
                fi ;;
            *) return 2 ;;
        esac
    }

    result=$(stop_observed_app app volume /synthetic-volume 2>&1) ||
        fail "shutdown control rejected a closed volume"
    [[ "$result" == *'passed: after-stop'* && "$result" == *'passed: after-removal'* ]] ||
        fail "shutdown control omitted a closed observation"

    mock_mount=unexpected
    result=$(stop_observed_app app volume /synthetic-volume 2>&1) || status=$?
    [[ "$status" == 1 && "$result" == *'after-stop running-volume-mount'* &&
       "$result" == *'after-removal running-volume-mount'* ]] || fail "shutdown control accepted a surviving mount"

    mock_mount= mock_holders='[[321, 0]]' status=0
    result=$(stop_observed_app app volume /synthetic-volume 2>&1) || status=$?
    [[ "$status" == 1 && "$result" == *'after-stop surviving-publication-descriptors'* &&
       "$result" == *'after-removal surviving-publication-descriptors'* ]] || fail "shutdown control accepted a surviving descriptor"

    one_writer() { exit 47; }
    status=0
    result=$(publish_observed_ffg app volume 2>&1) || status=$?
    [[ "$status" == 47 && "$result" == *'shutdown safety failed during diagnostic teardown'* &&
       "$result" == *'stopped before checkpoint: writer-status=47 diagnostic-status=0'* ]] ||
        fail "diagnostic teardown masked the writer failure"

    mock_holders='[]' status=0
    lifetime() {
        if [[ "$2" == sample:publication-complete ]]; then
            printf 'synthetic diagnostic formatting failure\n' >&2
            return 9
        fi
    }
    result=$(publish_observed_ffg app volume 2>&1) || status=$?
    [[ "$status" == 47 && "$result" == *'synthetic diagnostic formatting failure'* &&
       "$result" == *'passed: after-removal'* && "$result" == *'writer-status=47 diagnostic-status=9'* ]] ||
        fail "formatter failure was hidden or changed the writer failure"

    one_writer() { return 0; }
    lifetime() {
        case "$2" in
            sample:publication-complete) return 124 ;;
            idle) return 9 ;;
        esac
    }
    status=0
    result=$(publish_observed_ffg app volume 2>&1) || status=$?
    [[ "$status" == 124 && "$result" == *'passed: after-removal'* &&
       "$result" == *'writer-status=0 diagnostic-status=124'* ]] || fail "idle failure replaced the primary timeout"

    # Exercise the real shell warning on a full pipe. Only the diagnostic
    # command is stubbed. The warning must return without a reader draining it.
    python3 -c '
import os
import subprocess
import sys

read_fd, write_fd = os.pipe()
try:
    os.set_blocking(write_fd, False)
    try:
        while True:
            os.write(write_fd, b"x" * 512)
    except BlockingIOError:
        pass
    os.set_blocking(write_fd, True)
    stub = """
set -euo pipefail
scratch=/synthetic
host_check=unused
watchdog_command() { exit 124; }
"""
    command = stub + sys.argv[1] + "\nlifetime /synthetic-volume sample:startup\n"
    result = subprocess.run(["bash", "-c", command], stderr=write_fd, timeout=2)
    assert result.returncode == 124, result.returncode
finally:
    os.close(read_fd)
    os.close(write_fd)
' "$real_watchdog"

    printf 'Lifetime shell controls passed: closed shutdown, surviving mount and descriptor, preserved writer failure, full watchdog stderr\n'
)

if [[ "${1:-}" == --database-self-test ]]; then
    database_self_test
    exit
fi
if [[ "${1:-}" == --writer-self-test ]]; then
    writer_self_test
    exit
fi

if [[ "${1:-}" == --lifetime-self-test ]]; then
    lifetime_shell_self_test
    exit
fi

[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch &&
   "${RUNNER_ENVIRONMENT:-}" == github-hosted &&
   "${RUNNER_OS:-}" == Linux && "${RUNNER_ARCH:-}" == X64 && "$(uname -m)" == x86_64 ]] ||
    fail "requires a GitHub-hosted native Linux AMD64 runner"
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] ||
    fail "invalid run identity"
[[ -d "${RUNNER_TEMP:?}" && -n "${GITHUB_STEP_SUMMARY:?}" ]] || fail "missing runner paths"

tag="sites-recovery-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
label="org.sites.native-recovery=$tag"
scratch="$RUNNER_TEMP/$tag"
unset DOCKER_CONTEXT
export DOCKER_HOST=unix:///var/run/docker.sock

cleanup() {
    local status=0 ids name other listing
    ids=$(docker ps -aq --filter "label=$label") || return 1
    for name in $ids; do docker rm -f "$name" >/dev/null || status=1; done
    ids=$(docker volume ls -q --filter "label=$label") || return 1
    for name in $ids; do docker volume rm "$name" >/dev/null || status=1; done
    for name in ffg tta; do
        for other in candidate historical; do
            local image="$tag-$name:$other"
            if [[ "$(docker image inspect --format '{{index .Config.Labels "org.sites.native-recovery"}}' "$image" 2>/dev/null)" == "$tag" ]]; then
                docker image rm "$image" >/dev/null || status=1
            fi
        done
    done

    if [[ "$status" == 0 ]]; then
        for listing in 'ps -aq' 'volume ls -q' 'image ls -q'; do
            # Fixed subcommands above. The filter only matches this workflow run.
            local args=()
            read -r -a args <<< "$listing"
            ids=$(docker "${args[@]}" --filter "label=$label") || return 1
            [[ -z "$ids" ]] || status=1
        done
    fi
    if [[ "$status" == 0 && -f "$scratch/.recovery-run" && "$(cat "$scratch/.recovery-run")" == "$tag" ]]; then
        sudo -n rm -rf -- "$scratch" || status=1
    fi
    return "$status"
}

bounded_cleanup() {
    # Run precisely the same label-scoped cleanup with a deadline for its
    # Docker client and filesystem operations. The fallback CI step can retry.
    { timeout -k 2s 90s bash -euc "$(declare -f cleanup)"'
scratch=$1 tag=$2 label=$3
cleanup' bash "$scratch" "$tag" "$label"; } >/dev/null 2>&1
}

if [[ "${1:-}" == --cleanup ]]; then
    # A failed checkout or an unavailable daemon before provisioning owns nothing.
    if [[ -f "$scratch/.recovery-run" ]] && ! bounded_cleanup; then
        watchdog_notice 2 'Recovery resource cleanup failed independently of the rehearsal result\n'
        exit 1
    fi
    exit
fi

[[ $# == 2 ]] || fail "supply candidate and historical checkout paths"
[[ -n "${TARGET_REVISION:-}" ]] || fail "missing candidate revision"
[[ "$TARGET_REVISION" =~ ^[0-9a-fA-F]{40}$ ]] || fail "candidate revision must be a full 40-character commit SHA"
candidate_sha=$(printf '%s' "$TARGET_REVISION" | tr '[:upper:]' '[:lower:]')
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "invalid workflow revision"
[[ "$(git -C "$here/.." rev-parse --verify 'HEAD^{commit}')" == "$GITHUB_SHA" ]] || fail "harness SHA mismatch"
candidate=$(cd -- "$1" && pwd -P)
historical=$(cd -- "$2" && pwd -P)
[[ "$candidate" != "$historical" ]] || fail "candidate and historical must use separate build contexts"
[[ "$(git -C "$candidate" rev-parse --verify 'HEAD^{commit}')" == "$candidate_sha" ]] || fail "candidate SHA mismatch"
[[ "$(git -C "$historical" rev-parse --verify 'HEAD^{commit}')" == "$historical_sha" ]] || fail "historical SHA mismatch"
for source in "$candidate" "$historical"; do
    [[ "$(git -C "$source" rev-parse --show-toplevel)" == "$source" ]] || fail "build context must be a checkout root"
    source_status=$(git -C "$source" status --porcelain --untracked-files=all) || fail "cannot inspect build context"
    [[ -z "$source_status" ]] || fail "dirty build context"
done
architecture=$(docker version --format '{{.Server.Arch}}')
[[ "$architecture" == amd64 || "$architecture" == x86_64 ]] || fail "Docker daemon is not native AMD64"
mkdir -- "$scratch"
printf '%s\n' "$tag" > "$scratch/.recovery-run"
monitor=
diagnostic_watchdog=
observed_container= observed_removal_id=
usage_report() {
    { timeout --foreground -k 0.2s 2s awk '
            NF == 5 {
                if (!seen[$1]++) { blocks[$1] = $2; inodes[$1] = $4 }
                peak_blocks[$1] = ($2 > peak_blocks[$1] ? $2 : peak_blocks[$1])
                peak_inodes[$1] = ($4 > peak_inodes[$1] ? $4 : peak_inodes[$1])
                if (!($1 in free) || $3 < free[$1]) free[$1] = $3
                if (!($1 in ifree) || $5 < ifree[$1]) ifree[$1] = $5
            }
            END {
                print "\n## Runner filesystem high-water observations\n"
                for (fs in seen)
                    printf "- %s: peak increase %.0f allocated bytes and %.0f inodes; minimum free %.0f bytes and %.0f inodes.\n", fs, (peak_blocks[fs]-blocks[fs]), (peak_inodes[fs]-inodes[fs]), free[fs], ifree[fs]
            }
        ' "$scratch/usage"; } 2>/dev/null
}

deliver_usage_report() {
    [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] || return 1
    # Open the destination inside the timed child, since a FIFO can block
    # before a shell redirection has even completed.
    { timeout --foreground -k 0.2s 1s bash -c 'printf "%s\n" "$2" >> "$1"' \
        bash "$GITHUB_STEP_SUMMARY" "$1"; } >/dev/null 2>&1
}

finish() {
    local status=$? report= report_failed=0
    trap - EXIT
    # Catchable harness signals interrupt lifetime's wait. Stop its owned
    # watchdog first so it can forward the signal and reap its controller.
    if [[ -n "$diagnostic_watchdog" ]] && ! stop_owned_job "$diagnostic_watchdog"; then
        watchdog_notice 2 'Recovery diagnostic watchdog did not exit after termination\n'
        [[ "$status" != 0 ]] || status=1
    fi
    diagnostic_watchdog=
    if [[ -n "$monitor" ]] && ! stop_owned_job "$monitor"; then
        watchdog_notice 2 'Runner filesystem monitor did not exit after termination\n'
        [[ "$status" != 0 ]] || status=1
    fi
    if [[ -e "$scratch/usage-incomplete" ]]; then
        watchdog_notice 2 'Runner filesystem sampling failed.\n'
        [[ "$status" != 0 ]] || status=1
    fi
    # Complete the observed FFG shutdown before the label-scoped fallback.
    if [[ "$status" == 130 || "$status" == 143 ]] && [[ -n "${observed_container:-}" ]] &&
        ! stop_observed_app "$observed_container" "$observed_volume" "$observed_directory"; then
        watchdog_notice 2 'FFG shutdown safety failed during signal teardown\n'
    fi
    if [[ -s "$scratch/usage" ]] && ! report=$(usage_report); then
        report_failed=1
        [[ "$status" != 0 ]] || status=1
    fi
    if ! bounded_cleanup; then
        watchdog_notice 2 'Recovery resource cleanup failed independently of the rehearsal result\n'
        [[ "$status" != 0 ]] || status=1
    fi
    if [[ "$report_failed" == 1 ]]; then
        watchdog_notice 2 'Runner filesystem high-water report generation failed\n'
    elif [[ -n "$report" ]] && ! deliver_usage_report "$report"; then
        watchdog_notice 2 'Runner filesystem high-water report could not be written to the step summary\n'
    fi
    exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export RECOVERY_PASSWORD SESSION_SECRET
RECOVERY_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
printf '# Isolated native AMD64 recovery\n\n- Candidate: `%s`\n- Historical: `%s`\n- Harness: `%s`\n' \
    "$candidate_sha" "$historical_sha" "$GITHUB_SHA" >> "$GITHUB_STEP_SUMMARY"

docker_root=$(docker info --format '{{.DockerRootDir}}')
sample_usage() {
    local filesystem=$1 location=$2 used free inodes ifree
    read -r used free < <(sudo -n df -P -B1 "$location" | awk 'NR == 2 { print $3, $4 }') || return 1
    read -r inodes ifree < <(sudo -n df -Pi "$location" | awk 'NR == 2 { print $3, $4 }') || return 1
    printf '%s %s %s %s %s\n' "$filesystem" "$used" "$free" "$inodes" "$ifree"
}
sample_usage docker "$docker_root" > "$scratch/usage"
sample_usage artifacts "$scratch" >> "$scratch/usage"
(
    trap - EXIT INT TERM
    while sleep 1; do
        if ! sample_usage docker "$docker_root" || ! sample_usage artifacts "$scratch"; then
            touch "$scratch/usage-incomplete"
            exit 1
        fi
    done
) >> "$scratch/usage" &
monitor=$!

# The only build inputs are the clean pinned source checkouts, not the harness.
declare -A images
for release in candidate historical; do
    source=$candidate
    if [[ "$release" == historical ]]; then source=$historical; fi
    for site in ffg tta; do
        site_dir=fruitionforestgarden
        if [[ "$site" == tta ]]; then site_dir=thetecnoagrarian; fi
        image="$tag-$site:$release"
        if docker image inspect "$image" >/dev/null 2>&1; then fail "image tag collision"; fi
        docker build --no-cache --pull --platform linux/amd64 --label "$label" \
            -f "$source/docker/Dockerfile.prod.site" --build-arg "SITE_DIR_NAME=$site_dir" \
            --build-arg SITE_PORT=4000 --tag "$image" "$source"
        read -r id os arch size < <(docker image inspect --format '{{.Id}} {{.Os}} {{.Architecture}} {{.Size}}' "$image")
        [[ "$id" =~ ^sha256:[0-9a-f]{64}$ && "$os/$arch" == linux/amd64 ]] || fail "unexpected image identity"
        images["$site-$release"]=$id
        printf -- '- %s %s: `%s`, %s image bytes (shared layers may overlap).\n' \
            "$site" "$release" "$id" "$size" >> "$GITHUB_STEP_SUMMARY"
    done
done

TMPDIR="$scratch" python3 "$host_check" self-test
TMPDIR="$scratch" python3 "$host_check" lifetime-self-test
lifetime_shell_self_test
sudo -n env TMPDIR="$scratch" python3 "$host_check" census-self-test
docker run --rm --network none --label "$label" --read-only --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
    --entrypoint bash "${images[ffg-candidate]}" -euc "$(declare -f verify_database database_self_test)
database_self_test"
common=(--network none --label "$label" --mount "type=bind,src=$fixture,dst=/recovery.mjs,readonly")
data_mount() { printf 'type=volume,src=%s,dst=/app/data,volume-nocopy%s' "$1" "${2:+,$2}"; }
new_volume() {
    if docker volume inspect "$1" >/dev/null 2>&1; then fail "volume name collision"; fi
    docker volume create --label "$label" "$1" >/dev/null
}
job() {
    local image=$1 volume=$2 access=$3 mode=$4 site=$5
    docker run --rm "${common[@]}" --read-only --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume" "$access")" -e RECOVERY_PASSWORD \
        --entrypoint node "$image" /recovery.mjs "$mode" "$site"
}
volume_path() {
    local directory
    if [[ "${2:-}" == bounded ]]; then
        directory=$(timeout -k 1s 10s docker volume inspect --format '{{.Mountpoint}}' "$1" 2>/dev/null) || return 1
    else
        directory=$(docker volume inspect --format '{{.Mountpoint}}' "$1") || return 1
    fi
    [[ "$directory" == "$docker_root"/volumes/"$1"/_data ]] || fail "unexpected data mountpoint"
    printf '%s\n' "$directory"
}
census() {
    local directory
    directory=$(volume_path "$1") || return 1
    sudo -n python3 "$host_check" "${2:-census}" "$directory"
}
containers_using() { docker ps -q --no-trunc --filter "volume=$1"; }
quiescent() {
    local mounted holders
    mounted=$(containers_using "$1") || return 2
    [[ -z "$mounted" ]] || return 1
    holders=$(census "$1") || return 2
    [[ "$holders" == '[]' ]]
}
measure() {
    local result
    result=$(sudo -n python3 "$host_check" tree "$(volume_path "$1")")
    printf -- '- %s data volume: `%s`\n' "$2" "$result" | tee -a "$GITHUB_STEP_SUMMARY"
}
assert_mount() {
    local identity network ports mount expected id volumes
    read -r identity network ports < <(docker inspect --format '{{.Image}} {{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}}' "$1")
    [[ "$identity" == "$2" && "$network" == none && "$ports" == 0 ]] || fail "container isolation mismatch"
    mount=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}} {{.RW}}{{end}}{{end}}' "$1")
    expected="$3 $4"
    volumes=$(docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{" "}}{{end}}{{end}}' "$1")
    [[ "$mount" == "$expected" && "$volumes" == "$3 " ]] || fail "unexpected data mount: $mount"
    id=$(docker inspect --format '{{.Id}}' "$1")
    [[ "$(containers_using "$3")" == "$id" ]] || fail "unexpected concurrent volume mount"
    printf -- '- Container `%s` used image `%s` and data volume `%s` (writable: %s).\n' \
        "$id" "$identity" "$3" "$4" >> "$GITHUB_STEP_SUMMARY"
}
start_app() {
    local container=$1 image=$2 volume=$3 site=$4 stage=$5 ready=false site_dir=fruitionforestgarden
    if [[ "$site" == tta ]]; then site_dir=thetecnoagrarian; fi
    docker run -d "${common[@]}" --name "$container" --restart=no --read-only \
        --tmpfs "/app/$site_dir/uploads:rw,nosuid,nodev,uid=1001,gid=1001,mode=0700" \
        --tmpfs /app/logs:rw,nosuid,nodev,uid=1001,gid=1001,mode=0700 \
        --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume")" \
        -e NODE_ENV=production -e PORT=4000 -e SITE_PORT=4000 -e SESSION_SECRET -e RECOVERY_PASSWORD \
        -e DATABASE_PATH=/app/data/blog.db -e UPLOADS_PATH=/app/data/uploads \
        -e BASE_URL=https://restore.invalid -e TRUSTED_INGRESS_PEERS=127.0.0.1 \
        -e RATE_LIMIT_MAX_REQUESTS=1000 --entrypoint bash "$image" -c 'umask 077; exec node src/app.js' >/dev/null
    assert_mount "$container" "$image" "$volume" true
    for _ in {1..30}; do
        if docker exec "$container" node /recovery.mjs http-health "$site" >/dev/null 2>&1; then
            ready=true
            break
        fi
        [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || break
        sleep 1
    done
    [[ "$ready" == true ]] || fail "$site failed to become healthy"
    one_writer "$container" "$volume" "$site" "$stage"
}
stop_app() {
    docker stop -t 10 "$1" >/dev/null
    [[ "$(docker inspect --format '{{.State.Running}} {{.State.Pid}}' "$1")" == 'false 0' ]] ||
        fail "application did not quiesce"
    quiescent "$2" || fail "unexpected volume attachment or SQLite handle after stopping app"
    docker rm "$1" >/dev/null
}
require_closed_source() {
    local helper_id=$1 volume=$2 mounted holders
    mounted=$(containers_using "$volume") || return 2
    [[ "$mounted" == "$helper_id" ]] || return 1
    holders=$(census "$volume") || return 2
    [[ "$holders" == '[]' ]]
}

checkpoint() {
    local site=$1 image=$2 volume=$3 phase=$4 helper_id
    quiescent "$volume" || return "$?"
    helper_id=$(docker run -d --network none --label "$label" --name "$tag-$site-backup-$phase" --restart=no --no-healthcheck \
        --mount "$(data_mount "$volume" readonly)" --entrypoint bash "$image" -c 'while :; do sleep 300; done')
    [[ "$helper_id" =~ ^[0-9a-f]{64}$ ]] || fail "unexpected backup helper identity"
    assert_mount "$helper_id" "$image" "$volume" false
    sudo -n python3 "$host_check" private "$(volume_path "$volume")"
    sudo -n python3 "$host_check" db-digest "$(volume_path "$volume")" > "$scratch/$site-$phase.source-db"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" > "$scratch/$site-$phase.uploads"
    # The sole application container was removed, with restart disabled. This
    # synchronous job is the only actor allowed to start or mount these volumes.
    # The idle helper has only a read-only data mount and writable staging.
    require_closed_source "$helper_id" "$volume" || fail "source not closed immediately before capture"
    # Keep the helper root writable for the existing docker cp staging path.
    HOST_BACKUP_DIR="$scratch/sets" BACKUP_RUN_ID="$phase" BACKUP_SITES="$site:$helper_id" \
        CONTAINER_STAGE_DIR="/tmp/$tag-backup" CONTAINER_BACKUP_SCRIPT="$candidate/scripts/backup.sh" \
        DOCKER_BIN=docker bash "$candidate/scripts/backup-host.sh"
    require_closed_source "$helper_id" "$volume" || fail "unexpected mount or publication handle after capture"
    sudo -n python3 "$host_check" db-digest "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.source-db"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.uploads"
    docker rm -f "$helper_id" >/dev/null
    quiescent "$volume" || fail "source failed the closed-checkpoint census"
    local archive_dir="$scratch/sets/$site/backup-set-$phase"
    python3 "$host_check" archive "$archive_dir/uploads.tar.gz"
    (cd -- "$archive_dir" && sha256sum blog.db uploads.tar.gz) > "$scratch/$site-$phase.sha256"
    {
        printf '\n## %s %s checkpoint\n\n' "$site" "$phase"
        wc -c "$archive_dir/blog.db" "$archive_dir/uploads.tar.gz" | awk '{print "- " $1 " bytes: " $2}'
        sed 's/^/- SHA-256 /' "$scratch/$site-$phase.sha256"
    } >> "$GITHUB_STEP_SUMMARY"
    measure "$volume" "$site $phase source"
}
verify_backup() {
    local directory=$1 checksums=$2 file expected
    for file in blog.db uploads.tar.gz; do
        expected=$(awk -v file="$file" '$2 == file { print $1 }' "$checksums")
        python3 "$host_check" verify-digest "$directory/$file" "$expected" "Backup artifact"
    done
}

restore() {
    local site=$1 image=$2 phase=$3 volume=$4
    local directory="$scratch/sets/$site/backup-set-$phase"
    verify_backup "$directory" "$scratch/$site-$phase.sha256"
    python3 "$host_check" archive "$directory/uploads.tar.gz"
    new_volume "$volume"
    docker run --rm --network none --label "$label" --user 0:0 --read-only \
        --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
        --mount "$(data_mount "$volume")" --mount "type=bind,src=$directory,dst=/backup,readonly" \
        --entrypoint bash "$image" -euc "$(declare -f verify_database)"'
            umask 077
            cp /backup/blog.db /app/data/blog.db
            tar --no-same-owner --no-same-permissions -xzf /backup/uploads.tar.gz -C /app/data
            chown -R 1001:1001 /app/data
            find /app/data -type d -exec chmod 700 {} +
            find /app/data -type f -exec chmod 600 {} +
            verify_database /app/data/blog.db
        '
    local expected
    expected=$(awk '$2 == "blog.db" { print $1 }' "$scratch/$site-$phase.sha256")
    sudo -n python3 "$host_check" verify-digest "$(volume_path "$volume")/blog.db" "$expected" "Restored database"
    sudo -n python3 "$host_check" uploads "$(volume_path "$volume")" | cmp "$scratch/$site-$phase.uploads"
    sudo -n python3 "$host_check" private "$(volume_path "$volume")"
    quiescent "$volume" || fail "restore target is not closed before boot"
    measure "$volume" "$site $phase restored"
}

for site in ffg tta; do
    old=${images["$site-historical"]}
    new=${images["$site-candidate"]}
    app="$tag-$site-app"
    source="$tag-$site-source"
    migrated="$tag-$site-migrated"
    restored="$tag-$site-restored"
    rollback="$tag-$site-rollback"

    new_volume "$source"
    docker run --rm --network none --label "$label" --user 0:0 \
        --mount "$(data_mount "$source")" --entrypoint sh "$old" \
        -ec 'chown 1001:1001 /app/data; chmod 700 /app/data'
    job "$old" "$source" '' seed "$site"
    start_app "$app" "$old" "$source" "$site" historical-startup
    docker exec "$app" node /recovery.mjs http-pre "$site"
    stop_app "$app" "$source"
    checkpoint "$site" "$old" "$source" pre

    restore "$site" "$new" pre "$migrated"
    job "$new" "$migrated" '' fs-probe "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    job "$new" "$migrated" '' migrate "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    start_app "$app" "$new" "$migrated" "$site" pre-publication-startup
    if [[ "$site" == ffg ]]; then
        publish_observed_ffg "$app" "$migrated"
    else
        docker exec "$app" node /recovery.mjs publish "$site"
        one_writer "$app" "$migrated" "$site" post-publication
    fi
    if checkpoint "$site" "$new" "$migrated" active; then
        fail "checkpoint proceeded with an admitted publication writer"
    else
        [[ $? == 1 && ! -e "$scratch/sets/$site/backup-set-active" &&
           ! -e "$scratch/sets/$site/.staging-backup-set-active" ]] || fail "checkpoint refusal was inconclusive"
        printf -- '- %s: checkpoint refused while its one publication writer was active.\n' "$site" >> "$GITHUB_STEP_SUMMARY"
    fi
    if [[ "$site" == ffg ]]; then
        if ! lifetime_volume=$(volume_path "$migrated" bounded 2>/dev/null); then
            watchdog_notice 2 'FFG shutdown safety failed: unable to resolve diagnostic volume\n'
            exit 1
        fi
        stop_observed_app "$app" "$migrated" "$lifetime_volume"
    else
        stop_app "$app" "$migrated"
    fi
    job "$new" "$migrated" readonly fingerprint "$site" | tee "$scratch/$site.fingerprint"
    checkpoint "$site" "$new" "$migrated" post

    restore "$site" "$old" pre "$rollback"
    start_app "$app" "$old" "$rollback" "$site" rollback-startup
    docker exec "$app" node /recovery.mjs http-pre "$site"
    stop_app "$app" "$rollback"
    printf -- '- %s Case B booted with its historical image and pre-migration checkpoint; later writes were absent.\n' \
        "$site" >> "$GITHUB_STEP_SUMMARY"

    restore "$site" "$new" post "$restored"
    job "$new" "$restored" readonly fingerprint "$site" | cmp "$scratch/$site.fingerprint"
    start_app "$app" "$new" "$restored" "$site" forward-restored-startup
    docker exec "$app" node /recovery.mjs http-post "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    stop_app "$app" "$restored"
    job "$new" "$restored" readonly fingerprint "$site" | cmp "$scratch/$site.fingerprint"

    if [[ "$site" == ffg ]]; then
        fault_volume="$tag-ffg-faults"
        restore "$site" "$new" post "$fault_volume"
        job "$new" "$fault_volume" '' faults "$site" | tee -a "$GITHUB_STEP_SUMMARY"
        TMPDIR="$scratch" python3 "$host_check" archive-truncation "$scratch/sets/ffg/backup-set-post/uploads.tar.gz" |
            tee -a "$GITHUB_STEP_SUMMARY"
        job "$new" "$restored" readonly capacity "$site" | tee -a "$GITHUB_STEP_SUMMARY"
    fi
    for phase in pre post; do
        verify_backup "$scratch/sets/$site/backup-set-$phase" "$scratch/$site-$phase.sha256"
    done
done

printf '\n## Native technical result\n\n- Forward recovery and Case B passed for both sites.\n- Case A remains unverified until an independent immutable rollback image supports the 0004 ledger, managed media grants and the v2 hero authority with safe read and write behavior.\n- File and directory synchronization calls succeeded. Power-loss durability was outside the rehearsal.\n- Prior production free-space observation (21.14 GB) is historical. Production was outside this workflow.\n' \
    >> "$GITHUB_STEP_SUMMARY"
