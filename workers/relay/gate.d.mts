interface RelayConfig {
  allowedHosts: string[];
  cloudflare: { siteWorker: string; ports: number[]; streamsPerVisitor: number };
}

export function siteOrigin(relay: RelayConfig, requestUrl: string): string | null;
export function refusal(request: Request, origin: string | null): number;
export function containerEnv(relay: RelayConfig, origin: string | null): Record<'ARKRELAY_ORIGINS' | 'ARKRELAY_ALLOWED_HOSTS' | 'ARKRELAY_PORTS' | 'ARKRELAY_STREAMS', string>;
