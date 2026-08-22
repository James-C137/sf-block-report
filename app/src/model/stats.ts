import type { Incident } from './types';

export function sortedCounts(m: Record<string, number>): Array<[string, number]> {
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

export function dailyCounts(incidents: ReadonlyArray<Incident>): Record<string, number> {
  const daily: Record<string, number> = {};
  for (const inc of incidents) if (inc.day) daily[inc.day] = (daily[inc.day] ?? 0) + 1;
  return daily;
}

export function categoryCounts(incidents: ReadonlyArray<Incident>): Record<string, number> {
  const cats: Record<string, number> = {};
  for (const inc of incidents) if (inc.category) cats[inc.category] = (cats[inc.category] ?? 0) + 1;
  return cats;
}

export function neighborhoodCounts(incidents: ReadonlyArray<Incident>): Record<string, number> {
  const hoods: Record<string, number> = {};
  for (const inc of incidents) {
    if (inc.neighborhood) hoods[inc.neighborhood] = (hoods[inc.neighborhood] ?? 0) + 1;
  }
  return hoods;
}

export function maxDay(incidents: ReadonlyArray<Incident>): string | null {
  let max: string | null = null;
  for (const inc of incidents) if (inc.day && (max === null || inc.day > max)) max = inc.day;
  return max;
}
