# Audio relay (relay.arkpedia.net/msr/&lt;cid&gt;)

Monster Siren's CDN (`*.hycdn.cn`, Alibaba) sends each listener to its nearest edge. On
2026-10-14 an iPhone on a Korean mobile network got a song's first bytes from that edge and then
nothing, in Safari and Brave; over a VPN (another edge) it played. The player
(`lib/music/audioElement.ts`) loads songs from the CDN directly and switches a device to this
relay only after a song made no sound there; it remembers that for a week.

The relay fetches Monster Siren's signed address for the song (its public song API) and streams
the file through, byte ranges and all. It stores nothing and logs no listener.

## Deploy (by hand, on hetzner-vps)

    scp infra/audio-relay/server.mjs hetzner-vps:/opt/arkaudio/server.mjs
    scp infra/audio-relay/arkaudio.service hetzner-vps:/etc/systemd/system/arkaudio.service
    ssh hetzner-vps 'systemctl daemon-reload && systemctl enable --now arkaudio && systemctl restart arkaudio'

nginx: merge `nginx-relay.arkpedia.net.conf` into `/etc/nginx/sites-enabled/relay.arkpedia.net`
(keep a backup), then `nginx -t && systemctl reload nginx`.

Check: `curl -s -o /dev/null -r 0-65535 -w '%{http_code} %{content_type}\n' https://relay.arkpedia.net/msr/880375`
gives `206 audio/mpeg`.
