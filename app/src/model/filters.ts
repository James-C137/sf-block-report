import type { Filters, Incident } from './types';

/* Chips filter on curated GROUPS (activeCats holds group names).
   Uncategorized reports ('' group) have no chip; they are shown iff at
   least one chip is active — this resolves the mockup's asymmetry
   where toggling every chip off individually behaved differently from
   the None button (PORT_PLAN §6.1). */
export function incidentPasses(inc: Incident, filters: Filters): boolean {
  const { dateSel, activeCats } = filters;
  if (dateSel && (inc.day < dateSel.from || inc.day > dateSel.to)) return false;
  if (activeCats) {
    if (inc.group === '') {
      if (activeCats.size === 0) return false;
    } else if (!activeCats.has(inc.group)) {
      return false;
    }
  }
  return true;
}

export function applyFilters(incidents: ReadonlyArray<Incident>, filters: Filters): Incident[] {
  return incidents.filter((inc) => incidentPasses(inc, filters));
}

export function isPristine(filters: Filters, allCatCount: number): boolean {
  if (filters.dateSel) return false;
  if (filters.activeCats === null) return true;
  return filters.activeCats.size >= allCatCount;
}
