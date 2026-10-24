import Image from '@/components/content/ContentImage';

// Official provider assets are served locally, including Google's current gradient G.
export default function ProviderIcon({ provider }: { provider: 'google' | 'discord' }) {
  return <Image src={`/icons/auth/${provider === 'google' ? 'google.png' : 'discord.svg'}`}
    alt="" aria-hidden="true" width={28} height={28} unoptimized />;
}
