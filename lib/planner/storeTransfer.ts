/**
 * A planner file read on a page other than /planner (the Import / export dialog): written
 * straight to the planner's stores, which /planner reads and checks when it next loads. On
 * /planner itself the page applies the file to its own state instead (applyParsed), where it
 * also knows which operators exist. Materials and crafting are kept to the depot's own
 * vocabulary here too; the rest of what /planner drops, it drops on load.
 */
import { writeCrafting } from './crafting';
import { writeDepot, type Depot } from './depot';
import { unheldSummary } from './foreignImport';
import { replacePlannerGoals } from './plannerStorage';
import { writeRoster } from './roster';
import { describeTransfer, type ParsedTransfer } from './transfer';

export function storePlannerTransfer(parsed: ParsedTransfer, depotNames: readonly string[]): string {
  const catalogue = new Set(depotNames);
  const skipped: string[] = [];
  if (parsed.depot) {
    const kept: Depot = {};
    for (const [name, count] of Object.entries(parsed.depot)) {
      if (catalogue.has(name)) kept[name] = count;
      else skipped.push(name);
    }
    parsed = { ...parsed, depot: kept };
    writeDepot(kept);
  }
  if (parsed.roster) writeRoster(parsed.roster);
  if (parsed.crafting) {
    const kept = parsed.crafting.filter((name) => catalogue.has(name) || (skipped.push(name), false));
    parsed = { ...parsed, crafting: kept };
    writeCrafting(new Set(kept));
  }
  if (parsed.goals) replacePlannerGoals(parsed.goals.selectedNames, parsed.goals.builderStates);
  return describeTransfer(parsed) + unheldSummary(skipped);
}
