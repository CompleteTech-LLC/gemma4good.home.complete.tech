#!/usr/bin/env python3
"""Failure-path tests for the guarded Gemma4Good retirement script.

These tests keep all Podman, systemd, and Caddy calls mocked.  They exercise
the recovery boundaries that an AST or happy-path check cannot establish:
storage errors fail closed, configuration resumes after a pre-reload crash,
and a validated rootfs archive is reused safely after a failed removal.
"""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).with_name('retire-train.py')
SPEC = importlib.util.spec_from_file_location('retire_train', SCRIPT)
assert SPEC and SPEC.loader
retire = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retire)


def completed(returncode: int, stdout: str = '', stderr: str = ''):
    return retire.subprocess.CompletedProcess(
        ['podman', 'inspect', 'fixture'], returncode, stdout, stderr
    )


class RetirementFailureTests(unittest.TestCase):
    def test_inspect_distinguishes_missing_from_storage_failure(self):
        with patch.object(retire, 'command', return_value=completed(1, stderr='Error: no such object: fixture')):
            self.assertIsNone(retire.inspect_container('fixture'))

        with patch.object(
            retire,
            'command',
            return_value=completed(1, stderr='Error: overlay storage layer not found'),
        ):
            with self.assertRaisesRegex(RuntimeError, 'podman inspect failed'):
                retire.inspect_container('fixture')

    def test_storage_failure_precedes_timer_mutation(self):
        state = {'version': 1, 'phase': 'config_applied', 'backup_dir': '/unused'}
        with patch.object(
            retire,
            'inspect_container',
            side_effect=RuntimeError('podman inspect failed: storage unavailable'),
        ), patch.object(retire, 'disable_unit') as disable:
            with self.assertRaisesRegex(RuntimeError, 'storage unavailable'):
                retire.remove_containers(state)
        disable.assert_not_called()

    def test_atomic_write_preserves_existing_mode_and_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config'
            path.write_text('old\n')
            path.chmod(0o640)
            before = path.stat()

            retire.atomic_write(path, 'new\n')

            after = path.stat()
            self.assertEqual(path.read_text(), 'new\n')
            self.assertEqual(stat.S_IMODE(after.st_mode), stat.S_IMODE(before.st_mode))
            self.assertEqual((after.st_uid, after.st_gid), (before.st_uid, before.st_gid))

    def test_config_reload_failure_rolls_back_and_pre_reload_crash_resumes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            compose = root / 'docker-compose.yml'
            caddy = root / 'Caddyfile'
            backup = root / 'backup'
            backup.mkdir()
            old_compose, old_caddy = 'old-compose\n', 'old-caddy\n'
            new_compose, new_caddy = 'new-compose\n', 'new-caddy\n'
            compose.write_text(old_compose)
            caddy.write_text(old_caddy)
            (backup / 'docker-compose.yml').write_text(old_compose)
            (backup / 'Caddyfile').write_text(old_caddy)
            state_path = root / 'state.json'
            state = {'version': 1, 'phase': 'prepared', 'backup_dir': str(backup)}
            old_globals = (retire.COMPOSE, retire.CADDY, retire.STATE_PATH)
            retire.COMPOSE, retire.CADDY, retire.STATE_PATH = compose, caddy, state_path
            try:
                with patch.object(retire, 'stage_and_validate_caddy'), patch.object(
                    retire,
                    'reload_caddy',
                    side_effect=[RuntimeError('new reload failed'), None],
                ):
                    with self.assertRaisesRegex(RuntimeError, 'rolled back'):
                        retire.apply_config(state, new_compose, new_caddy)
                self.assertEqual(compose.read_text(), old_compose)
                self.assertEqual(caddy.read_text(), old_caddy)
                self.assertEqual(state['phase'], 'prepared')

                # A process can die after both atomic writes and before the
                # reload/state write.  Resume must reload before phase advance.
                compose.write_text(new_compose)
                caddy.write_text(new_caddy)
                with patch.object(retire, 'reload_caddy') as reload:
                    retire.apply_config(state, new_compose, new_caddy)
                reload.assert_called_once_with(new_caddy)
                self.assertEqual(state['phase'], 'config_applied')
            finally:
                retire.COMPOSE, retire.CADDY, retire.STATE_PATH = old_globals

    def test_export_is_validated_before_rm_and_reused_after_failed_rm(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backup = root / 'backup'
            backup.mkdir()
            state_path = root / 'state.json'
            state = {'version': 1, 'phase': 'config_applied', 'backup_dir': str(backup)}
            item = {'Id': 'api-id', 'State': {'Running': False}}
            inspect_results = iter([item, item, None])
            rm_attempts = []

            def fake_checked(*args, **kwargs):
                if args[:2] == ('podman', 'export'):
                    partial = Path(args[3])
                    with tarfile.open(partial, 'w') as archive:
                        payload = b'preserved report data\n'
                        info = tarfile.TarInfo('app/report.txt')
                        info.size = len(payload)
                        archive.addfile(info, io.BytesIO(payload))
                    return ''
                if args[:2] == ('podman', 'rm'):
                    rm_attempts.append(args[2])
                    if len(rm_attempts) == 1:
                        raise RuntimeError('simulated rm interruption')
                    return ''
                raise AssertionError(args)

            old_state_path = retire.STATE_PATH
            retire.STATE_PATH = state_path
            try:
                with patch.object(retire, 'inspect_container', side_effect=lambda name: next(inspect_results)), \
                     patch.object(retire, 'run_checked', side_effect=fake_checked):
                    with self.assertRaisesRegex(RuntimeError, 'simulated rm interruption'):
                        retire.retire_container(state, 'gemma4good-api-home-complete-tech', 'api-id')
                    # Resume after the failed destructive step.  The existing
                    # archive must hash and parse identically before rm runs.
                    retire.retire_container(state, 'gemma4good-api-home-complete-tech', 'api-id')
            finally:
                retire.STATE_PATH = old_state_path

            self.assertEqual(rm_attempts, ['api-id', 'api-id'])
            self.assertIn('api-rootfs.tar', state['artifacts'])
            self.assertEqual(state['artifacts']['api-rootfs.tar']['members'], 1)

    def test_invalid_export_blocks_rm(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backup = root / 'backup'
            backup.mkdir()
            state = {'version': 1, 'phase': 'config_applied', 'backup_dir': str(backup)}
            rm = Mock()

            def fake_checked(*args, **kwargs):
                if args[:2] == ('podman', 'export'):
                    Path(args[3]).write_bytes(b'not-a-tar')
                    return ''
                if args[:2] == ('podman', 'rm'):
                    rm(*args, **kwargs)
                    return ''
                raise AssertionError(args)

            with patch.object(retire, 'inspect_container', return_value={'Id': 'api-id', 'State': {'Running': False}}), \
                 patch.object(retire, 'run_checked', side_effect=fake_checked):
                with self.assertRaisesRegex(RuntimeError, 'archive validation failed'):
                    retire.retire_container(state, 'gemma4good-api-home-complete-tech', 'api-id')
            rm.assert_not_called()

    def test_explicit_resume_rechecks_complete_postconditions(self):
        state = {'version': 1, 'phase': 'complete'}
        with patch.object(retire, 'load_state', return_value=state), \
             patch.object(retire, 'candidates', return_value=('compose', 'caddy')), \
             patch.object(retire, 'verify_complete') as verify:
            retire.apply_retirement()
        verify.assert_called_once_with(state, 'compose', 'caddy')


if __name__ == '__main__':
    unittest.main()
