"""Host-side checks for the disposable Linux recovery rehearsal."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import tarfile
import time
from typing import NamedTuple
from unittest.mock import patch


def members(archive):
    seen = set()
    for member in archive.getmembers():
        parts = member.name.split("/")
        if (parts[0] != "uploads" or any(p in ("", ".", "..") for p in parts)
                or not (member.isfile() or member.isdir()) or member.name in seen):
            raise ValueError("Unsafe backup archive member")
        seen.add(member.name)
    root = archive.getmember("uploads")
    if not root.isdir():
        raise ValueError("Missing uploads directory")


def archive_check(file):
    # Read to EOF, including the gzip trailer, before trusting the member list.
    with gzip.open(file, "rb") as stream:
        while stream.read(1024 * 1024):
            pass
    with tarfile.open(file, "r:gz") as archive:
        members(archive)


DB_NAMES = ("blog.db", "blog.db-wal", "blog.db-shm", "blog.db-journal")


def identity(info):
    return info.st_dev, info.st_ino


def publication_identities(volume):
    """Collect current inodes without traversing symlinks or other filesystems."""
    volume_stat = volume.stat()
    device = volume_stat.st_dev
    entries = {identity(volume_stat)}

    def add(entry):
        info = entry.lstat()
        if (info.st_dev != device
                or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode))):
            raise ValueError("Unexpected file type or mount in publication tree")
        entries.add(identity(info))

    def walk_error(error):
        raise error

    for name in DB_NAMES:
        try:
            add(volume / name)
        except FileNotFoundError:
            if name == "blog.db":
                raise
    root = volume / "uploads"
    add(root)
    for directory, subdirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        for name in (*subdirs, *files):
            add(Path(directory) / name)
    return entries


def publication_path(relative):
    return (len(relative.parts) == 1 and relative.name in DB_NAMES
            or relative.parts[:1] == ("uploads",))


def deleted_publication(fd, proc, info, volume, volume_id):
    # A deleted inode vanishes from the walk. Use its kernel-reported path only
    # on the volume's device and, for the container alias, verify the bind root.
    if info.st_dev != volume_id[0]:
        return False
    target = os.readlink(fd)
    if not target.endswith(" (deleted)"):
        return False
    deleted = Path(target.removesuffix(" (deleted)"))
    if deleted.is_relative_to(volume):
        return publication_path(deleted.relative_to(volume))
    alias = Path("/app/data")
    if deleted.is_relative_to(alias) and publication_path(deleted.relative_to(alias)):
        return identity((proc / "root/app/data").stat()) == volume_id
    return False


PROC = Path("/proc")
EXIT_STATES = {b"Z", b"X", b"x"}
GONE = (FileNotFoundError, ProcessLookupError)


class CensusIncomplete(RuntimeError):
    """A live task or the procfs view could not be classified."""


class TaskState(NamedTuple):
    state: bytes
    threads: int
    started: int


def check_proc_mount(mountinfo):
    proc_mounts = []
    for line in mountinfo.splitlines():
        fields, fs = (part.split() for part in line.split(" - ", 1))
        mountpoint = Path(fields[4])
        if mountpoint == PROC:
            proc_mounts.append((fields[3], fs[0], set(fs[2].split(",") + fields[5].split(","))))
        elif (mountpoint.parts[:2] == ("/", "proc") and len(mountpoint.parts) > 2
              and (mountpoint.parts[2].isdecimal() or mountpoint.parts[2] in ("self", "thread-self"))):
            raise CensusIncomplete("A mount obscures procfs process entries")
    if len(proc_mounts) != 1:
        raise CensusIncomplete("Expected one host procfs mount at /proc")
    root, filesystem, options = proc_mounts[0]
    if root != "/" or filesystem != "proc" or any(
            option.startswith("subset=")
            or (option.startswith("hidepid=") and option not in ("hidepid=0", "hidepid=off"))
            for option in options):
        raise CensusIncomplete("Host procfs is restricted")


def require_host_procfs():
    if sys.platform != "linux" or os.geteuid() != 0:
        raise CensusIncomplete("A privileged Linux host procfs view is required")
    check_proc_mount((PROC / "self/mountinfo").read_text())
    # Linux nsfs initial namespace inodes. Matching only PID 1 would also
    # accept the init process of an isolated PID namespace.
    for namespace, inode in (("pid", 0xEFFFFFFC), ("user", 0xEFFFFFFD)):
        own = (PROC / "self/ns" / namespace).stat()
        initial = (PROC / "1/ns" / namespace).stat()
        if own.st_ino != inode or identity(own) != identity(initial):
            raise CensusIncomplete(f"Initial Linux {namespace} namespace is required")
    status = (PROC / "self/status").read_text()
    capabilities = next(line.split()[1] for line in status.splitlines() if line.startswith("CapEff:"))
    if not int(capabilities, 16) & (1 << 19):  # CAP_SYS_PTRACE
        raise CensusIncomplete("CAP_SYS_PTRACE is required to inspect host descriptors")


def task_state(task):
    try:
        # proc_pid_stat(5) fields 3, 20, and 22. The comm field may contain
        # spaces, parentheses, and non-UTF-8 bytes.
        fields = (task / "stat").read_bytes().rsplit(b") ", 1)[1].split()
        return TaskState(fields[0], int(fields[17]), int(fields[19]))
    except GONE:
        # The proc directory must also have disappeared. A missing stat file
        # in a still-visible task directory leaves the census incomplete.
        try:
            task.stat()
        except GONE:
            return None
        raise CensusIncomplete(f"Process state unavailable for {task}")
    except (OSError, ValueError, IndexError) as error:
        raise CensusIncomplete(f"Cannot read process state for {task}") from error


def same_task(task, before):
    after = task_state(task)
    if after is not None and before.started != after.started:
        raise CensusIncomplete(f"Process identity changed while inspecting {task}")
    return after


def live_leader(process, state):
    if state is None:
        return False
    if state.state in EXIT_STATES:
        if state.threads > 1:
            raise CensusIncomplete(f"Leader {process.name} exited with live sibling threads")
        return False
    return True


def list_live(directory, task, before):
    try:
        return list(directory.iterdir())
    except OSError as error:
        if isinstance(error, GONE) and same_task(task, before) is None:
            return []
        raise CensusIncomplete(f"Cannot enumerate descriptors or tasks at {directory}") from error


def task_descriptors(task, before, identities, volume, volume_id):
    found = set()
    for fd in list_live(task / "fd", task, before):
        try:
            info = fd.stat()
            if identity(info) not in identities and not deleted_publication(fd, task, info, volume, volume_id):
                continue
            flags_line = next(line for line in (task / "fdinfo" / fd.name)
                              .read_text().splitlines() if line.startswith("flags:"))
            flags = int(flags_line.split()[1], 8)
            access = None if flags & os.O_PATH else flags & os.O_ACCMODE
            found.add((fd.name, identity(info), access))
        except GONE as error:
            if same_task(task, before) is None:
                break
            try:
                # A descriptor can close during a successful enumeration,
                # including the descriptor used to list our own fd directory.
                fd.lstat()
            except GONE:
                continue
            raise CensusIncomplete(f"Live descriptor {fd} could not be classified") from error
        except (OSError, ValueError, StopIteration) as error:
            raise CensusIncomplete(f"Live descriptor {fd} could not be classified") from error
    return found


def group_descriptors(process, identities, volume, volume_id):
    for _ in range(3):
        before = task_state(process)
        if not live_leader(process, before):
            return set()
        task_dir = process / "task"
        scanned = {}
        found = set()
        for task in list_live(task_dir, process, before):
            state = task_state(task)
            if state is not None and state.state not in EXIT_STATES:
                found.update(task_descriptors(task, state, identities, volume, volume_id))
                scanned[task.name] = state.started
        after = same_task(process, before)
        if not live_leader(process, after):
            return found
        current = list_live(task_dir, process, after)
        if len(current) != after.threads or not any(task.name == process.name for task in current):
            continue
        states = [(task.name, task_state(task)) for task in current]
        final = same_task(process, after)
        if not live_leader(process, final):
            return found
        if (final.threads == len(current) and all(
                state is not None and (state.state in EXIT_STATES or scanned.get(name) == state.started)
                for name, state in states)):
            return found
    raise CensusIncomplete(f"Thread visibility for process {process.name} did not stabilize")


def census(volume):
    require_host_procfs()
    volume = volume.resolve(strict=True)
    volume_id = identity(volume.stat())
    identities = publication_identities(volume)
    holders = []
    for process in PROC.iterdir():
        if process.name.isdecimal():
            # Most threads share an fd table. Count the same descriptor
            # identity only once per group, while inspecting each live task.
            found = group_descriptors(process, identities, volume, volume_id)
            holders.extend((int(process.name), access) for _, _, access in found)
    return sorted(holders, key=lambda handle: (handle[0], -1 if handle[1] is None else handle[1]))


def expect_incomplete(check, message):
    try:
        check()
    except CensusIncomplete as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f"Census unexpectedly completed: {message}")


def leader_exit_control(scratch, volume, publication):
    # Keep a real worker and its inherited upload fd alive after pthread_exit
    # in the group leader. Closing stdin ends the worker on every test path.
    program = scratch / "leader-exit"
    source = scratch / "leader-exit.c"
    source.write_text("""
#include <fcntl.h>
#include <pthread.h>
#include <unistd.h>

static void *hold(void *unused) {
    (void)unused;
    char byte;
    return read(STDIN_FILENO, &byte, 1) < 0 ? (void *)1 : 0;
}

int main(int argc, char **argv) {
    pthread_t worker;
    if (argc != 2 || open(argv[1], O_RDWR) < 0
        || pthread_create(&worker, 0, hold, 0) != 0)
        return 1;
    pthread_exit(0);
}
""")
    subprocess.run(["cc", "-pthread", "-o", str(program), str(source)], check=True, timeout=30)
    with subprocess.Popen([str(program), str(publication)], stdin=subprocess.PIPE) as process:
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and process.poll() is None:
                state = task_state(PROC / str(process.pid))
                if state is not None and state.state in EXIT_STATES and state.threads > 1:
                    break
                time.sleep(0.02)
            else:
                raise AssertionError("Synthetic live worker with an exited leader was not observed")
            expect_incomplete(lambda: census(volume), f"Leader {process.pid} exited with live sibling threads")
        finally:
            process.stdin.close()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    assert process.returncode == 0, "Synthetic leader fixture exited unsuccessfully"
    assert census(volume) == []


def census_policy_self_test():
    unrestricted = "21 20 0:9 / /proc rw,nosuid - proc proc rw"
    check_proc_mount(unrestricted)
    expect_incomplete(lambda: check_proc_mount(unrestricted + ",hidepid=2"), "Host procfs is restricted")
    expect_incomplete(lambda: check_proc_mount(unrestricted + ",subset=pid"), "Host procfs is restricted")
    overlay = "\n30 21 0:9 /123 /proc/123/fd ro - proc proc rw"
    expect_incomplete(lambda: check_proc_mount(unrestricted + overlay), "A mount obscures procfs process entries")
    # These controls inject errors and process state. Native procfs semantics
    # are independently exercised by census-self-test on the hosted runner.
    with tempfile.TemporaryDirectory(prefix="recovery-census-policy-") as directory:
        process = Path(directory) / "123"
        process.mkdir()
        state_file = process / "stat"
        fields = [b"0"] * 20
        fields[0], fields[17], fields[19] = b"S", b"1", b"12345"
        state_file.write_bytes(b"123 (fixture ) task) " + b" ".join(fields))
        state = task_state(process)
        assert state == TaskState(b"S", 1, 12345)
        for error in (PermissionError("synthetic permission denial"), FileNotFoundError("synthetic loss")):
            with patch.object(Path, "iterdir", side_effect=error):
                expect_incomplete(lambda: list_live(process / "fd", process, state), "Cannot enumerate")
        fields[19] = b"12346"
        state_file.write_bytes(b"123 (fixture ) task) " + b" ".join(fields))
        expect_incomplete(lambda: same_task(process, state), "Process identity changed")
        fields[0], fields[17] = b"Z", b"2"
        state_file.write_bytes(b"123 (fixture ) task) " + b" ".join(fields))
        expect_incomplete(lambda: group_descriptors(process, set(), process, (0, 0)), "exited with live sibling threads")
        state_file.unlink()
        process.rmdir()
        assert list_live(process / "fd", process, state) == []
    print("Portable procfs policy controls passed: restricted mounts, live inspection errors, PID reuse, leader exit, and task disappearance")


def census_self_test():
    require_host_procfs()
    with tempfile.TemporaryDirectory(prefix="recovery-census-") as directory:
        scratch = Path(directory)
        volume = scratch / "volume"
        uploads = volume / "uploads"
        hero = uploads / ".media/hero"
        hero.mkdir(parents=True)
        db = volume / "blog.db"
        db.touch()
        sidecar = volume / "blog.db-wal"
        ordinary = uploads / "photo.jpg"
        nested = hero / "current-hero.webp"
        removed = uploads / "temporary"
        for file in (sidecar, ordinary, nested, removed):
            file.touch()
        controls = ((db, os.O_RDWR), (sidecar, os.O_RDWR), (ordinary, os.O_WRONLY),
                    (nested, os.O_RDONLY), (uploads, os.O_RDONLY | os.O_DIRECTORY),
                    (removed, os.O_RDWR))
        for entry, mode in controls:
            fd = os.open(entry, mode)
            try:
                if entry == removed:
                    entry.unlink()
                assert census(volume) == [(os.getpid(), mode & os.O_ACCMODE)], entry.name
            finally:
                os.close(fd)
            assert census(volume) == [], entry.name
        unrelated = scratch / "unrelated"
        unrelated.touch()
        with unrelated.open("rb"):
            assert census(volume) == []
        real_iterdir = Path.iterdir
        own_fd_dir = PROC / str(os.getpid()) / "task" / str(os.getpid()) / "fd"
        with ordinary.open("r+b"):
            for error in (PermissionError("synthetic permission denial"), FileNotFoundError("synthetic loss")):
                def interrupted_listing(directory):
                    if directory == own_fd_dir:
                        raise error
                    return real_iterdir(directory)

                with patch.object(Path, "iterdir", interrupted_listing):
                    expect_incomplete(lambda: census(volume), f"Cannot enumerate descriptors or tasks at {own_fd_dir}")
        assert census(volume) == []
        leader_exit_control(scratch, volume, ordinary)
        link = uploads / "outside"
        link.symlink_to(unrelated)
        try:
            census(volume)
        except ValueError as error:
            assert str(error) == "Unexpected file type or mount in publication tree"
        else:
            raise AssertionError("Publication census accepted a symlink")
    print("Linux census controls passed: 6 relevant handles, unrelated handle, 2 injected enumeration errors, "
          "real leader exit, symlink, and post-close checks")


def volume_tree(volume):
    entries = [volume, *sorted(volume.rglob("*"))]
    counts = {"files": 0, "directories": 0, "logicalBytes": 0, "allocatedBytes": 0}
    for entry in entries:
        info = entry.lstat()
        if stat.S_ISDIR(info.st_mode):
            counts["directories"] += 1
        elif stat.S_ISREG(info.st_mode):
            counts["files"] += 1
            counts["logicalBytes"] += info.st_size
        else:
            raise ValueError("Unexpected non-file/non-directory in disposable data")
        counts["allocatedBytes"] += info.st_blocks * 512
    return counts


def digest(file):
    with file.open("rb") as stream:
        result = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


def require_digest(file, expected, label):
    if digest(file) != expected:
        raise ValueError(label + " checksum mismatch")


def expect_truncated(original):
    with original.open("rb") as source:
        prefix = source.read(128)
        if len(prefix) != 128 or not source.read(1):
            raise ValueError("Expected a complete source archive longer than 128 bytes")
    with tempfile.TemporaryDirectory(prefix="recovery-archive-") as directory:
        truncated = Path(directory) / "truncated.tar.gz"
        truncated.write_bytes(prefix)
        try:
            archive_check(truncated)
        except EOFError:
            print("Truncated gzip rejected at the archive validator")
        else:
            raise AssertionError("Truncated gzip archive was accepted")


def uploads_inventory(volume):
    root = volume / "uploads"
    entries = []
    for entry in sorted(root.rglob("*")):
        info = entry.lstat()
        name = entry.relative_to(root).as_posix()
        if stat.S_ISDIR(info.st_mode):
            entries.append([name, "directory"])
        elif stat.S_ISREG(info.st_mode):
            entries.append([name, info.st_size, digest(entry)])
        else:
            raise ValueError("Unexpected entry in uploads inventory")
    return entries


def check_private(volume):
    for entry in (volume, *volume.rglob("*")):
        info = entry.lstat()
        if stat.S_ISDIR(info.st_mode):
            expected = 0o700
        elif stat.S_ISREG(info.st_mode):
            expected = 0o600
        else:
            raise ValueError("Unexpected entry in restored volume")
        if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (1001, 1001, expected):
            raise ValueError("Unexpected restored ownership or mode")
    print("Volume ownership and private modes verified")


def self_test():
    census_policy_self_test()

    def fixture(name, kind=tarfile.REGTYPE):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode="w") as archive:
            root = tarfile.TarInfo("uploads")
            root.type = tarfile.DIRTYPE
            archive.addfile(root)
            member = tarfile.TarInfo(name)
            member.type = kind
            archive.addfile(member)
        stream.seek(0)
        return tarfile.open(fileobj=stream, mode="r")

    with fixture("uploads/example.webp") as archive:
        members(archive)
    # In-memory records only. Extraction is never attempted.
    for name, kind in (("/synthetic-example", tarfile.REGTYPE),
                       ("uploads/example", tarfile.SYMTYPE),
                       ("uploads/hardlink", tarfile.LNKTYPE)):
        with fixture(name, kind) as archive:
            try:
                members(archive)
            except ValueError as error:
                assert str(error) == "Unsafe backup archive member"
                continue
            raise AssertionError("Unsafe backup metadata was accepted")
    with tempfile.TemporaryDirectory(prefix="recovery-checksums-") as directory:
        for label in ("Backup artifact", "Restored database"):
            file = Path(directory) / "synthetic"
            file.write_bytes(b"expected")
            expected = digest(file)
            require_digest(file, expected, label)
            file.write_bytes(b"modified")
            try:
                require_digest(file, expected, label)
            except ValueError as error:
                assert str(error) == label + " checksum mismatch"
            else:
                raise AssertionError("Modified synthetic file passed " + label + " verification")
    print("Archive metadata (absolute member, symlink, hardlink) and source/target digest controls passed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("archive", "archive-truncation", "census", "census-self-test",
                                             "tree", "db-digest", "verify-digest", "uploads", "private", "self-test"))
    parser.add_argument("path", nargs="?", type=Path)
    parser.add_argument("expected", nargs="?")
    parser.add_argument("label", nargs="?")
    args = parser.parse_args()
    if args.mode == "self-test":
        self_test()
    elif args.mode == "archive":
        archive_check(args.path)
    elif args.mode == "archive-truncation":
        expect_truncated(args.path)
    elif args.mode == "census-self-test":
        census_self_test()
    elif args.mode == "verify-digest":
        require_digest(args.path, args.expected, args.label)
    elif args.mode == "census":
        try:
            print(json.dumps(census(args.path)))
        except (CensusIncomplete, OSError, ValueError, IndexError, StopIteration) as error:
            print(f"Incomplete Linux handle census: {error}", file=sys.stderr)
            return 2
    elif args.mode == "tree":
        print(json.dumps(volume_tree(args.path)))
    elif args.mode == "db-digest":
        print(digest(args.path / "blog.db"))
    elif args.mode == "uploads":
        print(json.dumps(uploads_inventory(args.path)))
    else:
        check_private(args.path)


if __name__ == "__main__":
    raise SystemExit(main())
