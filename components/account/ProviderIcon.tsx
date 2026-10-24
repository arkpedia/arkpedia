import { ApplicationImage, type ApplicationAsset } from "@/components/content/ContentImage";

// Official provider artwork published in arkpedia-image-assets PR #55.
// This UI pin stays independent of older page content releases.
const REVISION = "75bca3430542ff200f79b60621999a6c18c16b1d";
const ICONS = {
  google: { repository: "arkpedia-image-assets", revision: REVISION, path: "essential-icons/google.png" },
  discord: { repository: "arkpedia-image-assets", revision: REVISION, path: "essential-icons/discord.svg" },
} satisfies Record<string, ApplicationAsset>;

export default function ProviderIcon({ provider }: { provider: keyof typeof ICONS }) {
  return <ApplicationImage asset={ICONS[provider]} alt="" aria-hidden="true" width={28} height={28} unoptimized />;
}
