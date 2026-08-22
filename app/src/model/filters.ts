import type { Filters, Incident } from './types';

/* Uncategorized reports ('' category) have no chip. They are shown iff
   at least one chip is active — this resolves the mockup's asymmetry
   where toggling every chip off individually behaved differently from
   the None button (PORT_PLAN §6.1). */
export function incidentPasses(inc: Incident, filters: Filters): boolean {
  const { dateSel, activeCats } = filters;
  if (dateSel && (inc.day < dateSel.from || inc.day > dateSel.to)) return false;
  if (activeCats) {
    if (inc.category === '') {
      if (activeCats.size === 0) return false;
    } else if (!activeCats.has(inc.category)) {
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
