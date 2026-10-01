#!/usr/bin/env python3
"""Safely apply the owner-approved, one-shot Gemma4Good retirement.

The 2026-09-07 retirement is already complete, so running this historical
script without an explicit ``--apply`` flag is refused. If a future reviewed
retirement ever needs to resume after a partial failure, the state file and
phase markers make configuration work rollback-safe and container work
resumable. The exact historical container IDs remain a hard guard against
acting on a recreated or unrelated deployment.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile


COMPOSE = Path('/srv/openclaw/deploy/docker-compose.yml')
CADDY = Path('/srv/openclaw/deploy/Caddyfile')
PROXY = 'home-complete-tech-domain-proxy'
STATE_PATH = Path('/var/backups/gemma4good-retirement.state.json')
REMOTE_CANDIDATE = '/tmp/Caddyfile.gemma4good-retired'
TARGETS = {
    'gemma4good-api-home-complete-tech':
        '6e1a38f49c2226d1094917eb20ae18bd3dda16d78c55532faa8b729ec737f1bf',
    'gemma4good-home-complete-tech':
        '21a948334822432aef9eecb241cd3cbc30aa99b7c72b7d1b9bd11328cadc43de',
}
PHASES = ('prepared', 'config_applied', 'containers_removed', 'complete')
RETIRED_SITE = '''gemma4good.home.complete.tech:443 {
    import shared_access_log
    tls /certs/fullchain.pem /certs/privkey.pem
    respond "This service has been retired." 410
}'''


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def command(*args: str, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=False, text=True, capture_output=True, timeout=timeout)


def run_checked(*args: str, timeout: int = 120) -> str:
    result = command(*args, timeout=timeout)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"{' '.join(args)} failed ({result.returncode}): {detail}")
    return result.stdout


def inspect_container(name: str) -> dict | None:
    result = command('podman', 'inspect', name)
    if result.returncode != 0:
        detail = f'{result.stdout}\n{result.stderr}'.strip()
        # Podman reports a missing name as "no such object".  Every other
        # inspect failure (including a broken storage layer) is an operational
        # error and must stop the retirement rather than look like success.
        if re.search(r'\bno such (?:object|container):', detail, flags=re.I):
            return None
        raise RuntimeError(f'podman inspect failed for {name} ({result.returncode}): {detail}')
    try:
        value = json.loads(result.stdout)
        require(isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict),
                f'Unexpected inspect result: {name}')
        return value[0]
    except (json.JSONDecodeError, TypeError, KeyError, RuntimeError) as error:
        raise RuntimeError(f'Invalid inspect result: {name}') from error


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, contents: str) -> None:
    require(not path.is_symlink(), f'Refusing to replace symlink: {path}')
    try:
        existing = path.stat()
    except FileNotFoundError:
        existing = None
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f'.{path.name}.retirement-', dir=str(path.parent), text=True
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, 'w') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        if existing is not None:
            os.chmod(temporary, stat.S_IMODE(existing.st_mode))
            temporary_stat = temporary.stat()
            if (temporary_stat.st_uid, temporary_stat.st_gid) != (existing.st_uid, existing.st_gid):
                os.chown(temporary, existing.st_uid, existing.st_gid)
        os.replace(temporary, path)
        directory_descriptor = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if temporary.exists():
            temporary.unlink()


def save_state(state: dict) -> None:
    state_text = json.dumps(state, indent=2, sort_keys=True) + '\n'
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(STATE_PATH, state_text)
    os.chmod(STATE_PATH, 0o600)
    loaded = json.loads(STATE_PATH.read_text())
    require(loaded == state, 'Retirement state postcondition failed')


def load_state() -> dict | None:
    if not STATE_PATH.exists():
        return None
    try:
        state = json.loads(STATE_PATH.read_text())
    except json.JSONDecodeError as error:
        raise RuntimeError(f'Invalid retirement state: {STATE_PATH}') from error
    require(state.get('version') == 1, 'Unsupported retirement state version')
    require(state.get('phase') in PHASES, 'Invalid retirement state phase')
    backup_dir = Path(state.get('backup_dir', ''))
    require(backup_dir.is_dir(), f'Retirement backup directory is missing: {backup_dir}')
    require(state.get('target_ids') == TARGETS, 'Retirement target identity changed')
    for filename in ('docker-compose.yml', 'Caddyfile', 'container-inspect.json'):
        require((backup_dir / filename).is_file(), f'Missing retirement backup: {filename}')
    for filename in ('docker-compose.yml', 'Caddyfile'):
        require(
            sha256(backup_dir / filename) == state.get('original_hashes', {}).get(filename),
            f'Retirement backup changed: {filename}',
        )
    return state


def make_state() -> dict:
    require(os.geteuid() == 0, 'Run as root')
    inspected: dict[str, dict] = {}
    for name, expected_id in TARGETS.items():
        item = inspect_container(name)
        require(item is not None, f'Target container is missing: {name}')
        require(item.get('Id') == expected_id, f'Container changed: {name}')
        inspected[name] = item

    old_compose = COMPOSE.read_text()
    old_caddy = CADDY.read_text()
    require('gemma4good-api:' in old_compose, 'Gemma4Good API service is already absent')
    require('gemma4good.home.complete.tech:443' in old_caddy,
            'Gemma4Good Caddy site is already absent')

    backup_dir = Path(tempfile.mkdtemp(prefix='gemma4good-retirement.', dir='/var/backups'))
    shutil.copy2(COMPOSE, backup_dir / 'docker-compose.yml')
    shutil.copy2(CADDY, backup_dir / 'Caddyfile')
    (backup_dir / 'container-inspect.json').write_text(json.dumps(inspected, indent=2) + '\n')
    state = {
        'version': 1,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'backup_dir': str(backup_dir),
        'phase': 'prepared',
        'target_ids': TARGETS,
        'original_hashes': {
            'docker-compose.yml': sha256(backup_dir / 'docker-compose.yml'),
            'Caddyfile': sha256(backup_dir / 'Caddyfile'),
        },
    }
    save_state(state)
    return state


def backup_path(state: dict, filename: str) -> Path:
    path = Path(state['backup_dir']) / filename
    require(path.is_file(), f'Missing retirement backup: {path}')
    return path


def candidates(state: dict) -> tuple[str, str]:
    import yaml

    old_compose = backup_path(state, 'docker-compose.yml').read_text()
    old_caddy = backup_path(state, 'Caddyfile').read_text()
    new_compose, count = re.subn(
        r'^  gemma4good-api:\n.*?(?=^  [A-Za-z0-9_-]+:|^\S|\Z)',
        '',
        old_compose,
        flags=re.M | re.S,
    )
    require(count == 1, 'Expected exactly one Gemma4Good API definition')
    expected_config = yaml.safe_load(old_compose)
    del expected_config['services']['gemma4good-api']
    require(yaml.safe_load(new_compose) == expected_config,
            'Unexpected Compose changes in retirement candidate')
    new_caddy, count = re.subn(
        r'^gemma4good\.home\.complete\.tech:443 \{\n.*?^\}',
        RETIRED_SITE,
        old_caddy,
        flags=re.M | re.S,
    )
    require(count == 1, 'Expected exactly one Gemma4Good Caddy site')
    return new_compose, new_caddy


def stage_and_validate_caddy(contents: str) -> None:
    proxy_info = inspect_container(PROXY)
    require(proxy_info is not None and proxy_info.get('State', {}).get('Running'),
            'Caddy proxy must be running for validation')
    proxy_root = Path('/proc') / str(proxy_info['State']['Pid']) / 'root'
    candidate = proxy_root / REMOTE_CANDIDATE.lstrip('/')
    candidate.write_text(contents)
    run_checked('podman', 'exec', PROXY, 'caddy', 'validate',
                '--config', REMOTE_CANDIDATE, '--adapter', 'caddyfile')


def reload_caddy(contents: str) -> None:
    stage_and_validate_caddy(contents)
    run_checked('podman', 'exec', PROXY, 'caddy', 'reload',
                '--config', REMOTE_CANDIDATE, '--adapter', 'caddyfile')


def rollback_config(old_compose: str, old_caddy: str) -> list[str]:
    rollback_errors: list[str] = []
    try:
        atomic_write(COMPOSE, old_compose)
        require(COMPOSE.read_text() == old_compose, 'Compose rollback postcondition failed')
    except Exception as error:  # pragma: no cover - privileged failure path
        rollback_errors.append(f'Compose rollback: {error}')
    try:
        atomic_write(CADDY, old_caddy)
        require(CADDY.read_text() == old_caddy, 'Caddyfile rollback postcondition failed')
        reload_caddy(old_caddy)
    except Exception as error:  # pragma: no cover - privileged failure path
        rollback_errors.append(f'Caddy rollback: {error}')
    return rollback_errors


def apply_config(state: dict, new_compose: str, new_caddy: str) -> None:
    old_compose = backup_path(state, 'docker-compose.yml').read_text()
    old_caddy = backup_path(state, 'Caddyfile').read_text()
    current_compose = COMPOSE.read_text()
    current_caddy = CADDY.read_text()
    require(current_compose in (old_compose, new_compose),
            'Shared Compose drifted since retirement preparation')
    require(current_caddy in (old_caddy, new_caddy),
            'Caddyfile drifted since retirement preparation')
    if current_compose == new_compose and current_caddy == new_caddy:
        # A previous process may have written both files and died before the
        # Caddy reload or state write.  Re-run the reload before recording the
        # phase; merely validating the candidate is not enough.
        try:
            reload_caddy(new_caddy)
        except Exception as error:
            rollback_errors = rollback_config(old_compose, old_caddy)
            detail = f'Retirement configuration phase rolled back: {error}'
            if rollback_errors:
                detail += '; ' + '; '.join(rollback_errors)
            raise RuntimeError(detail) from error
        state['phase'] = 'config_applied'
        save_state(state)
        return

    stage_and_validate_caddy(new_caddy)
    try:
        atomic_write(COMPOSE, new_compose)
        require(COMPOSE.read_text() == new_compose, 'Compose write postcondition failed')
        atomic_write(CADDY, new_caddy)
        require(CADDY.read_text() == new_caddy, 'Caddyfile write postcondition failed')
        reload_caddy(new_caddy)
    except Exception as error:
        rollback_errors = rollback_config(old_compose, old_caddy)
        detail = f'Retirement configuration phase rolled back: {error}'
        if rollback_errors:
            detail += '; ' + '; '.join(rollback_errors)
        raise RuntimeError(detail) from error

    require(COMPOSE.read_text() == new_compose and CADDY.read_text() == new_caddy,
            'Configuration retirement postcondition failed')
    state['phase'] = 'config_applied'
    save_state(state)


def disable_unit(unit: str) -> None:
    result = command('systemctl', 'disable', '--now', unit)
    if result.returncode != 0:
        text = f'{result.stdout}\n{result.stderr}'.lower()
        if ('not-found' not in text and 'not found' not in text
                and 'could not be found' not in text and 'not loaded' not in text
                and 'does not exist' not in text):
            raise RuntimeError(f'Could not disable {unit}: {text.strip()}')
        return
    status = command('systemctl', 'is-enabled', unit)
    if status.returncode == 0:
        require(status.stdout.strip() in ('disabled', 'static', 'masked'),
                f'Unexpected enabled state for {unit}: {status.stdout.strip()}')


def validate_rootfs_export(path: Path) -> dict[str, int | str]:
    require(path.is_file() and path.stat().st_size > 0,
            f'API rootfs backup is missing or empty: {path}')
    members = 0
    try:
        with tarfile.open(path, mode='r:*') as archive:
            for member in archive:
                members += 1
                if member.isfile():
                    stream = archive.extractfile(member)
                    require(stream is not None, f'Could not read exported file: {member.name}')
                    with stream:
                        while stream.read(1024 * 1024):
                            pass
    except (OSError, EOFError, tarfile.TarError, RuntimeError) as error:
        raise RuntimeError(f'API rootfs archive validation failed: {path}: {error}') from error
    require(members > 0, f'API rootfs archive has no members: {path}')
    return {
        'sha256': sha256(path),
        'size': path.stat().st_size,
        'members': members,
    }


def ensure_api_export(state: dict, expected_id: str) -> dict[str, int | str]:
    export_path = Path(state['backup_dir']) / 'api-rootfs.tar'
    partial_path = export_path.with_suffix('.tar.partial')
    require(not partial_path.exists(),
            f'Incomplete API rootfs export requires manual review: {partial_path}')
    if not export_path.exists():
        try:
            run_checked('podman', 'export', '--output', str(partial_path), expected_id, timeout=600)
            require(partial_path.is_file() and partial_path.stat().st_size > 0,
                    'API rootfs temporary backup postcondition failed')
            os.replace(partial_path, export_path)
        finally:
            if partial_path.exists():
                partial_path.unlink()
    metadata = validate_rootfs_export(export_path)
    recorded = state.setdefault('artifacts', {}).get('api-rootfs.tar')
    if recorded is None:
        state['artifacts']['api-rootfs.tar'] = metadata
        save_state(state)
    else:
        require(recorded == metadata,
                'API rootfs archive changed since its validated export')
    return metadata


def retire_container(state: dict, name: str, expected_id: str) -> None:
    item = inspect_container(name)
    if item is None:
        if 'api' in name:
            # Absence is acceptable only when the archive was already
            # validated and recorded by this state file.  A missing API
            # container without that evidence could be an unrelated removal.
            ensure_api_export(state, expected_id)
        return
    require(item.get('Id') == expected_id, f'Container changed: {name}')
    if item.get('State', {}).get('Running'):
        run_checked('podman', 'stop', '--time', '30', expected_id)
        item = inspect_container(name)
        require(item is not None and not item.get('State', {}).get('Running'),
                f'Stop postcondition failed: {name}')

    if 'api' in name:
        # Validate archive structure and hash before any destructive command.
        ensure_api_export(state, expected_id)
    run_checked('podman', 'rm', expected_id)
    require(inspect_container(name) is None, f'Removal postcondition failed: {name}')


def remove_containers(state: dict) -> None:
    for name, expected_id in TARGETS.items():
        # Inspect before disabling any timer.  A storage/database error must
        # leave the scheduler and container state untouched for diagnosis.
        item = inspect_container(name)
        if item is None:
            retire_container(state, name, expected_id)
            continue
        require(item.get('Id') == expected_id, f'Container changed: {name}')
        for unit in (
            f'podman-healthcheck-30s@{name}.timer',
            f'podman-healthcheck-1m@{name}.timer',
            f'{expected_id}.timer',
            f'podman-healthcheck@{name}.service',
            f'{expected_id}.service',
        ):
            disable_unit(unit)
        retire_container(state, name, expected_id)
    for name in TARGETS:
        require(inspect_container(name) is None, f'Container retirement incomplete: {name}')
    state['phase'] = 'containers_removed'
    save_state(state)


def verify_complete(state: dict, new_compose: str, new_caddy: str) -> None:
    require(COMPOSE.read_text() == new_compose, 'Final Compose postcondition failed')
    require(CADDY.read_text() == new_caddy, 'Final Caddyfile postcondition failed')
    for name in TARGETS:
        require(inspect_container(name) is None, f'Final container postcondition failed: {name}')
    ensure_api_export(state, TARGETS['gemma4good-api-home-complete-tech'])
    state['phase'] = 'complete'
    save_state(state)


def apply_retirement() -> None:
    state = load_state() or make_state()
    new_compose, new_caddy = candidates(state)
    if state['phase'] == 'complete':
        # A completed marker is evidence, not a substitute for a fresh
        # postcondition check if this script is explicitly resumed.
        verify_complete(state, new_compose, new_caddy)
        return
    if state['phase'] == 'prepared':
        apply_config(state, new_compose, new_caddy)
    if state['phase'] == 'config_applied':
        remove_containers(state)
    verify_complete(state, new_compose, new_caddy)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--apply',
        action='store_true',
        help='Explicitly apply or resume the guarded retirement; never use for routine health repair',
    )
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit(
            'Gemma4Good retirement is already complete; pass --apply only for an explicitly reviewed, '
            'guarded resume.'
        )
    apply_retirement()


if __name__ == '__main__':
    main()
