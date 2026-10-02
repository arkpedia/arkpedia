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
