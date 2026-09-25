#!/bin/sh
# Egress limits for ghrunner, the user the arkpedia/arkpedia GitHub Actions runner runs as.
# CI jobs run npm packages; they must reach the internet but never the tailnet (the home NAS),
# private or link-local ranges, or this host's own services. Loopback ports >= 1024 stay open for
# the test servers (3192, 3193, 3204), except the ones local daemons listen on.
set -eu
for ipt in iptables ip6tables; do
  $ipt -w -N GHRUNNER-EGRESS 2>/dev/null || $ipt -w -F GHRUNNER-EGRESS
  $ipt -w -A GHRUNNER-EGRESS -o lo -p udp --dport 53 -j RETURN
  $ipt -w -A GHRUNNER-EGRESS -o lo -p tcp --dport 53 -j RETURN
  $ipt -w -A GHRUNNER-EGRESS -m addrtype --dst-type LOCAL -p tcp --dport 1:1023 -j REJECT --reject-with tcp-reset
  $ipt -w -A GHRUNNER-EGRESS -m addrtype --dst-type LOCAL -p tcp -m multiport --dports 6060,8080,41641,56369 -j REJECT --reject-with tcp-reset
  $ipt -w -A GHRUNNER-EGRESS -m addrtype --dst-type LOCAL -p udp --dport 1:1023 -j REJECT
done
for net in 100.64.0.0/10 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16; do
  iptables -w -A GHRUNNER-EGRESS -d "$net" -j REJECT
done
for net in fd7a:115c:a1e0::/48 fc00::/7 fe80::/10; do
  ip6tables -w -A GHRUNNER-EGRESS -d "$net" -j REJECT
done
for ipt in iptables ip6tables; do
  $ipt -w -C OUTPUT -m owner --uid-owner ghrunner -j GHRUNNER-EGRESS 2>/dev/null \
    || $ipt -w -I OUTPUT 1 -m owner --uid-owner ghrunner -j GHRUNNER-EGRESS
done
