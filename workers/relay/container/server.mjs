// The account-import relay, inside its Cloudflare container: a Wisp server that forwards
// encrypted bytes between a reader's browser and Yostar's Arknights servers, and nothing else.
// It is the VPS relay's server (arkpedia/arkpedia-relay server.mjs) with its settings passed in
// by the Worker (../worker.mjs) from config/relay.json, and a TCP port in place of nginx's socket.
//
// The browser runs TLS itself (libcurl.js), so the relay carries ciphertext only: it never sees an
// email, a code, a token or account data. Nothing is logged.
import http from 'node:http';

const list = (name) => {
  try {
    const value = JSON.parse(process.env[name] || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const ORIGINS = new Set(list('ARKRELAY_ORIGINS'));
const ALLOWED_HOSTS = list('ARKRELAY_ALLOWED_HOSTS');
const PORTS = list('ARKRELAY_PORTS');
const STREAMS = Number(process.env.ARKRELAY_STREAMS);
// Without its settings the relay does not start: an empty list would refuse everything anyway,
// and a missing one must never mean "anywhere".
if (!ORIGINS.size || !ALLOWED_HOSTS.length || !PORTS.length || !(STREAMS > 0)) {
  console.error('arkrelay: ARKRELAY_ORIGINS, ARKRELAY_ALLOWED_HOSTS, ARKRELAY_PORTS and ARKRELAY_STREAMS are required');
  process.exit(1);
}

// Loaded after the check, so a relay without settings stops before anything else runs.
const { server: wisp, logging } = await import('@mercuryworkshop/wisp-js/server');
logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  hostname_whitelist: ALLOWED_HOSTS.map((pattern) => new RegExp(pattern)),
  port_whitelist: PORTS,
  allow_direct_ip: false,
  allow_private_ips: false,
  allow_loopback_ips: false,
  allow_udp_streams: false,
  // Per visitor. Not stream_limit_per_host: in wisp-js 0.5.0 it crashes the server on the first
  // stream ("connection.streams is not iterable").
  stream_limit_total: STREAMS,
  // The container's own resolver, which Cloudflare answers.
  dns_method: 'lookup',
  dns_result_order: 'ipv4first',
  parse_real_ip: false,
});

const server = http.createServer((req, res) => {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found\n');
});

server.on('upgrade', (req, socket, head) => {
  // The Worker checks the same; this is the second look.
  if (req.url !== '/wisp/' || !ORIGINS.has(req.headers.origin)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wisp.routeRequest(req, socket, head);
});

// Reachable only through the container's Durable Object, never from the internet.
server.listen(8080, '0.0.0.0');

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
