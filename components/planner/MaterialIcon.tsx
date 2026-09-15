import Image from 'next/image';
import { getMaterialIconPath } from '@/lib/operators/operatorIconPaths';

/**
 * One material's picture.
 *
 * `getMaterialIconPath` is unguarded -- it builds a path out of a name and
 * returns it whether the file exists or not, so a wrong name is a silent 404
 * that renders as a blank square. Every list that reaches this component is
 * built from the depot catalogue, which getStaticProps checks against
 * public/material-icons/ at build time; nothing here re-checks it, and nothing
 * should reach it that has not been through that gate.
 */
export function MaterialIcon({ name, size = 30 }: { name: string; size?: number }) {
  const src = getMaterialIconPath(name);
  if (!src) return null;
  return <Image src={src} alt="" width={size} height={size} className="planner-mat-icon" />;
}
