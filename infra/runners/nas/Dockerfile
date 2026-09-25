# syntax=docker/dockerfile:1
# Pinned so a rebuild on the NAS is reproducible; bump the digest to take a newer runner image.
FROM ghcr.io/actions/actions-runner:latest@sha256:e5496277be5d09bc968b3d64911b74e219ac4a3f2edce956a3ecf9271bea1ef4
USER root
# What GitHub's hosted image has and this one lacks: zstd (actions/cache), gh (the release
# job's alert and sync checks), iptables (the entrypoint's fence), and Chromium's system
# libraries for the Playwright tests (the workflows skip --with-deps on self-hosted runners).
# Then no setuid/setgid binary and no file capability is left (no-new-privs already
# neutralizes them; this is defence in depth). Bump the playwright version with package-lock.
RUN apt-get update \
 && apt-get install -y --no-install-recommends zstd xz-utils iptables ca-certificates curl gnupg \
 && install -d -m 0755 /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && PATH="/home/runner/externals/node24/bin:$PATH" npx -y playwright@1.63.0 install-deps chromium \
 && apt-get install -y --no-install-recommends libcap2-bin \
 && rm -rf /var/lib/apt/lists/* /root/.npm \
 && gpasswd -d runner sudo \
 && gpasswd -d runner docker \
 && { getcap -r /usr /opt /home/runner 2>/dev/null | awk '{print $1}' | xargs -r setcap -r; true; } \
 && find / -xdev -type f -perm /6000 -exec chmod ug-s {} +
COPY --chmod=755 <<'ENTRYPOINT_SCRIPT' /usr/local/bin/arkpedia-runner
@@ENTRYPOINT@@
ENTRYPOINT_SCRIPT
ENTRYPOINT ["/usr/local/bin/arkpedia-runner"]
CMD []
