# Self-hosted runners

How the two self-hosted runners in [docs/development/ci-runner.md](../../docs/development/ci-runner.md)
are built. Both are registered to arkpedia/arkpedia only, run jobs as an unprivileged
user, and keep jobs off the machine's private networks and own services.

## `nas/`: container on a TrueNAS NAS (runner `truenas`)

A Dockge stack. `compose.yaml` is generated, and is the file the stack runs:

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
  - 8 GB, 6 CPUs, low CPU shares;
  - the runner's home is a bind-backed volume on a dataset with a quota (`RUNNER_HOME_DIR`).
- **First start:** needs `RUNNER_TOKEN` in the stack's `.env`
  (`gh api -X POST repos/arkpedia/arkpedia/actions/runners/registration-token -q .token`).
  After that it can be blank.

## `vps/`: systemd service on a Linux VPS (runner `hetzner-vps`)

- The runner is installed with its own `svc.sh` as user `ghrunner`.
- `arkpedia-limits.conf` is the service's drop-in: memory, CPU and OOM limits, and it
  requires the egress unit.
- `ghrunner-egress.sh` and `ghrunner-egress.service` apply iptables owner-match rules to
  `ghrunner`: no tailnet, no private or link-local ranges, no host services below 1024
  or the daemons' ports.

Changing either runner means changing it here and on the machine; neither is deployed
from this folder automatically.
