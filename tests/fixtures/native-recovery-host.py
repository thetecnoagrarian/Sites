"""Host-side checks for the disposable Linux recovery rehearsal."""
import argparse
from contextlib import contextmanager
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import tempfile
import tarfile
import time
from typing import NamedTuple
from unittest.mock import Mock, patch


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


DB_CATEGORIES = {"blog.db": "database", "blog.db-wal": "wal", "blog.db-shm": "shm", "blog.db-journal": "journal"}


def identity(info):
    return info.st_dev, info.st_ino


def publication_identities(volume, categorize=None):
    """Collect current inodes without traversing symlinks or other filesystems."""
    volume_stat = volume.stat()
    device = volume_stat.st_dev
    entries = {identity(volume_stat): categorize(Path(".")) if categorize else "volume-root"}

    def add(entry, category):
        info = entry.lstat()
        if (info.st_dev != device
                or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode))):
            raise ValueError("Unexpected file type or mount in publication tree")
        inode = identity(info)
        value = categorize(entry.relative_to(volume)) if categorize else category
        prior = entries.setdefault(inode, value)
        if categorize and prior != value:
            entries[inode] = ("publication-other", None)

    def walk_error(error):
        raise error

    for name, category in DB_CATEGORIES.items():
        try:
            add(volume / name, category)
        except FileNotFoundError:
            if name == "blog.db":
                raise
    root = volume / "uploads"
    add(root, "uploads")
    for directory, subdirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        for name in (*subdirs, *files):
            add(Path(directory) / name, "uploads")
    return entries


def publication_category(relative):
    if relative.parts[:1] == ("uploads",):
        return "uploads"
    if len(relative.parts) == 1:
        return DB_CATEGORIES.get(relative.name)
    return None


def deleted_publication(fd, proc, info, volume, volume_id):
    # A deleted inode vanishes from the walk. Use its kernel-reported path only
    # on the volume's device and, for the container alias, verify the bind root.
    if info.st_dev != volume_id[0]:
        return None
    target = os.readlink(fd)
    if not target.endswith(" (deleted)"):
        return None
    deleted = Path(target.removesuffix(" (deleted)"))
    if deleted.is_relative_to(volume):
        return publication_category(deleted.relative_to(volume))
    alias = Path("/app/data")
    if deleted.is_relative_to(alias):
        category = publication_category(deleted.relative_to(alias))
        if category and identity((proc / "root/app/data").stat()) == volume_id:
            return category
    return None


PROC = Path("/proc")
EXIT_STATES = {b"Z", b"X", b"x"}
GONE = (FileNotFoundError, ProcessLookupError)


class CensusIncomplete(RuntimeError):
    """A live task or the procfs view could not be classified."""


class CensusUnstable(CensusIncomplete):
    """Observed membership changed and a fresh sweep is required."""


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


def volume_relative(target, task, volume, volume_id):
    path = Path(target)
    alias = Path("/app/data")
    if path.is_relative_to(volume):
        relative = path.relative_to(volume)
    elif path.is_relative_to(alias) and identity((task / "root/app/data").stat()) == volume_id:
        relative = path.relative_to(alias)
    else:
        return None
    if ".." in relative.parts:
        raise CensusIncomplete("Invalid descriptor path in publication volume")
    return relative


def volume_entry(volume, volume_id, relative):
    # Walk from the known mount through directory FDs without following
    # symlinks or crossing filesystem devices.
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directory = os.open(volume, flags)
    try:
        if identity(os.fstat(directory)) != volume_id:
            raise CensusIncomplete("Publication volume root changed")
        for name in relative.parts[:-1]:
            child = os.open(name, flags, dir_fd=directory)
            os.close(directory)
            directory = child
            if os.fstat(directory).st_dev != volume_id[0]:
                raise CensusIncomplete("Descriptor path crossed a filesystem")
        return (os.stat(relative.name, dir_fd=directory, follow_symlinks=False)
                if relative.parts else os.fstat(directory))
    finally:
        os.close(directory)


def diagnostic_fdinfo(task, fd, inode):
    fields = dict(line.split(":", 1) for line in (task / "fdinfo" / fd.name).read_text().splitlines() if ":" in line)
    if "flags" not in fields:
        raise CensusIncomplete("Descriptor status is incomplete")
    if "ino" in fields and int(fields["ino"]) != inode[1]:
        raise CensusIncomplete("Descriptor inode changed during inspection")
    return int(fields["flags"], 8), fields.get("mnt_id")


def diagnostic_descriptor(fd, task, info, identities, volume, volume_id, categorize):
    inode = identity(info)
    if info.st_dev != volume_id[0]:
        return None
    target = os.readlink(fd)
    relative = volume_relative(target, task, volume, volume_id)
    deleted = info.st_nlink == 0
    if target.endswith(" (deleted)") and relative is not None:
        try:
            literal = volume_entry(volume, volume_id, relative)
        except FileNotFoundError:
            literal = None
        if literal is None or identity(literal) != inode:
            relative = volume_relative(target.removesuffix(" (deleted)"), task, volume, volume_id)
            deleted = True
        else:
            raise CensusIncomplete("Linked descriptor has an ambiguous deleted suffix")
    category = categorize(relative) if relative is not None else None
    if category is None:
        if inode not in identities:
            if identity(fd.stat()) != inode or os.readlink(fd) != target:
                raise CensusIncomplete("Descriptor changed before publication membership was ruled out")
            return None
        if not deleted and target.endswith(" (deleted)"):
            raise CensusIncomplete("Descriptor deletion cannot be verified outside the publication mount")
        category = ("publication-other", None)
    elif not deleted:
        entry = volume_entry(volume, volume_id, relative)
        if identity(entry) != inode or stat.S_IFMT(entry.st_mode) != stat.S_IFMT(info.st_mode):
            raise CensusIncomplete("Publication descriptor path identity changed")
    flags, mount = diagnostic_fdinfo(task, fd, inode)
    confirmed = fd.stat()
    if (identity(confirmed) != inode or confirmed.st_nlink != info.st_nlink
            or stat.S_IFMT(confirmed.st_mode) != stat.S_IFMT(info.st_mode)
            or os.readlink(fd) != target or diagnostic_fdinfo(task, fd, inode) != (flags, mount)):
        raise CensusIncomplete("Descriptor changed during diagnostic inspection")
    kind = descriptor_kind(info)
    if kind == "directory":
        category = (category[0], None)
    access = None if flags & os.O_PATH else flags & os.O_ACCMODE
    return (fd.name, inode, access), (category, kind, deleted)


def diagnostic_slot_exists(fd):
    try:
        fd.lstat()
    except GONE:
        return False
    except OSError:
        raise CensusIncomplete("Live descriptor metadata could not be classified") from None
    return True


def descriptor_slots(task, before):
    slots = []
    for fd in list_live(task / "fd", task, before):
        if not fd.name.isdecimal():
            raise CensusIncomplete("Invalid descriptor number")
        if diagnostic_slot_exists(fd):
            slots.append(fd)
        else:
            # Listing our own FD directory can expose the short-lived FD used
            # by the iterator. Only retain entries still visible afterwards.
            same_task(task, before)
    return sorted(slots, key=lambda fd: int(fd.name))


def task_descriptors(task, before, identities, volume, volume_id, categorize=None, leader_started=None, table=None):
    found = {}
    slots = descriptor_slots(task, before) if categorize else list_live(task / "fd", task, before)
    for fd in slots:
        try:
            info = fd.stat()
            if categorize:
                entry = diagnostic_descriptor(fd, task, info, identities, volume, volume_id, categorize)
                if entry is not None:
                    key, value = entry
                    found[key] = (*value, leader_started)
                continue
            inode = identity(info)
            category = identities.get(inode) or deleted_publication(fd, task, info, volume, volume_id)
            if category is None:
                continue
            flags_line = next(line for line in (task / "fdinfo" / fd.name)
                              .read_text().splitlines() if line.startswith("flags:"))
            flags = int(flags_line.split()[1], 8)
            access = None if flags & os.O_PATH else flags & os.O_ACCMODE
            found[(fd.name, inode, access)] = category
        except GONE as error:
            current = same_task(task, before)
            if current is None or (categorize and current.state in EXIT_STATES):
                break
            if categorize:
                if not diagnostic_slot_exists(fd):
                    if same_task(task, before) is not None and diagnostic_slot_exists(fd):
                        raise CensusIncomplete("Descriptor number reappeared during inspection") from error
                    continue
            else:
                try:
                    fd.lstat()
                except GONE:
                    continue
            raise CensusIncomplete(f"Live descriptor {fd} could not be classified") from error
        except (OSError, ValueError, StopIteration) as error:
            raise CensusIncomplete(f"Live descriptor {fd} could not be classified") from error
    if categorize:
        after = same_task(task, before)
        if after is None or after.state in EXIT_STATES or descriptor_slots(task, after) != slots:
            raise CensusUnstable("Descriptor table membership changed")
        if table is not None:
            table[task.name] = (before.started, tuple(fd.name for fd in slots))
    return found


def group_descriptors(process, identities, volume, volume_id, categorize=None, tables=None):
    for _ in range(3):
        before = task_state(process)
        if not live_leader(process, before):
            return {}
        task_dir = process / "task"
        scanned = {}
        found = {}
        current_tables = {} if categorize else None
        for task in list_live(task_dir, process, before):
            state = task_state(task)
            if state is not None and state.state not in EXIT_STATES:
                entries = task_descriptors(task, state, identities, volume, volume_id,
                                           categorize, before.started, current_tables)
                if categorize and scanned and found != entries:
                    # Procfs alone does not establish whether these tasks
                    # share a table. Do not union conflicting observations.
                    raise CensusUnstable("Publication FD table differed between sibling tasks")
                found.update(entries)
                scanned[task.name] = state.started
            elif categorize and state is not None:
                current_tables[task.name] = (state.started, None)
            elif categorize:
                raise CensusUnstable("Task membership changed during descriptor census")
        after = same_task(process, before)
        if not live_leader(process, after):
            if categorize:
                raise CensusUnstable("Process exited during descriptor census")
            return found
        current = list_live(task_dir, process, after)
        if len(current) != after.threads or not any(task.name == process.name for task in current):
            continue
        states = [(task.name, task_state(task)) for task in current]
        final = same_task(process, after)
        if not live_leader(process, final):
            if categorize:
                raise CensusUnstable("Process exited during descriptor census")
            return found
        if (final.threads == len(current) and all(
                state is not None and (state.state in EXIT_STATES or scanned.get(name) == state.started)
                for name, state in states)):
            if categorize:
                observed = {name: (state.started, state.state in EXIT_STATES) for name, state in states}
                expected = {name: (started, slots is None) for name, (started, slots) in current_tables.items()}
                if observed != expected:
                    raise CensusUnstable("Task membership changed during descriptor census")
                if tables is not None:
                    tables.update(current_tables)
            return found
    raise CensusIncomplete(f"Thread visibility for process {process.name} did not stabilize")


def diagnostic_sweep(volume, volume_id, categorize):
    def processes():
        return sorted((p for p in PROC.iterdir() if p.name.isdecimal()), key=lambda p: int(p.name))

    before = processes()
    identities = publication_identities(volume, categorize)
    snapshot = {}
    for process in before:
        state = task_state(process)
        if state is None:
            raise CensusUnstable("Process membership changed during descriptor census")
        live = live_leader(process, state)
        tables = {}
        found = group_descriptors(process, identities, volume, volume_id, categorize, tables) if live else {}
        final = same_task(process, state)
        if final is None or live_leader(process, final) != live:
            raise CensusUnstable("Process membership changed during descriptor census")
        snapshot[int(process.name)] = (state.started, live, tables, found)
    if processes() != before or publication_identities(volume, categorize) != identities:
        raise CensusUnstable("Process membership or publication volume changed")
    return identities, snapshot


def census_groups(volume, categorize=None, *, deadline=None):
    require_host_procfs()
    volume = volume.resolve(strict=True)
    volume_id = identity(volume.stat())
    if categorize:
        previous = None
        for _ in range(4):
            if deadline is not None:
                remaining_time(deadline, "observation-timeout")
            try:
                observed = diagnostic_sweep(volume, volume_id, categorize)
            except CensusUnstable:
                if deadline is not None:
                    remaining_time(deadline, "observation-timeout")
                previous = None
                continue
            if deadline is not None:
                remaining_time(deadline, "observation-timeout")
            if observed == previous:
                for pid, (_, _, _, found) in observed[1].items():
                    yield pid, found
                return
            previous = observed
        raise CensusUnstable("Descriptor census did not stabilize")
    identities = publication_identities(volume, categorize)
    for process in PROC.iterdir():
        if process.name.isdecimal():
            # Most threads share an fd table. Count the same descriptor
            # identity only once per group, while inspecting each live task.
            yield int(process.name), group_descriptors(process, identities, volume, volume_id, categorize)


def census(volume, *, detailed=False):
    holders = [(pid, access, category) for pid, found in census_groups(volume)
               for (_, _, access), category in found.items()]
    holders.sort(key=lambda handle: (handle[0], -1 if handle[1] is None else handle[1], handle[2]))
    return holders if detailed else [(pid, access) for pid, access, _ in holders]


class DiagnosticError(RuntimeError):
    """Fixed, safe reason for an unavailable lifetime observation."""


MILESTONES = ("article-receipt", "hero-redirect", "hero-receipt")
IDLE_SECONDS = (0, 0.25, 1, 3, 10)
IDLE_STAGES = ("idle-0", "idle-250ms", "idle-1s", "idle-3s", "idle-10s")
STAGES = ("startup", *MILESTONES, "publication-complete", *IDLE_STAGES, "after-stop", "after-removal")
STOP_STAGES = {"after-stop", "after-removal"}
DIAGNOSTIC_ROWS = 32
DIAGNOSTIC_BYTES = 16384
SCAN_TIMEOUT = 5
FIXTURE_TIMEOUT = 180
FINGERPRINT = re.compile(r"[0-9a-f]{64}")
OPAQUE_ID = re.compile(r"[0-9a-f]{32}")
ACCESS = {None: "path-only", os.O_RDONLY: "read-only", os.O_WRONLY: "write-only", os.O_RDWR: "read-write"}
CATEGORIES = {*DB_CATEGORIES.values(), "volume-root", "hero", "gallery", "post-media", "temporary-upload",
              "other-uploads", "publication-other"}
HERO_ROLES = {"current-hero.webp": "display-derivative", "current-hero-og.webp": "social-derivative"}


def descriptor_kind(info):
    if stat.S_ISREG(info.st_mode):
        return "file"
    if stat.S_ISDIR(info.st_mode):
        return "directory"
    raise CensusIncomplete("Unrecognized publication descriptor type")


def diagnostic_category(relative, gallery):
    parts = relative.parts
    category = publication_category(relative)
    if not parts:
        return "volume-root", None
    if category != "uploads":
        return (category, None) if category else None
    if parts[:3] == ("uploads", ".media", "hero") or parts[:2] == ("uploads", "hero"):
        return "hero", HERO_ROLES.get(relative.name)
    if parts[:3] == ("uploads", ".media", "post"):
        # Gallery and highlight derivatives share the post store. The fixture
        # supplies fingerprints of only the gallery members it just published.
        gallery_member = len(parts) > 3 and hashlib.sha256(os.fsencode(parts[3])).hexdigest() in gallery
        return ("gallery" if gallery_member else "post-media"), None
    return ("temporary-upload" if parts[:2] == ("uploads", "temp") else "other-uploads"), None


def opaque_id(salt, *parts):
    return hashlib.blake2b(repr(parts).encode("ascii"), key=salt, digest_size=16).hexdigest()


def valid_opaque_id(value):
    return isinstance(value, str) and OPAQUE_ID.fullmatch(value) is not None


def lifetime_rows(groups, salt):
    rows = []
    total = 0
    for pid, found in groups:
        for (fd, inode, access), ((category, role), kind, deleted, started) in found.items():
            if access not in ACCESS:
                raise CensusIncomplete("Unrecognized publication descriptor access mode")
            total += 1
            if len(rows) < DIAGNOSTIC_ROWS:
                rows.append({"pid": pid, "process": opaque_id(salt, pid, started),
                             "descriptor": opaque_id(salt, pid, started, fd, inode, access),
                             "category": category, "role": role, "kind": kind, "access": ACCESS[access], "deleted": deleted})
    rows.sort(key=lambda row: (row["pid"], row["descriptor"]))
    return {"total": total, "omitted": total - len(rows), "rows": rows}


def check_gallery(gallery):
    if (not isinstance(gallery, list) or len(gallery) != 65
            or any(not isinstance(item, str) or not FINGERPRINT.fullmatch(item) for item in gallery)
            or len(set(gallery)) != len(gallery)):
        raise DiagnosticError("invalid-gallery-membership")
    return gallery


def require_marker(payload, run, seq, stage):
    marker = decode_report(payload, "invalid-milestone")
    fields = {"run", "seq", "stage", "nonce"}
    expected = fields | {"gallery"} if stage == MILESTONES[0] else fields
    if (not isinstance(marker, dict) or marker.keys() != expected or marker["run"] != run
            or type(marker["seq"]) is not int or marker["seq"] != seq or marker["stage"] != stage
            or not valid_opaque_id(marker["nonce"])):
        raise DiagnosticError("invalid-milestone")
    ack = {key: marker[key] for key in ("run", "seq", "stage", "nonce")}
    gallery = check_gallery(marker["gallery"]) if "gallery" in marker else None
    return ack, gallery


def decode_report(payload, reason="invalid-observation-report"):
    def unique_keys(pairs):
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise ValueError("Duplicate JSON key")
        return fields

    def invalid_constant(_):
        raise ValueError("Invalid JSON constant")

    if len(payload) <= DIAGNOSTIC_BYTES:
        try:
            return json.loads(payload, object_pairs_hook=unique_keys, parse_constant=invalid_constant)
        except (ValueError, RecursionError):
            pass
    raise DiagnosticError(reason)


def read_rows(rows):
    fields = {"pid", "process", "descriptor", "category", "role", "kind", "access", "deleted"}
    if not isinstance(rows, list) or len(rows) > DIAGNOSTIC_ROWS:
        raise DiagnosticError("invalid-observation-report")
    seen = set()
    for row in rows:
        if (not isinstance(row, dict) or row.keys() != fields
                or type(row["pid"]) is not int or not 0 < row["pid"] < 2**31
                or not all(valid_opaque_id(row[key]) for key in ("process", "descriptor"))
                or not isinstance(row["category"], str) or row["category"] not in CATEGORIES
                or (row["role"] is not None and (
                    row["category"] != "hero" or row["kind"] != "file" or row["role"] not in tuple(HERO_ROLES.values())))
                or row["kind"] not in ("file", "directory") or row["access"] not in tuple(ACCESS.values())
                or type(row["deleted"]) is not bool or row["descriptor"] in seen):
            raise DiagnosticError("invalid-observation-report")
        seen.add(row["descriptor"])
    return rows


def clock_ns():
    # Use the same host epoch in the controller and its scanner subprocess.
    return time.clock_gettime_ns(time.CLOCK_MONOTONIC)


def clock():
    return clock_ns() / 1e9


def remaining_time(deadline, reason):
    remaining = deadline - clock()
    if remaining <= 0:
        raise DiagnosticError(reason)
    return remaining


def write_line(stream, payload, deadline, timeout):
    if len(payload) + 1 > DIAGNOSTIC_BYTES:
        raise DiagnosticError("observation-output-limit")
    fd = stream.fileno()
    pending = memoryview(payload + b"\n")
    was_blocking = os.get_blocking(fd)
    os.set_blocking(fd, False)
    try:
        # SelectSelector also supports regular-file output in local tests.
        with selectors.SelectSelector() as selector:
            selector.register(fd, selectors.EVENT_WRITE)
            while pending:
                if not selector.select(remaining_time(deadline, timeout)):
                    raise DiagnosticError(timeout)
                remaining_time(deadline, timeout)
                try:
                    pending = pending[os.write(fd, pending):]
                except BlockingIOError:
                    continue
        remaining_time(deadline, timeout)
    finally:
        os.set_blocking(fd, was_blocking)


def lifetime_error(reason):
    try:
        write_line(sys.stderr, f"FFG lifetime observation failed: {reason}".encode("ascii"),
                   clock() + 0.25, "diagnostic-error-delivery-timeout")
    except (DiagnosticError, OSError):
        pass


@contextmanager
def bounded_child(command, *, stdin):
    # Avoid Popen.__exit__, which calls wait() without a timeout. An owned
    # process group also allows pipe-holding descendants to be terminated.
    child = subprocess.Popen(command, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             bufsize=0, start_new_session=True)
    try:
        yield child
    finally:
        try:
            if child.returncode is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    child.kill()
        finally:
            for stream in (child.stdin, child.stdout):
                if stream is not None:
                    stream.close()
            try:
                child.wait(timeout=1)
            except subprocess.TimeoutExpired as error:
                raise DiagnosticError("diagnostic-child-cleanup-timeout") from error


def bounded_line(stream, deadline, timeout, invalid):
    # Both children send one message at a time. Reject oversized or surplus
    # bytes while reading and never copy child output to the logs.
    pending = bytearray()
    with selectors.DefaultSelector() as selector:
        selector.register(stream, selectors.EVENT_READ)
        while True:
            if not selector.select(remaining_time(deadline, timeout)):
                raise DiagnosticError(timeout)
            chunk = os.read(stream.fileno(), DIAGNOSTIC_BYTES + 1 - len(pending))
            if not chunk:
                if pending:
                    raise DiagnosticError(invalid)
                return None
            pending.extend(chunk)
            if len(pending) > DIAGNOSTIC_BYTES or b"\n" in pending[:-1]:
                raise DiagnosticError(invalid)
            if pending.endswith(b"\n"):
                return bytes(pending[:-1])


def lifetime_publish(container, run, sample):
    command = ["docker", "exec", "-i", container, "node", "/recovery.mjs", "publish", "ffg", "--observe-lifetime", run]
    exchange_milestones(command, run, sample, FIXTURE_TIMEOUT)


def wait_child(child, deadline, reason):
    try:
        return child.wait(timeout=remaining_time(deadline, reason))
    except subprocess.TimeoutExpired as error:
        raise DiagnosticError(reason) from error


def exchange_milestones(command, run, sample, seconds):
    deadline = clock() + seconds
    timeout = "milestone-timeout"
    with bounded_child(command, stdin=subprocess.PIPE) as child:
        nonces = set()
        for seq, stage in enumerate(MILESTONES, start=1):
            line = bounded_line(child.stdout, deadline, timeout, "invalid-milestone")
            if line is None:
                reason = "publication-fixture-failed" if wait_child(child, deadline, timeout) else "missing-milestone"
                raise DiagnosticError(reason)
            ack, gallery = require_marker(line, run, seq, stage)
            if ack["nonce"] in nonces:
                raise DiagnosticError("duplicate-milestone-nonce")
            nonces.add(ack["nonce"])
            sample(stage, gallery=gallery, deadline=deadline)
            remaining_time(deadline, timeout)
            try:
                write_line(child.stdin, json.dumps(ack, separators=(",", ":")).encode("ascii"), deadline, timeout)
            except BrokenPipeError as error:
                reason = "publication-fixture-failed" if wait_child(child, deadline, timeout) else "ack-channel-closed"
                raise DiagnosticError(reason) from error
        child.stdin.close()
        if bounded_line(child.stdout, deadline, timeout, "invalid-milestone") is not None:
            raise DiagnosticError("unexpected-milestone")
        if wait_child(child, deadline, timeout):
            raise DiagnosticError("publication-fixture-failed")


def require_shutdown_rows(total):
    if total:
        raise DiagnosticError("surviving-publication-descriptors")


def observation_request(run, stage, deadline):
    return {"run": run, "seq": STAGES.index(stage) + 1, "stage": stage, "nonce": secrets.token_hex(16),
            "requested_ns": clock_ns(), "deadline_ns": int(deadline * 1e9)}


def valid_observation_request(request):
    return (isinstance(request, dict) and request.keys() == {"run", "seq", "stage", "nonce", "requested_ns", "deadline_ns"}
            and valid_opaque_id(request["run"]) and valid_opaque_id(request["nonce"])
            and request["stage"] in STAGES and type(request["seq"]) is int
            and request["seq"] == STAGES.index(request["stage"]) + 1
            and type(request["requested_ns"]) is int and type(request["deadline_ns"]) is int
            and 0 <= request["requested_ns"] < request["deadline_ns"])


def read_scan(payload, expected):
    report = decode_report(payload)
    if (not isinstance(report, dict)
            or report.keys() != {"request", "start", "end", "application", "total", "omitted", "rows"}
            or not valid_observation_request(report["request"])
            or type(report["start"]) is not int or type(report["end"]) is not int
            or type(report["total"]) is not int or type(report["omitted"]) is not int
            or not 0 <= report["omitted"] <= report["total"]
            or (report["application"] is not None and not valid_opaque_id(report["application"]))):
        raise DiagnosticError("invalid-observation-report")
    if report["request"] != expected:
        raise DiagnosticError("observation-request-mismatch")
    now = clock_ns()
    if now >= expected["deadline_ns"] or report["end"] >= expected["deadline_ns"]:
        raise DiagnosticError("observation-timeout")
    if not expected["requested_ns"] <= report["start"] <= report["end"] <= now:
        raise DiagnosticError("invalid-observation-timing")
    rows = read_rows(report["rows"])
    if len(rows) != min(DIAGNOSTIC_ROWS, report["total"]) or len(rows) + report["omitted"] != report["total"]:
        raise DiagnosticError("invalid-observation-report")
    return report


def observation_report(stage, scan, state, idle):
    started, ended, rows = scan["start"], scan["end"], scan["rows"]
    elapsed = round((started - state["start"]) / 1e6, 3)
    for row in rows:
        observed = {"stage": stage, "elapsed_ms": elapsed}
        first = state["history"].setdefault(row["descriptor"], observed)
        app_holder = row["pid"] == state["pid"] and row["process"] == state["application"]
        row.update(first=first, last=observed, observed_again=first != observed,
                   holder="application" if app_holder else "unexpected")
    report = {"site": "ffg", "stage": stage, "elapsed_ms": elapsed,
              "scan_ms": round((ended - started) / 1e6, 3), "total": scan["total"], "omitted": scan["omitted"],
              "complete": scan["omitted"] == 0, "rows": rows}
    if idle:
        report.update(idle_target_ms=idle[0], idle_elapsed_ms=round((started - idle[1]) / 1e6, 3))
    encoded = json.dumps(report, separators=(",", ":"))
    if len(encoded) > DIAGNOSTIC_BYTES:
        raise DiagnosticError("observation-output-limit")
    return encoded


def run_lifetime_scan(volume, request, deadline):
    timeout = "observation-timeout"
    budget = min(SCAN_TIMEOUT, remaining_time(deadline, timeout))
    command = ["sudo", "-n", "timeout", "--foreground", "-k", "1s", f"{budget:.9f}s", "python3",
               __file__, "lifetime-scan", str(volume)]
    # The request is bounded synthetic metadata. A regular input file avoids
    # a blocking pipe write while the scanner is starting under sudo.
    with tempfile.TemporaryFile() as source:
        source.write(request)
        source.seek(0)
        with bounded_child(command, stdin=source) as child:
            line = bounded_line(child.stdout, deadline, timeout, "invalid-observation-report")
            if line is not None and bounded_line(child.stdout, deadline, timeout, "invalid-observation-report") is not None:
                raise DiagnosticError("invalid-observation-report")
            status = wait_child(child, deadline, timeout)
            if status:
                reason = {2: "incomplete-procfs", 3: "unstable-descriptor-census", 4: "application-identity-unverified",
                          124: timeout, 137: timeout}.get(status, "classification-failed")
                raise DiagnosticError(reason)
            if line is None:
                raise DiagnosticError("invalid-observation-report")
            return line


def lifetime_command(action, state_file, volume=None, argument=None):
    if action == "init":
        if not re.fullmatch(r"[1-9][0-9]{0,9}", argument) or int(argument) >= 2**31:
            raise DiagnosticError("invalid-application-pid")
        with state_file.open("x") as stream:
            json.dump({"salt": secrets.token_hex(32), "run": secrets.token_hex(16), "start": clock_ns(),
                       "pid": int(argument), "application": None,
                       "gallery": [], "history": {}}, stream)
        return
    state = json.loads(state_file.read_text())

    def sample(stage, *, gallery=None, idle=None, deadline=None):
        assert stage in STAGES
        if gallery is not None:
            state["gallery"] = gallery
        try:
            scan_deadline = clock() + SCAN_TIMEOUT + 3
            if deadline is not None:
                scan_deadline = min(deadline, scan_deadline)
            remaining_time(scan_deadline, "observation-timeout")
            expected = observation_request(state["run"], stage, scan_deadline)
            request = {key: state[key] for key in ("salt", "gallery", "pid", "application")}
            request["request"] = expected
            raw = run_lifetime_scan(volume, json.dumps(request).encode("ascii"), scan_deadline)
            scan = read_scan(raw, expected)
            updated = state | {"history": state["history"].copy()}
            if stage == "startup":
                updated["application"] = scan["application"]
                if updated["application"] is None:
                    raise DiagnosticError("application-identity-unverified")
            elif scan["application"] != (None if stage in STOP_STAGES else state["application"]):
                raise DiagnosticError("application-identity-unverified")
            report = observation_report(stage, scan, updated, idle)
            serialized = json.dumps(updated)
            write_line(sys.stdout, report.encode("ascii"), scan_deadline, "observation-output-timeout")
            state_file.write_text(serialized)
            remaining_time(scan_deadline, "observation-timeout")
            state.update(updated)
            if scan["omitted"]:
                raise DiagnosticError("observation-rows-omitted")
            if stage in STOP_STAGES:
                require_shutdown_rows(scan["total"])
        except DiagnosticError as error:
            raise DiagnosticError(f"{stage}: {error}") from error

    if action == "publish":
        lifetime_publish(argument, state["run"], sample)
    elif action == "idle":
        idle_start = clock_ns()
        failed = False
        for stage, target in zip(IDLE_STAGES, IDLE_SECONDS):
            time.sleep(max(0, target - (clock_ns() - idle_start) / 1e9))
            try:
                sample(stage, idle=(int(target * 1000), idle_start))
            except DiagnosticError as error:
                lifetime_error(str(error))
                failed = True
        if failed:
            raise DiagnosticError("idle-observations-incomplete")
    elif action == "sample" and argument in STAGES:
        sample(argument)
    else:
        raise DiagnosticError("unknown-observation-action")


def scan_application(pid, salt, expected, stage, volume, scan):
    process = PROC / str(pid)

    def identify():
        state = task_state(process)
        if not live_leader(process, state):
            return None
        if stage == "startup":
            # Bind the initial PID identity to the app's isolated data mount
            # before treating that identity as the expected holder.
            try:
                mounted = identity((process / "root/app/data").stat()) == identity(volume.stat())
            except OSError as error:
                raise DiagnosticError("application-identity-unverified") from error
            if not mounted or not live_leader(process, same_task(process, state)):
                raise DiagnosticError("application-identity-unverified")
        return opaque_id(salt, pid, state.started)

    before = identify()
    stopped = stage in STOP_STAGES
    if ((stopped and (expected is None or expected == before))
            or (not stopped and (before is None or (stage != "startup" and before != expected)))):
        raise DiagnosticError("application-identity-unverified")
    result = scan()
    if identify() != before:
        raise DiagnosticError("application-identity-unverified")
    return result | {"application": None if stopped else before}


def lifetime_scan(volume):
    request = decode_report(sys.stdin.buffer.read(DIAGNOSTIC_BYTES + 1))
    if (not isinstance(request, dict) or request.keys() != {"salt", "gallery", "pid", "application", "request"}
            or not isinstance(request["salt"], str) or not FINGERPRINT.fullmatch(request["salt"])
            or type(request["pid"]) is not int or not 0 < request["pid"] < 2**31
            or not valid_observation_request(request["request"])
            or (request["application"] is not None and not valid_opaque_id(request["application"]))):
        raise DiagnosticError("invalid-observation-request")
    binding = request["request"]
    started = clock_ns()
    if started < binding["requested_ns"]:
        raise DiagnosticError("invalid-observation-timing")
    deadline = binding["deadline_ns"] / 1e9
    remaining_time(deadline, "observation-timeout")
    salt = bytes.fromhex(request["salt"])
    gallery = set() if request["gallery"] == [] else set(check_gallery(request["gallery"]))
    require_host_procfs()
    categorize = lambda relative: diagnostic_category(relative, gallery)
    scan = scan_application(request["pid"], salt, request["application"], binding["stage"], volume,
                            lambda: lifetime_rows(census_groups(volume, categorize, deadline=deadline), salt))
    encoded = json.dumps(scan | {"request": binding, "start": started, "end": clock_ns()}, separators=(",", ":"))
    write_line(sys.stdout, encoded.encode("ascii"), deadline, "observation-timeout")


WRITER_REPORT_ROWS = 8
WRITER_REPORT_BYTES = 2048
WRITER_CATEGORIES = {*DB_CATEGORIES.values(), "uploads", "volume-root"}


def emit_writer_census(holders):
    print(json.dumps([(pid, access) for pid, access, _ in holders]))
    # The gate has its entire result on stdout. Even a formatting or write
    # error on the optional channel must leave the census exit status alone.
    try:
        categories = [category for _, _, category in holders[:WRITER_REPORT_ROWS]]
        os.write(2, (json.dumps(categories) + "\n").encode("ascii"))
    except Exception:
        pass


def read_writer_categories(path, count):
    try:
        if not path.is_file():
            return None, "unavailable"
        with path.open("rb") as stream:
            payload = stream.read(WRITER_REPORT_BYTES + 1)
    except OSError:
        return None, "unavailable"
    if not payload:
        return None, "unavailable"
    try:
        if len(payload) > WRITER_REPORT_BYTES:
            return None, "invalid"
        categories = json.loads(payload.decode("ascii"))
        if (type(categories) is list and len(categories) == count
                and all(type(category) is str and category in WRITER_CATEGORIES for category in categories)):
            return categories, "available"
    except (ValueError, RecursionError):
        pass
    return None, "invalid"


def emit_writer_report(path, expected_pid):
    # Rebuild the log from typed census rows and allowlisted categories.
    # Never echo the auxiliary input or raw stderr.
    try:
        rows = json.load(sys.stdin)
        if (type(rows) is not list or any(
                type(row) is not list or len(row) != 2
                or type(row[0]) is not int or not 0 < row[0] < 2**31
                or (row[1] is not None and (type(row[1]) is not int or row[1] not in (0, 1, 2, 3)))
                for row in rows)):
            raise ValueError
    except (ValueError, RecursionError):
        print("diagnostic report unavailable: malformed census stdout")
        return

    sampled = rows[:WRITER_REPORT_ROWS]
    categories, report_status = read_writer_categories(path, len(sampled))
    if categories is None:
        print(f"diagnostic report {report_status}")
        categories = [None] * len(sampled)

    conditions = []
    if not rows:
        conditions.append("zero-relevant-descriptors")
    if len(rows) > 1:
        conditions.append("unexpected-descriptor-count-or-grouping")
    if any(pid != expected_pid for pid, _ in rows):
        conditions.append("unexpected-process-identity")
    if len({pid for pid, access in rows if access in (os.O_WRONLY, os.O_RDWR)}) > 1:
        conditions.append("multiple-writer-processes")
    if any(access != os.O_RDWR for _, access in rows):
        conditions.append("unexpected-access-mode")
    report = {
        "conditions": conditions,
        "descriptorCount": len(rows),
        "observed": sampled,
        "details": [{"pid": pid, "access": access, "category": category, "expectedProcess": pid == expected_pid}
                    for (pid, access), category in zip(sampled, categories)],
        "omitted": len(rows) - len(sampled),
    }
    print("writer-census-report " + json.dumps(report, separators=(",", ":")))


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
        # An actual shared thread table must not duplicate either independent open.
        from threading import Event, Thread
        stop = Event()
        thread = Thread(target=stop.wait)
        thread.start()
        try:
            categorize = lambda relative: diagnostic_category(relative, set())
            with nested.open("rb"), nested.open("rb"), ordinary.open("r+b"):
                rows = lifetime_rows(census_groups(volume, categorize), bytes(32))["rows"]
                assert len(rows) == 3 and {row["pid"] for row in rows} == {os.getpid()}
                assert len({row["descriptor"] for row in rows if row["category"] == "hero"}) == 2
                assert [row["access"] for row in rows if row["category"] == "other-uploads"] == ["read-write"]
        finally:
            stop.set()
            thread.join(5)
        assert not thread.is_alive()
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
          "independent opens across a shared thread table, real leader exit, symlink, and post-close checks")



def rejected_diagnostic(check, reason):
    try:
        check()
    except DiagnosticError as error:
        assert str(error) == reason, (str(error), reason)
    else:
        raise AssertionError("Diagnostic control was accepted")


def milestone_self_test(gallery):
    run = "a" * 32
    events = [{"run": run, "seq": i, "stage": stage, "nonce": f"{i:032x}"}
              for i, stage in enumerate(MILESTONES, 1)]
    first = events[0] | {"gallery": gallery}
    marker = json.dumps(first).encode()
    assert require_marker(marker, run, 1, MILESTONES[0]) == (events[0], gallery)
    for changed in (first | {"seq": 2}, first | {"run": "b" * 32}, first | {"stage": "wrong"}, first | {"extra": 1}):
        rejected_diagnostic(lambda: require_marker(json.dumps(changed).encode(), run, 1, MILESTONES[0]), "invalid-milestone")
    rejected_diagnostic(lambda: require_marker(b'{"stage":"wrong",' + marker[1:], run, 1, MILESTONES[0]),
                        "invalid-milestone")
    rejected_diagnostic(lambda: check_gallery(gallery[:-1] + gallery[:1]), "invalid-gallery-membership")
    # Exercise the production pipe exchange with a synthetic child.
    child = (
        "import json,sys\nfor marker in json.loads(sys.argv[1]):\n"
        " print(json.dumps(marker),flush=True)\n"
        " ack = {k:v for k,v in marker.items() if k != 'gallery'}\n"
        " assert sys.stdin.readline() == json.dumps(ack,separators=(',',':')) + '\\n'\n"
    )

    def command(markers):
        return [sys.executable, "-c", child, json.dumps(markers)]

    received = []

    def record(stage, *, gallery, deadline):
        assert clock() < deadline
        received.append((stage, gallery))

    exchange_milestones(command([first, *events[1:]]), run, record, 5)
    assert received == [(MILESTONES[0], gallery), (MILESTONES[1], None), (MILESTONES[2], None)]
    rejected_diagnostic(lambda: exchange_milestones(command([first, events[1] | {"nonce": first["nonce"]}]),
                                                    run, record, 5), "duplicate-milestone-nonce")
    for script, reason, seconds in (("pass", "missing-milestone", 5),
                                    ("raise SystemExit(7)", "publication-fixture-failed", 5),
                                    ("import time; time.sleep(5)", "milestone-timeout", 0.1)):
        rejected_diagnostic(lambda: exchange_milestones([sys.executable, "-c", script], run, record, seconds), reason)

    expired = []

    def consume_budget(stage, *, gallery, deadline):
        assert stage == MILESTONES[0] and gallery
        expired.append(stage)
        time.sleep(max(0, deadline - clock()) + 0.01)

    writer = Mock(wraps=write_line)
    with patch.dict(exchange_milestones.__globals__, write_line=writer):
        rejected_diagnostic(lambda: exchange_milestones(command([first]), run, consume_budget, 0.5),
                            "milestone-timeout")
        rejected_diagnostic(lambda: exchange_milestones(command([first]), run,
                                                        lambda *a, **kw: require_shutdown_rows(1), 5),
                            "surviving-publication-descriptors")
    writer.assert_not_called()
    assert expired == [MILESTONES[0]]


def descriptor_race_self_test(volume, category):
    task = volume / "proc" / "321"
    fd = task / "fd" / "3"
    fd.parent.mkdir(parents=True)
    fdinfo = task / "fdinfo" / "3"
    fdinfo.parent.mkdir()
    fields = [b"0"] * 20
    fields[0], fields[17], fields[19] = b"S", b"1", b"100"
    status = task / "stat"

    def write_status():
        status.write_bytes(b"321 (fixture) " + b" ".join(fields))

    write_status()
    state = task_state(task)
    uploads = volume / "uploads" / "temp"
    uploads.mkdir(parents=True)
    database = volume / "blog.db"
    database.touch()
    volume_id = identity(volume.stat())
    identities = publication_identities(volume, category)
    assert identities[volume_id] == ("volume-root", None)
    fixture = uploads / "new-after-inventory"
    fixture.touch()
    fd.symlink_to(fixture)

    def scan():
        return task_descriptors(task, state, identities, volume, volume_id, category, state.started)

    fdinfo.write_text("flags:\t01\n")
    with patch.object(os, "O_PATH", 0o10000000, create=True):
        table = scan()
        assert list(table.values()) == [(("temporary-upload", None), "file", False, 100)]
        assert lifetime_rows([(321, {**table, **table})], bytes(32))["total"] == 1
        real_stat = Path.stat

        def denied_slot(entry):
            if entry == fd:
                raise PermissionError("Synthetic live descriptor denial")
            return real_lstat(entry)

        real_lstat = Path.lstat
        with patch.object(Path, "lstat", denied_slot):
            expect_incomplete(scan, "Live descriptor metadata could not be classified")

        def denied(entry, *args, **kwargs):
            if entry == fd and kwargs.get("follow_symlinks", True):
                raise PermissionError("Synthetic live descriptor denial")
            return real_stat(entry, *args, **kwargs)

        with patch.object(Path, "stat", denied):
            expect_incomplete(scan, "could not be classified")
        fdinfo.write_text("bad flags")
        expect_incomplete(scan, "Descriptor status is incomplete")
        fdinfo.write_text("flags:\t01\n")

        read_fdinfo = diagnostic_fdinfo

        def replaced(task, fd, inode):
            result = read_fdinfo(task, fd, inode)
            fd.unlink()
            fd.symlink_to(database)
            return result

        with patch.dict(diagnostic_descriptor.__globals__, diagnostic_fdinfo=replaced):
            expect_incomplete(scan, "Descriptor changed during diagnostic inspection")
        assert fd.resolve() == database

        alias = uploads / "hardlink"
        os.link(database, alias)
        identities = publication_identities(volume, category)
        assert identities[identity(database.stat())] == ("publication-other", None)
        fd.unlink()
        fd.symlink_to(alias)
        assert list(scan().values()) == [(("temporary-upload", None), "file", False, 100)]
        fd.unlink()
        fd.symlink_to(database)
        alias.unlink()
        real_readlink = os.readlink

        def deleted_link(entry, *args, **kwargs):
            return str(alias) + " (deleted)" if entry == fd else real_readlink(entry, *args, **kwargs)

        with patch.object(os, "readlink", deleted_link):
            assert list(scan().values()) == [(("temporary-upload", None), "file", True, 100)]

        fd.unlink()
        fd.symlink_to(uploads)
        assert list(scan().values()) == [(("temporary-upload", None), "directory", False, 100)]
        moved = task.with_name("gone")

        def disappears(entry, *args, **kwargs):
            if entry == fd and kwargs.get("follow_symlinks", True):
                if disappears.exit_process:
                    task.rename(moved)
                else:
                    fd.unlink()
                raise FileNotFoundError()
            return real_stat(entry, *args, **kwargs)

        for exit_process in (False, True):
            disappears.exit_process = exit_process
            with patch.object(Path, "stat", disappears):
                expect_incomplete(scan, "Descriptor table membership changed")
            if not exit_process:
                assert scan() == {}
                fd.symlink_to(fixture)
        moved.rename(task)
        fields[19] = b"101"
        write_status()
        expect_incomplete(scan, "Process identity changed")



def descriptor_table_self_test(scratch, categorize):
    volume = scratch / "volume"
    uploads = volume / "uploads"
    uploads.mkdir(parents=True)
    (volume / "blog.db").touch()
    first, second = uploads / "first", uploads / "second"
    first.touch()
    second.touch()
    proc = scratch / "proc"
    leader = proc / "321"
    left, right = leader / "task/321", leader / "task/322"

    def task(path, threads, started):
        path.mkdir(parents=True, exist_ok=True)
        fields = [b"0"] * 20
        fields[0], fields[17], fields[19] = b"S", str(threads).encode(), str(started).encode()
        (path / "stat").write_bytes(b"0 (fixture) " + b" ".join(fields))

    def descriptor(thread, path, flags="00"):
        (thread / "fd").mkdir(exist_ok=True)
        (thread / "fdinfo").mkdir(exist_ok=True)
        fd = thread / "fd/3"
        if fd.is_symlink():
            fd.unlink()
        fd.symlink_to(path)
        (thread / "fdinfo/3").write_text(f"flags:\t{flags}\n")

    task(leader, 1, 100)
    task(left, 1, 100)
    (left / "fd").mkdir()
    real_iterdir = Path.iterdir

    def opened_after_listing(path):
        entries = list(real_iterdir(path))
        if path == left / "fd" and not entries:
            descriptor(left, first)
        return iter(entries)

    def census(iterdir, deadline=None):
        with patch.dict(census_groups.__globals__, PROC=proc, require_host_procfs=lambda: None), \
                patch.object(os, "O_PATH", 0o10000000, create=True), patch.object(Path, "iterdir", iterdir):
            return list(census_groups(volume, categorize, deadline=deadline))

    assert list(census(opened_after_listing)[0][1])[0][1] == identity(first.stat())
    task(leader, 2, 100)
    task(right, 2, 101)
    descriptor(right, first)
    seen = set()

    def reused_between_threads(path):
        if path in (left / "fd", right / "fd") and path not in seen:
            seen.add(path)
            if len(seen) == 2:
                descriptor(left, second, "01")
                descriptor(right, second, "01")
        return real_iterdir(path)

    assert list(census(reused_between_threads)[0][1]) == [("3", identity(second.stat()), os.O_WRONLY)]

    other = proc / "400"

    def added_process_and_thread(path):
        entries = list(real_iterdir(path))
        if path == proc and not other.exists():
            task(other, 1, 200)
            other_thread = other / "task/400"
            task(other_thread, 1, 200)
            descriptor(other_thread, first)
        elif path == leader / "task" and len(entries) == 2:
            third = leader / "task/323"
            task(third, 3, 102)
            descriptor(third, second, "01")
            task(leader, 3, 100)
        return iter(entries)

    assert [pid for pid, _ in census(added_process_and_thread)] == [321, 400]
    attempts = 0

    def changing_mode(path):
        nonlocal attempts
        if path == left / "fd":
            attempts += 1
            if attempts % 2:
                flag = "01" if attempts % 4 == 1 else "00"
                for thread in (left, right, leader / "task/323"):
                    descriptor(thread, second, flag)
        return real_iterdir(path)

    expect_incomplete(lambda: census(changing_mode), "Descriptor census did not stabilize")
    assert attempts == 8

    def slow_churn(path):
        if path == left / "fd":
            time.sleep(0.04)
        return changing_mode(path)

    rejected_diagnostic(lambda: census(slow_churn, clock() + 0.03), "observation-timeout")


def wire_report(request, *, application=None, data=None):
    now = clock_ns()
    scan = {"total": 0, "omitted": 0, "rows": []} if data is None else data
    return scan | {"request": request, "start": now, "end": now, "application": application}


def report_freshness_self_test(scratch):
    run = "a" * 32
    binding = observation_request(run, "article-receipt", clock() + 5)
    scan = wire_report(binding)
    previous_stage = observation_request(run, "startup", clock() + 5)
    replayed = observation_request(run, "article-receipt", clock() + 5)
    end = binding["requested_ns"] - 1
    cases = (
        (scan | {"request": previous_stage}, "observation-request-mismatch"),
        (scan | {"request": replayed}, "observation-request-mismatch"),
        (scan | {"request": binding | {"run": "b" * 32}}, "observation-request-mismatch"),
        (scan | {"request": binding | {"nonce": "c" * 32}}, "observation-request-mismatch"),
        (scan | {"request": binding | {"seq": binding["seq"] + 1}}, "invalid-observation-report"),
        (scan | {"request": binding | {"stage": "hero-receipt"}}, "invalid-observation-report"),
        (scan | {"start": end, "end": end}, "invalid-observation-timing"),
        (scan | {"start": end}, "invalid-observation-timing"),
        (scan | {"start": scan["end"] + 1}, "invalid-observation-timing"),
        (scan | {"end": binding["deadline_ns"]}, "observation-timeout"),
        ({key: value for key, value in scan.items() if key != "request"}, "invalid-observation-report"),
    )
    for report, reason in cases:
        rejected_diagnostic(lambda: read_scan(json.dumps(report).encode(), binding), reason)
    duplicated = b'{"request":null,' + json.dumps(scan).encode()[1:]
    rejected_diagnostic(lambda: read_scan(duplicated, binding), "invalid-observation-report")
    cutoff = clock_ns() - 1
    expired = binding | {"requested_ns": cutoff - 2, "deadline_ns": cutoff}
    timely_body = scan | {"request": expired, "start": cutoff - 1, "end": cutoff - 1}
    rejected_diagnostic(lambda: read_scan(json.dumps(timely_body).encode(), expired), "observation-timeout")

    state_file = scratch / "state"
    lifetime_command("init", state_file, argument="321")
    state = json.loads(state_file.read_text())
    state["application"] = "d" * 32
    state_file.write_text(json.dumps(state))
    gallery = [hashlib.sha256(str(i).encode()).hexdigest() for i in range(65)]

    def publish(_, run, sample):
        marker = {"run": run, "seq": 1, "stage": "article-receipt", "nonce": "a" * 32, "gallery": gallery}
        command = [sys.executable, "-c", "import sys; print(sys.argv[1],flush=True); sys.stdin.readline()", json.dumps(marker)]
        exchange_milestones(command, run, sample, 5)

    def stale(_, request, __):
        expected = json.loads(request)["request"]
        return json.dumps(wire_report(expected, application=state["application"]) | {"start": 0, "end": 0}).encode()

    writer = Mock(wraps=write_line)
    with patch.dict(lifetime_command.__globals__, lifetime_publish=publish, run_lifetime_scan=stale, write_line=writer):
        rejected_diagnostic(lambda: lifetime_command("publish", state_file, scratch, "synthetic"),
                            "article-receipt: invalid-observation-timing")
    writer.assert_not_called()


def transport_self_test(scratch):
    read_fd, write_fd = os.pipe()
    with os.fdopen(read_fd, "rb", buffering=0), os.fdopen(write_fd, "wb", buffering=0) as sink:
        os.set_blocking(write_fd, False)
        try:
            while True:
                os.write(write_fd, b"x" * 512)
        except BlockingIOError:
            pass
        os.set_blocking(write_fd, True)
        rejected_diagnostic(lambda: write_line(sink, b'{"complete":true}', clock() + 0.05,
                                               "observation-output-timeout"), "observation-output-timeout")
        assert os.get_blocking(write_fd)
        rejected_diagnostic(lambda: write_line(sink, b"X" * DIAGNOSTIC_BYTES, clock() + 1,
                                               "observation-output-timeout"), "observation-output-limit")

    launch = subprocess.Popen
    for script, reason, seconds in (
            ("import sys; sys.stdout.write('{')", "invalid-observation-report", 5),
            (f"print('x' * {DIAGNOSTIC_BYTES + 1}, flush=True)", "invalid-observation-report", 5),
            ("import time; time.sleep(5)", "observation-timeout", 0.15)):
        children = []

        def scan_child(_, **kwargs):
            child = launch([sys.executable, "-c", script], **kwargs)
            children.append(child)
            return child

        with patch.object(subprocess, "Popen", side_effect=scan_child):
            rejected_diagnostic(lambda: run_lifetime_scan(scratch, b"{}", clock() + seconds), reason)
        assert all(child.returncode is not None for child in children)


def lifetime_self_test():
    salt = bytes(32)
    gallery = [hashlib.sha256(str(i).encode()).hexdigest() for i in range(65)]
    category = lambda relative: diagnostic_category(relative, set(gallery))
    assert category(Path("uploads", ".media", "post", "0")) == ("gallery", None)
    assert category(Path("uploads", ".media", "post", "different")) == ("post-media", None)
    assert category(Path("uploads", "hero", "current-hero-og.webp")) == ("hero", "social-derivative")
    assert category(Path("uploads", "temp", "fixture")) == ("temporary-upload", None)
    assert category(Path("blog.db-wal")) == ("wal", None)
    milestone_self_test(gallery)

    value = (("temporary-upload", None), "file", True, 100)
    original = ("3", (1, 2), os.O_WRONLY)
    reused = ("3", (1, 9), os.O_WRONLY)
    directory = ("5", (1, 3), os.O_RDONLY)
    scan = lifetime_rows([(123, {original: value, ("4", (1, 2), os.O_WRONLY): value, reused: value,
                                 directory: (("other-uploads", None), "directory", False, 100)}),
                          (456, {original: value})], salt)
    app = opaque_id(salt, 123, 100)
    expected = observation_request("a" * 32, "startup", clock() + 5)
    scan.update(request=expected, start=clock_ns(), end=clock_ns(), application=app)
    rows = scan["rows"]
    assert scan["total"] == len({row["descriptor"] for row in rows}) == 5
    assert len({row["process"] for row in rows}) == 2
    assert len([row for row in rows if row["deleted"] and row["access"] == "write-only"]) == 4
    assert len([row for row in rows if row["kind"] == "directory"]) == 1
    assert read_scan(json.dumps(scan).encode(), expected) == scan
    for malformed in (b"<invalid>", b" " * (DIAGNOSTIC_BYTES + 1),
                      json.dumps(scan | {"omitted": 1}).encode(),
                      json.dumps(scan | {"rows": [dict(rows[0], descriptor="unexpected")]}).encode(),
                      json.dumps(scan | {"rows": [rows[0]] * 5}).encode()):
        rejected_diagnostic(lambda: read_scan(malformed, expected), "invalid-observation-report")
    many = {(str(i), (1, i), os.O_WRONLY): value for i in range(DIAGNOSTIC_ROWS + 1)}
    overflow = lifetime_rows([(123, many), (456, {original: value})], salt)
    assert overflow["total"] == DIAGNOSTIC_ROWS + 2 and overflow["omitted"] == 2
    assert len(overflow["rows"]) == DIAGNOSTIC_ROWS
    rejected_diagnostic(lambda: require_shutdown_rows(scan["total"]), "surviving-publication-descriptors")
    require_shutdown_rows(0)
    state = {"start": 0, "pid": 123, "application": app, "history": {}}
    first = json.loads(observation_report("startup", scan, state, None))
    assert [row["pid"] for row in first["rows"] if row["holder"] == "unexpected"] == [456]
    assert not any(row["observed_again"] for row in first["rows"])
    with patch.dict(observation_report.__globals__, DIAGNOSTIC_BYTES=64):
        rejected_diagnostic(lambda: observation_report("startup", scan, state, None), "observation-output-limit")
    new_process = rows[0] | {"process": opaque_id(salt, 123, 101), "descriptor": "b" * 32}
    later_scan = scan | {"start": 10**9, "end": 10**9, "total": 2, "rows": [rows[0], new_process]}
    later = json.loads(observation_report("idle-1s", later_scan, state, (1000, 0)))
    assert later["idle_elapsed_ms"] == 1000 and later["rows"][0]["observed_again"]
    assert later["rows"][0]["first"]["stage"] == "startup" and later["rows"][0]["last"]["stage"] == "idle-1s"
    assert later["rows"][1]["holder"] == "unexpected"
    sample_id = lifetime_rows([(123, {original: value})], salt)["rows"][0]["descriptor"]
    assert sample_id != lifetime_rows([(123, {original: value})], bytes([1]) * 32)["rows"][0]["descriptor"]
    assert sample_id != lifetime_rows([(123, {reused: value})], salt)["rows"][0]["descriptor"]

    old, recycled = TaskState(b"S", 1, 100), TaskState(b"S", 1, 101)
    namespace = scan_application.__globals__
    with patch.dict(namespace, task_state=lambda _: recycled):
        rejected_diagnostic(lambda: scan_application(123, salt, app, "hero-receipt", None, lambda: {}),
                            "application-identity-unverified")
        assert scan_application(123, salt, app, "after-stop", None, lambda: {}) == {"application": None}
    states = iter([old, recycled])
    with patch.dict(namespace, task_state=lambda _: next(states)):
        rejected_diagnostic(lambda: scan_application(123, salt, app, "hero-receipt", None, lambda: {}),
                            "application-identity-unverified")

    with tempfile.TemporaryDirectory(prefix="recovery-lifetime-") as temp:
        volume = Path(temp)
        mount = volume / "mock-proc" / "123" / "root/app/data"
        mount.parent.mkdir(parents=True)
        mount.symlink_to(volume)
        with patch.dict(namespace, PROC=volume / "mock-proc", task_state=lambda _: old):
            assert scan_application(123, salt, None, "startup", volume, lambda: {}) == {"application": app}
            rejected_diagnostic(lambda: scan_application(123, salt, None, "startup", mount.parent, lambda: {}),
                                "application-identity-unverified")
        state_file = volume / "state.json"
        lifetime_command("init", state_file, argument="321")
        for reason in ("observation-timeout", "invalid-observation-report"):
            def unavailable(*args):
                raise DiagnosticError(reason)
            with patch.dict(lifetime_command.__globals__, run_lifetime_scan=unavailable):
                rejected_diagnostic(lambda: lifetime_command("sample", state_file, volume, "startup"), "startup: " + reason)
        launch = subprocess.Popen
        for script, reason, seconds in (
                (f"print('x' * {DIAGNOSTIC_BYTES + 1}, flush=True)", "invalid-observation-report", 5),
                ("import time; time.sleep(5)", "observation-timeout", 0.1)):
            def scan_child(_, **kwargs):
                return launch([sys.executable, "-c", script], **kwargs)
            with patch.object(subprocess, "Popen", side_effect=scan_child):
                rejected_diagnostic(lambda: run_lifetime_scan(volume, b"{}", clock() + seconds), reason)
        def with_overflow(_, request, deadline):
            formatted = overflow | {"request": json.loads(request)["request"], "start": clock_ns(),
                                    "end": clock_ns(), "application": app}
            return json.dumps(formatted).encode()

        with tempfile.TemporaryFile() as captured:
            with patch.dict(lifetime_command.__globals__, run_lifetime_scan=with_overflow), patch.object(sys, "stdout", captured):
                rejected_diagnostic(lambda: lifetime_command("sample", state_file, volume, "startup"),
                                    "startup: observation-rows-omitted")
            captured.seek(0)
            report = json.load(captured)
            assert report["total"] == DIAGNOSTIC_ROWS + 2 and report["omitted"] == 2 and not report["complete"]
        descriptor_race_self_test(volume, category)
        descriptor_table_self_test(volume / "descriptor-table", category)
        report_freshness_self_test(volume)
        transport_self_test(volume)

    census_policy_self_test()
    print("Portable lifetime controls passed: milestone binding and deadlines, descriptor races and identity, "
          "strict counts and reports, and surviving descriptors")


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
    parser.add_argument("mode", choices=("archive", "archive-truncation", "census", "writer-census", "writer-report", "census-self-test",
                                             "lifetime", "lifetime-scan", "lifetime-self-test",
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
    elif args.mode == "lifetime-self-test":
        lifetime_self_test()
    elif args.mode == "lifetime-scan":
        try:
            lifetime_scan(args.path)
        except CensusUnstable:
            return 3
        except CensusIncomplete:
            return 2
        except DiagnosticError as error:
            return {"application-identity-unverified": 4, "observation-timeout": 124}.get(str(error), 1)
        except (OSError, ValueError, TypeError, KeyError, IndexError):
            return 1
    elif args.mode == "lifetime":
        # This command is called only by the isolated recovery runner.
        if args.label is None:
            parser.error("lifetime requires an action")
        action, _, argument = args.label.partition(":")
        def controller_timeout(_signal, _frame):
            raise DiagnosticError("controller-timeout")
        signal.signal(signal.SIGTERM, controller_timeout)
        try:
            lifetime_command(action, args.path, args.expected, argument)
        except DiagnosticError as error:
            lifetime_error(str(error))
            return 1
        except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
            lifetime_error("command-or-state-error")
            return 1
    elif args.mode == "verify-digest":
        require_digest(args.path, args.expected, args.label)
    elif args.mode == "census":
        try:
            print(json.dumps(census(args.path)))
        except (CensusIncomplete, OSError, ValueError, IndexError, StopIteration) as error:
            print(f"Incomplete Linux handle census: {error}", file=sys.stderr)
            return 2
    elif args.mode == "writer-census":
        try:
            emit_writer_census(census(args.path, detailed=True))
        except CensusIncomplete:
            print("incomplete-process-enumeration", file=sys.stderr)
            return 2
        except (OSError, ValueError, IndexError, StopIteration):
            return 1
    elif args.mode == "writer-report":
        emit_writer_report(args.path, int(args.expected))
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
