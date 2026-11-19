/**
 * Where the reader's chart is kept: one localStorage key of its own, apart from their tier
 * list, read and written only here (CLAUDE.md, "Arkpedia accounts": one store per piece of
 * reader data, so a later account upload has one source).
 */
import { defaultChart, parseChart, type ChartState } from './chart';
import { createLocalStore } from './localStore';

export const CHART_KEY = 'arkpedia:chart-maker:v1';
export const CHART_EVENT = 'arkpediaChartMakerChanged';

const store = createLocalStore<ChartState>(CHART_KEY, CHART_EVENT, parseChart, defaultChart());
export const writeChart = store.write;
export const useChart = store.use;
