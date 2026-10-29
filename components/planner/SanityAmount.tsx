import Image from '@/components/content/ContentImage';

/** A sanity figure with the game's sanity symbol (the one the stage pages and the Pull Planner draw),
 *  and the word for a screen reader: the symbol is the label for everyone else. */
export default function SanityAmount({ amount, size = 'small' }: { amount: number; size?: 'small' | 'large' }) {
  const px = size === 'large' ? 26 : 14;
  return (
    <span className={`planner-sanity-amount${size === 'large' ? ' large' : ''}`}>
      <Image src="/stat-icons/sanity.webp" width={px} height={px} alt="" />
      {amount.toLocaleString('en-US')}
      <span className="visually-hidden"> sanity</span>
    </span>
  );
}
