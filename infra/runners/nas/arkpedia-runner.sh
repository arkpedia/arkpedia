#!/bin/bash
# Entrypoint of the arkpedia/arkpedia self-hosted GitHub Actions runner container.
#
# CI jobs run hundreds of npm packages and hold the repository's deploy secrets, and this
# container runs on a NAS. So it starts as root only long enough to fence its own network
# namespace (no LAN, no tailnet, no link-local, no other containers, not this network's own
# public IP, no IPv6, nothing inbound, and a cap on new connections), then runs the runner
# -- or the command given -- as the unprivileged user "runner" with every capability
# dropped from the bounding set and no-new-privs set, so nothing in a job can undo the
# fence or become root again. If any part of the fence cannot be applied, it exits.
set -euo pipefail

BLOCKED_V4="0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4"

reject() { iptables -w -A OUTPUT "$@" -j REJECT 2>/dev/null || iptables -w -A OUTPUT "$@" -j DROP; }

# This network's public IPv4: through NAT loopback it reaches the router and any port
# forward (e.g. a reverse proxy) with a LAN source address. Looked up before the fence.
public_ip() {
  local url ip
  for url in https://checkip.amazonaws.com https://api.ipify.org https://ipv4.icanhazip.com; do
    ip=$(curl -4 -fsS --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]') || continue
    if [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then echo "$ip"; return 0; fi
  done
  return 1
}

fence_v6() {
  # TrueNAS enables IPv6 on Docker networks; the compose sysctl turns it off, and this
  # drops whatever IPv6 is left. If ip6tables is unavailable, every interface must have
  # IPv6 disabled or the container refuses to start.
  if ip6tables -w -F OUTPUT 2>/dev/null; then
    ip6tables -w -A OUTPUT -o lo -j ACCEPT
    ip6tables -w -P OUTPUT DROP
    ip6tables -w -F INPUT
    ip6tables -w -A INPUT -i lo -j ACCEPT
    ip6tables -w -P INPUT DROP
  else
    local f
    for f in /proc/sys/net/ipv6/conf/*/disable_ipv6; do
      [ ! -e "$f" ] || [ "$(cat "$f")" = 1 ] || { echo "arkpedia-runner: IPv6 is on ($f) and cannot be fenced; refusing to start." >&2; exit 1; }
    done
  fi
}

fence() {
  local own ns net
  own=$(public_ip) || { echo "arkpedia-runner: could not look up this network's public IP; refusing to start unfenced." >&2; exit 1; }
  iptables -w -F OUTPUT
  iptables -w -P OUTPUT ACCEPT
  iptables -w -A OUTPUT -o lo -j ACCEPT
  # The connection-tracking table is shared with the whole NAS (Docker NATs through the
  # host): cap how fast and how many flows a job can open, so it cannot fill the table
  # and cut every app off the network.
  iptables -w -A OUTPUT -m conntrack --ctstate NEW -m hashlimit --hashlimit-above 200/second \
    --hashlimit-burst 2000 --hashlimit-name arkpedia-new -j REJECT
  iptables -w -A OUTPUT -m conntrack --ctstate NEW -m connlimit --connlimit-above 8192 \
    --connlimit-mask 0 -j REJECT
  # DNS, and only DNS, to the resolver Docker handed this container (127.0.0.11 on a
  # compose network, which the loopback rule already covers).
  for ns in $(awk '/^nameserver/ {print $2}' /etc/resolv.conf); do
    case "$ns" in *:*) continue ;; esac
    iptables -w -A OUTPUT -d "$ns" -p udp --dport 53 -j ACCEPT
    iptables -w -A OUTPUT -d "$ns" -p tcp --dport 53 -j ACCEPT
  done
  for net in $BLOCKED_V4 "$own/32"; do reject -d "$net"; done
  # Nothing may connect in: the test servers inside listen on 0.0.0.0.
  iptables -w -F INPUT
  iptables -w -A INPUT -i lo -j ACCEPT
  iptables -w -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -w -P INPUT DROP
  fence_v6
  echo "arkpedia-runner: network fence applied (own public IP $own blocked):"
  { iptables -w -S; ip6tables -w -S 2>/dev/null || true; } | sed 's/^/  /'
}

as_runner() {
  exec setpriv --reuid=runner --regid=runner --init-groups \
    --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs \
    env HOME=/home/runner USER=runner LOGNAME=runner "$@"
}

start_runner() {
  cd /home/runner
  if [ ! -f .runner ]; then
    if [ -z "${RUNNER_TOKEN:-}" ]; then
      echo "arkpedia-runner: not registered yet and RUNNER_TOKEN is empty." >&2
      exit 1
    fi
    ./config.sh --unattended --url https://github.com/arkpedia/arkpedia --token "$RUNNER_TOKEN" \
      --name "${RUNNER_NAME:-truenas}" --labels "${RUNNER_LABELS:-arkpedia-nas}" --work _work --replace
  fi
  unset RUNNER_TOKEN
  exec ./run.sh
}

if [ "${1:-}" = "--as-runner" ]; then
  [ "$(id -u)" != 0 ] || { echo "arkpedia-runner: --as-runner must not run as root." >&2; exit 1; }
  start_runner
fi

[ "$(id -u)" = 0 ] || { echo "arkpedia-runner: must start as root to apply the network fence." >&2; exit 1; }
fence
if [ $# -gt 0 ]; then as_runner "$@"; else as_runner "$0" --as-runner; fi
