#!/usr/bin/env python3
"""Writes compose.yaml for Dockge: the Dockerfile inline, the entrypoint as a BuildKit
heredoc inside it, and every $ in them doubled so Compose does not interpolate them."""
import pathlib
import sys

here = pathlib.Path(__file__).parent
entry = (here / 'arkpedia-runner.sh').read_text()
dockerfile = (here / 'Dockerfile').read_text().replace('@@ENTRYPOINT@@\n', entry)
assert 'ENTRYPOINT_SCRIPT' not in entry
inline = ''.join('      ' + line if line.strip() else '\n' for line in dockerfile.replace('$', '$$').splitlines(True))

compose = f"""# arkpedia/arkpedia self-hosted GitHub Actions runners, from one definition: two general ones,
# so two jobs (two pull requests' Checks, or a Check and a Deploy) run side by side instead of in
# line, and truenas-deploy, which takes only Deploy (label arkpedia-nas-build alone; Checks and
# content jobs ask for arkpedia-nas), so a deploy never waits behind two Checks (2026-10-13).
# Registered to that one private repository. Jobs run fenced (no LAN, tailnet, link-local or
# other containers; nothing inbound) as an unprivileged user with no capabilities. No NAS
# share and no Docker socket is mounted: the only storage is each runner's home volume.
# RUNNER_TOKEN, RUNNER2_TOKEN and RUNNER3_TOKEN (in .env) are needed only for each runner's first start; they
# are one-hour registration tokens, useless afterwards, and can be blanked once the runners
# show as online.
# Maintenance shells: use `docker exec -u runner arkpedia-runner bash` (or arkpedia-runner-2),
# never a root shell in /home/runner, which jobs write to (arkpedia-runner-deploy likewise). Each runner-home is its own dataset
# with a quota.
name: arkpedia-runner
x-runner: &runner
  build:
    context: .
    dockerfile_inline: |
{inline}  image: arkpedia-runner:local
  # The image is built here, never pulled (so Dockge's Update rebuilds instead of failing).
  pull_policy: build
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
  # Two of these share an 8-core, 32 GB NAS with its own apps. `cpus` is a cap, not a
  # reservation: a Check running alone may use 6 cores, as the one runner did, and two running
  # at once share the eight (cpu_shares keeps the NAS's apps first). At 4 each, a lone Check
  # took 20 minutes instead of 15 (2026-10-02). Three browser workers each (PW_WORKERS, read by
  # playwright.config.ts; the runner hands its environment to the jobs). 6 GB each: a full
  # Check fits, measured in this container at these limits (the browser tests peaked at 4 GB).
  mem_limit: 6g
  memswap_limit: 6g
  cpus: 6
  cpu_shares: 512
  pids_limit: 4096
  logging:
    driver: json-file
    options:
      max-size: 10m
      max-file: "3"
services:
  runner:
    <<: *runner
    container_name: arkpedia-runner
    environment:
      RUNNER_TOKEN: ${{RUNNER_TOKEN:-}}
      RUNNER_NAME: ${{RUNNER_NAME:-truenas}}
      RUNNER_LABELS: ${{RUNNER_LABELS:-arkpedia-nas,arkpedia-nas-build}}
      PW_WORKERS: "3"
    volumes:
      - runner-home:/home/runner
  runner-2:
    <<: *runner
    container_name: arkpedia-runner-2
    environment:
      RUNNER_TOKEN: ${{RUNNER2_TOKEN:-}}
      RUNNER_NAME: ${{RUNNER2_NAME:-truenas-2}}
      RUNNER_LABELS: ${{RUNNER_LABELS:-arkpedia-nas,arkpedia-nas-build}}
      PW_WORKERS: "3"
    volumes:
      - runner-home-2:/home/runner
  runner-deploy:
    <<: *runner
    container_name: arkpedia-runner-deploy
    # A deploy is one `next build` and an upload (about 3 minutes, peaking well under the 6 GB
    # a Check needs); 4 cores keep it from crowding two Checks out of the eight.
    cpus: 4
    environment:
      RUNNER_TOKEN: ${{RUNNER3_TOKEN:-}}
      RUNNER_NAME: ${{RUNNER3_NAME:-truenas-deploy}}
      RUNNER_LABELS: ${{RUNNER3_LABELS:-arkpedia-nas-build}}
    volumes:
      - runner-home-deploy:/home/runner
volumes:
  # Dedicated datasets with a quota each, so a job cannot fill the pool. Docker copies the
  # image's /home/runner into each on first start.
  runner-home:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${{RUNNER_HOME_DIR:-/mnt/HDDs/Applications/arkpedia-runner}}
  runner-home-2:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${{RUNNER2_HOME_DIR:-/mnt/HDDs/Applications/arkpedia-runner-2}}
  runner-home-deploy:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${{RUNNER3_HOME_DIR:-/mnt/HDDs/Applications/arkpedia-runner-deploy}}
"""
if '--stdout' in sys.argv:
    sys.stdout.write(compose)
else:
    (here / 'compose.yaml').write_text(compose)
    print('wrote', here / 'compose.yaml', len(compose), 'bytes')
