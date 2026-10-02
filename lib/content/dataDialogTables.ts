/**
 * The tables the Import / export dialog reads (components/account/DataDialog), as loaders for
 * withContentPage: the game import's id map and the planner's depot vocabulary. Every page with
 * the dialog passes these and lists the names in lib/content/tables.mjs. Read only from
 * getStaticProps, so the data never reaches a browser bundle (check:client-chunks).
 */
import { checkMaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { checkImportAliases } from '@/lib/planner/foreignImport';
import { checkGameAccountMap } from '@/lib/planner/gameAccount';

const catalogue = async () => checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default);

export const DATA_DIALOG_TABLES = {
  'game-account-map': async () => checkGameAccountMap((await import('@/data/game-account-map.json')).default),
  'import-aliases': async () => checkImportAliases((await import('@/data/import-aliases.json')).default, await catalogue()),
  'material-catalogue': catalogue,
};

/**
 * A release compiled by older code carries an id map without what the profile card's full-length
 * support units read (moduleTypes, skillIcons): filled from this deployment's copy, by field.
 * Pass the page's props from its withContentPage finalize.
 */
export async function fillAccountMap<P extends object>(props: P): Promise<P> {
  const tables = (props as { __contentTables?: Record<string, unknown> }).__contentTables;
  const map = tables?.['game-account-map'] as Record<string, unknown> | undefined;
  if (!tables || !map || (map.moduleTypes && map.skillIcons)) return props;
  const own = await DATA_DIALOG_TABLES['game-account-map']() as unknown as Record<string, unknown>;
  return { ...props, __contentTables: { ...tables, 'game-account-map': { ...map, moduleTypes: map.moduleTypes ?? own.moduleTypes, skillIcons: map.skillIcons ?? own.skillIcons } } };
}
