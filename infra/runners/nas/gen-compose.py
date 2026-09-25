#!/usr/bin/env python3
"""Writes compose.yaml for Dockge: the Dockerfile inline, the entrypoint as a BuildKit
heredoc inside it, and every $ in them doubled so Compose does not interpolate them."""
import pathlib

here = pathlib.Path(__file__).parent
entry = (here / 'arkpedia-runner.sh').read_text()
dockerfile = (here / 'Dockerfile').read_text().replace('@@ENTRYPOINT@@\n', entry)
assert 'ENTRYPOINT_SCRIPT' not in entry
inline = ''.join('        ' + line if line.strip() else '\n' for line in dockerfile.replace('$', '$$').splitlines(True))

compose = f"""# arkpedia/arkpedia self-hosted GitHub Actions runner.
# Registered to that one private repository. Jobs run fenced (no LAN, tailnet, link-local or
# other containers; nothing inbound) as an unprivileged user with no capabilities. No NAS
# share and no Docker socket is mounted: the only storage is the runner-home volume.
# RUNNER_TOKEN (in .env) is needed only for the first start; it is a one-hour registration
# token, useless afterwards, and can be blanked once the runner shows as online.
# Maintenance shells: use `docker exec -u runner arkpedia-runner bash`, never a root shell in
# /home/runner, which jobs write to. runner-home is its own dataset with a quota.
name: arkpedia-runner
services:
  runner:
    build:
      context: .
      dockerfile_inline: |
{inline}    image: arkpedia-runner:local
    # The image is built here, never pulled (so Dockge's Update rebuilds instead of failing).
    pull_policy: build
    container_name: arkpedia-runner
    restart: unless-stopped
    init: true
    # Room for the runner to cancel a job and report it before Docker kills it.
    stop_grace_period: 2m
    user: "0:0"
    read_only: true
    tmpfs:
      - /tmp:size=2g,mode=1777,exec
      - /var/tmp:size=512m,mode=1777,exec
      - /run:size=64m
    # Public resolvers, queried from inside the fenced namespace: job lookups never reach
    # the LAN router or the tailnet resolver.
    dns:
      - 1.1.1.1
      - 9.9.9.9
    environment:
      RUNNER_TOKEN: ${{RUNNER_TOKEN:-}}
      RUNNER_NAME: ${{RUNNER_NAME:-truenas}}
      RUNNER_LABELS: ${{RUNNER_LABELS:-arkpedia-nas}}
    volumes:
      - runner-home:/home/runner
    cap_drop:
      - ALL
    # Held by the root entrypoint and tini only: NET_ADMIN to fence, SETUID/SETGID to switch
    # to the runner user, SETPCAP to empty the bounding set, KILL so tini (PID 1) can forward
    # a stop to the runner. The runner and its jobs keep none of them.
    cap_add:
      - NET_ADMIN
      - SETUID
      - SETGID
      - SETPCAP
      - KILL
    security_opt:
      - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: 1
      net.ipv6.conf.default.disable_ipv6: 1
    shm_size: 1gb
    mem_limit: 8g
    memswap_limit: 8g
    cpus: 6
    cpu_shares: 512
    pids_limit: 4096
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"
volumes:
  # A dedicated dataset with a quota, so a job cannot fill the pool. Docker copies the
  # image's /home/runner into it on first start.
  runner-home:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${{RUNNER_HOME_DIR:-/mnt/HDDs/Applications/arkpedia-runner}}
"""
(here / 'compose.yaml').write_text(compose)
print('wrote', here / 'compose.yaml', len(compose), 'bytes')
