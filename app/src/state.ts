/* One AppState, one commit path. UI events mutate filters through
   commit(); subscribers (map layers, panel widgets) re-derive from the
   filtered incident set. Unidirectional, no framework. */

import type { ReportWindow } from './data/incidents';
import { buildField } from './model/density';
import { applyFilters, isPristine } from './model/filters';
import type { DensityField, Filters, Incident, Spot } from './model/types';
import { aggregateSpots } from './model/aggregate';

export type SourceStatus = 'pending' | 'ok' | 'failed';

export interface AppState {
  win: ReportWindow;
  incidents: Incident[];
  live: boolean;
  capped: boolean;
  allCats: Array<[string, number]>; /* full-window category counts, sorted */
  filters: Filters;
  pristineField: DensityField; /* never overwritten after load */
  load: { blocks: SourceStatus; buildings: SourceStatus };
}

export interface Derived {
  filtered: Incident[];
  pristine: boolean;
  /* = pristineField when pristine; rebuilt from the filtered set otherwise */
  activeField: DensityField;
  spots: Spot[];
}

export class Store {
  private subs: Array<(d: Derived) => void> = [];
  private cachedDerived: Derived | null = null;

  constructor(public state: AppState) {}

  derive(): Derived {
    if (this.cachedDerived) return this.cachedDerived;
    const { state } = this;
    const pristine = isPristine(state.filters, state.allCats.length);
    const filtered = pristine ? state.incidents : applyFilters(state.incidents, state.filters);
    const activeField = pristine ? state.pristineField : buildField(filtered);
    const spots = aggregateSpots(filtered);
    this.cachedDerived = { filtered, pristine, activeField, spots };
    return this.cachedDerived;
  }

  subscribe(fn: (d: Derived) => void): void {
    this.subs.push(fn);
  }

  commit(mutate: (s: AppState) => void): void {
    mutate(this.state);
    this.cachedDerived = null;
    const d = this.derive();
    for (const fn of this.subs) fn(d);
  }
}
