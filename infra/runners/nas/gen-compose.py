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

compose = f"""# arkpedia/arkpedia self-hosted GitHub Actions runners, from one definition: truenas, which takes
# Checks and content jobs (label arkpedia-nas) one at a time, and truenas-deploy, which takes only
# Deploy and the production release (label arkpedia-nas-build), so a release never waits behind a
# Check and never runs in a Check runner (2026-10-13; one Check runner since 2026-10-29).
# A second Check runner (truenas-2) ran from 2026-10-02 to 2026-10-29: two Checks at once shared
# the eight cores and 6 GB each, starved each other's browser suites into timeouts, and both it
# and a release that landed on it hit the 6 GB limit (an OOM kill on 2026-10-29). One runner with
# the memory of both finishes two Checks in about the time two side by side took.
# Registered to that one private repository. Jobs run fenced (no LAN, tailnet, link-local or
# other containers; nothing inbound) as an unprivileged user with no capabilities. No NAS
# share and no Docker socket is mounted: the only storage is each runner's home volume.
# RUNNER_TOKEN and RUNNER3_TOKEN (in .env) are needed only for each runner's first start; they
# are one-hour registration tokens, useless afterwards, and can be blanked once the runners
# show as online.
# Maintenance shells: use `docker exec -u runner arkpedia-runner bash` (or arkpedia-runner-deploy),
# never a root shell in /home/runner, which jobs write to. Each runner-home is its own dataset
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
  # Headless Chromium keeps its renderer memory in /dev/shm; 1 GB with three browser workers
  # coincided with Chromium crashing (SIGTRAP/SIGSEGV) in Checks, so 2 GB (2026-10-22). It counts
  # against mem_limit only as far as it is used.
  shm_size: 2gb
  # No core dumps: a crashing browser or node in a job otherwise dumps into the NAS's
  # .system/cores dataset (1 GiB quota), which filled up and raised an alert (2026-10-22).
  ulimits:
    core: 0
  # The NAS has 8 cores and 31 GB, and its own apps use 8 to 10 GB of that at their peak, so the
  # runners together get 19 GB: 11 for the Check runner, 8 for the deploy runner. `cpus` is a
  # cap, not a reservation, and cpu_shares keeps the NAS's apps first. 6 GB was too little by
  # 2026-10-29 (all three runners peaked at it; a release build was OOM-killed at 6 GB).
  mem_limit: 11g
  memswap_limit: 11g
  cpus: 7
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
      RUNNER_LABELS: ${{RUNNER_LABELS:-arkpedia-nas}}
      PW_WORKERS: "3"
    volumes:
      - runner-home:/home/runner
  runner-deploy:
    <<: *runner
    container_name: arkpedia-runner-deploy
    # A deploy or a release is one `next build` (static generation in 4 workers) and an upload,
    # about 3 minutes; it reached the old 6 GB limit, so 8. 4 cores keep it from crowding a
    # Check out of the eight.
    mem_limit: 8g
    memswap_limit: 8g
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
