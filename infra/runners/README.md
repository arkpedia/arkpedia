# Self-hosted runners

How the two self-hosted runners (the NAS takes every job, the VPS stands by) in [docs/development/ci-runner.md](../../docs/development/ci-runner.md)
are built. Both are registered to arkpedia/arkpedia only, run jobs as an unprivileged
user, and keep jobs off the machine's private networks and own services.

## `nas/`: two containers on a TrueNAS NAS (runners `truenas` and `truenas-2`)

A Dockge stack with two runners from one definition (a YAML anchor), so two jobs run side by
side: two pull requests' Checks, or a Check and a Deploy. `compose.yaml` is generated, and is
the file the stack runs:

```sh
python3 infra/runners/nas/gen-compose.py   # writes compose.yaml from Dockerfile + arkpedia-runner.sh
```

- **Image:** GitHub's official runner image, pinned by digest. It adds gh, zstd, iptables
  and Chromium's libraries, and strips setuid bits and file capabilities. The image is
  built on the NAS (`pull_policy: build`), so Dockge's Update rebuilds it.
- **`arkpedia-runner.sh`:** runs as root only to fence the container's own network:
  - it blocks private, tailnet, link-local and special ranges, the network's own public
    IP, IPv6 and inbound connections, and rate-limits new connections;
  - it then execs the runner as `runner`, with every capability dropped and no-new-privs
    set;
  - if any rule fails, the container exits.
- **Compose:**
  - read-only root and tmpfs `/tmp`;
  - public DNS;
  - 6 GB and 4 CPUs each, low CPU shares, and two browser workers each (`PW_WORKERS=2`).
    A full Check fits in 6 GB, measured in this container on 2026-10-02;
  - each runner's home is a bind-backed volume on its own dataset with a quota
    (`RUNNER_HOME_DIR`, `RUNNER2_HOME_DIR`).
- **First start:** each runner needs a token in the stack's `.env`, `RUNNER_TOKEN` and
  `RUNNER2_TOKEN` (`gh api -X POST repos/arkpedia/arkpedia/actions/runners/registration-token -q .token`).
  After that they can be blank.

## `vps/`: systemd service on a Linux VPS (runner `hetzner-vps`)

- The runner is installed with its own `svc.sh` as user `ghrunner`.
- `arkpedia-limits.conf` is the service's drop-in: memory, CPU and OOM limits, and it
  requires the egress unit.
- `ghrunner-egress.sh` and `ghrunner-egress.service` apply iptables owner-match rules to
  `ghrunner`: no tailnet, no private or link-local ranges, no host services below 1024
  or the daemons' ports.

Changing either runner means changing it here and on the machine; neither is deployed
from this folder automatically.
