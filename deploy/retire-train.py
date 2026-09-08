#!/usr/bin/env python3
"""Retire the approved Train Gemma4Good services, preserving remaining data."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import yaml


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(*args, timeout=120):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=timeout).stdout


require(os.geteuid() == 0, 'Run as root')
targets = {
    'gemma4good-api-home-complete-tech': '6e1a38f49c2226d1094917eb20ae18bd3dda16d78c55532faa8b729ec737f1bf',
    'gemma4good-home-complete-tech': '21a948334822432aef9eecb241cd3cbc30aa99b7c72b7d1b9bd11328cadc43de',
}
inspects = {}
for name, expected in targets.items():
    item = json.loads(run('podman', 'inspect', name))[0]
    require(item['Id'] == expected, f'Container changed: {name}')
    inspects[name] = item
compose = Path('/srv/openclaw/deploy/docker-compose.yml')
caddy = Path('/srv/openclaw/deploy/Caddyfile')
old_compose, old_caddy = compose.read_text(), caddy.read_text()
new_compose, count = re.subn(r'^  gemma4good-api:\n.*?(?=^  [A-Za-z0-9_-]+:|^\S|\Z)',
                             '', old_compose, flags=re.M | re.S)
require(count == 1, 'Expected one API definition')
expected_config = yaml.safe_load(old_compose)
del expected_config['services']['gemma4good-api']
require(yaml.safe_load(new_compose) == expected_config, 'Unexpected Compose changes')
require(not any(v.get('container_name') in targets for v in expected_config['services'].values()),
        'Another active Gemma4Good definition remains')
retired_site = '''gemma4good.home.complete.tech:443 {
    import shared_access_log
    tls /certs/fullchain.pem /certs/privkey.pem
    respond "This service has been retired." 410
}'''
new_caddy, count = re.subn(r'^gemma4good\.home\.complete\.tech:443 \{\n.*?^\}',
                           retired_site, old_caddy, flags=re.M | re.S)
require(count == 1, 'Expected one Gemma4Good site')
backup = Path(tempfile.mkdtemp(prefix='gemma4good-retirement.', dir='/var/backups'))
for path in (compose, caddy):
    shutil.copy2(path, backup / path.name)
(backup / 'container-inspect.json').write_text(json.dumps(inspects))
candidate = backup / 'Caddyfile.candidate'
candidate.write_text(new_caddy)
proxy = 'home-complete-tech-domain-proxy'
remote_candidate = '/tmp/Caddyfile.gemma4good-retired'
proxy_info = json.loads(run('podman', 'inspect', proxy))[0]
require(proxy_info['State']['Running'], 'Proxy must be running for validation')
proxy_root = Path('/proc') / str(proxy_info['State']['Pid']) / 'root'
# Stage through the known running mount namespace; podman cp can stall while
# mounting the overlay under a heavily loaded health-check fleet.
(proxy_root / remote_candidate.lstrip('/')).write_text(new_caddy)
run('podman', 'exec', proxy, 'caddy', 'validate', '--config', remote_candidate, '--adapter', 'caddyfile')
require(compose.read_text() == old_compose and caddy.read_text() == old_caddy,
        'Live configuration changed during validation')
compose.write_text(new_compose)
caddy.write_text(new_caddy)
run('podman', 'exec', proxy, 'caddy', 'reload', '--config', remote_candidate, '--adapter', 'caddyfile')
for name, exact_id in targets.items():
    for unit in (f'podman-healthcheck-30s@{name}.timer', f'podman-healthcheck-1m@{name}.timer',
                 f'{exact_id}.timer', f'podman-healthcheck@{name}.service', f'{exact_id}.service'):
        subprocess.run(['systemctl', 'disable', '--now', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if inspects[name]['State']['Running']:
        run('podman', 'stop', '--time', '30', exact_id)
    # Preserve writable-layer report storage, even if bind sources were removed.
    if 'api' in name:
        run('podman', 'export', '--output', str(backup / 'api-rootfs.tar'), exact_id, timeout=600)
    run('podman', 'rm', exact_id)
    subprocess.run(['systemctl', 'reset-failed', f'podman-healthcheck@{name}.service',
                    f'{exact_id}.service'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('Gemma4Good retired; private config and writable-rootfs backup:', backup)
