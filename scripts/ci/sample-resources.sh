#!/usr/bin/env bash
# What the browser suite's Chromiums and its Next server share in the runner, sampled every 5 s
# until killed: /dev/shm and /tmp (both tmpfs, both charged to the container's memory), the
# container's memory (cgroup v2) and its OOM kills, the server's and Chromium's resident memory,
# and the load. check.yml's browser step runs it in the background, then `--report` prints the
# peaks, and the whole log when the suite failed, so a stall names the resource that ran out.
#
# Why (2026-10-22): on the NAS runners all three Playwright workers timed out within the same
# few seconds, on Next 14 and Next 16 alike, at the point where /pulls, /techniques and the
# event and enemy tab strips load together; one such run began with Chromium refusing /pulls
# (net::ERR_INSUFFICIENT_RESOURCES). The container caps memory at 6 GB and /dev/shm at 1 GB
# (infra/runners/nas/compose.yaml).
#
#   bash scripts/ci/sample-resources.sh <log>                    sample until killed
#   bash scripts/ci/sample-resources.sh --report <log> <status>  peaks; the log too if status != 0
set -u

if [ "${1:-}" = "--report" ]; then
  log=$2 status=${3:-0}
  [ -s "$log" ] || { echo "No resource samples."; exit 0; }
  awk 'NR == 1 { for (i = 2; i <= NF; i++) name[i] = $i; next }
       { n++; for (i = 2; i <= NF; i++) if ($i ~ /^[0-9.]+$/ && (!(i in peak) || $i + 0 > peak[i] + 0)) peak[i] = $i }
       END { line = "Peak over " n " samples:"; for (i = 2; i <= 11; i++) line = line " " name[i] "=" (peak[i] == "" ? "?" : peak[i]); print line }' "$log"
  if [ "$status" != 0 ]; then echo "All samples (the suite failed):"; cat "$log"; fi
  exit 0
fi

out=$1
# What already fills /tmp when the suite starts: it is a tmpfs that outlives each job, so what a
# job leaves there stays until the runner restarts (1.3 GB before the suite on 2026-10-22).
echo "/tmp at the start, largest first:"; du -xsm /tmp/* /tmp/.[!.]* 2>/dev/null | sort -rn | head -8
echo "time shm_mb shm_size_mb tmp_mb mem_mb mem_max_mb oom_kills server_mb chrome_mb chrome_procs load1" > "$out"
used() { df -Pm "$1" 2>/dev/null | awk 'NR == 2 { print $3 }'; }
while true; do
  shm=$(used /dev/shm) size=$(df -Pm /dev/shm 2>/dev/null | awk 'NR == 2 { print $2 }') tmp=$(used /tmp)
  mem=$(awk '{ print int($1 / 1048576) }' /sys/fs/cgroup/memory.current 2>/dev/null)
  max=$(awk '{ print ($1 == "max" ? "none" : int($1 / 1048576)) }' /sys/fs/cgroup/memory.max 2>/dev/null)
  oom=$(awk '$1 == "oom_kill" { print $2 }' /sys/fs/cgroup/memory.events 2>/dev/null)
  server=$(ps -eo rss=,args= | awk '/next start/ && !/awk/ { s += $1 } END { print int(s / 1024) }')
  chrome=$(ps -eo rss=,args= | awk '/chrom(e|ium)|headless_shell/ && !/awk/ { s += $1; n++ } END { print int(s / 1024), n + 0 }')
  echo "$(date -u +%H:%M:%S) ${shm:-?} ${size:-?} ${tmp:-?} ${mem:-?} ${max:-?} ${oom:-?} $server $chrome $(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo ?)" >> "$out"
  sleep 5
done
