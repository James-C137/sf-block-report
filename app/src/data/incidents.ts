/* Live incidents: SFPD Incident Reports 2018–present (wg3w-h783),
   browser-direct Socrata, ONE request per page load. Sizing against API
   limits: a month of geocoded SF reports runs ~11–13k rows and SODA 2.1
   accepts an arbitrary $limit, so the whole window fits a single request
   with the cap at ~2x a typical month. Ordered newest-first: if an
   extreme month ever hits the cap we keep the most recent reports.
   On failure or timeout, a seeded simulated set stands in (same
   Incident[] interface) so the map never goes blank. */

import {
  GRID_MAX_LAT, GRID_MAX_LNG, GRID_MIN_LAT, GRID_MIN_LNG,
  INCIDENTS_DATASET, INCIDENT_CAP, INCIDENT_TIMEOUT_MS,
  MS_DAY, SODA_APP_TOKEN, WINDOW_DAYS,
} from '../config';
import type { Incident } from '../model/types';

/* the reporting window: last 30 full days, SF calendar. The dataset
   refreshes daily and runs a day or two behind, so the window ends
   yesterday (today is excluded). */
export function sfDayISO(msBack: number, now: number = Date.now()): string {
  return new Date(now - msBack).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export interface ReportWindow {
  startDay: string; /* inclusive */
  endDayExclusive: string;
  endDay: string; /* last day shown */
  days: string[]; /* every ISO day in the window, in order */
}

export function reportWindow(now: number = Date.now()): ReportWindow {
  const startDay = sfDayISO(WINDOW_DAYS * MS_DAY, now);
  const endDayExclusive = sfDayISO(0, now);
  const endDay = sfDayISO(MS_DAY, now);
  const days: string[] = [];
  const startMs = new Date(`${startDay}T00:00:00Z`).getTime();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    days.push(new Date(startMs + i * MS_DAY).toISOString().slice(0, 10));
  }
  return { startDay, endDayExclusive, endDay, days };
}

export function incidentsUrl(win: ReportWindow): string {
  const params = [
    `$select=${encodeURIComponent('incident_date,incident_category,analysis_neighborhood,intersection,latitude,longitude')}`,
    `$where=${encodeURIComponent(
      `incident_date >= '${win.startDay}' AND incident_date < '${win.endDayExclusive}'` +
        ' AND latitude IS NOT NULL AND longitude IS NOT NULL',
    )}`,
    `$order=${encodeURIComponent('incident_datetime DESC')}`,
    `$limit=${INCIDENT_CAP}`,
  ];
  if (SODA_APP_TOKEN) params.push(`$$app_token=${encodeURIComponent(SODA_APP_TOKEN)}`);
  return `${INCIDENTS_DATASET}?${params.join('&')}`;
}

interface SocrataRow {
  incident_date?: string;
  incident_category?: string;
  analysis_neighborhood?: string;
  intersection?: string;
  latitude?: string;
  longitude?: string;
}

export function parseRows(rows: SocrataRow[]): Incident[] {
  const out: Incident[] = [];
  for (const r of rows) {
    const lng = parseFloat(r.longitude ?? '');
    const lat = parseFloat(r.latitude ?? '');
    if (!isFinite(lng) || !isFinite(lat)) continue;
    if (lng < GRID_MIN_LNG || lng > GRID_MAX_LNG || lat < GRID_MIN_LAT || lat > GRID_MAX_LAT) continue;
    out.push({
      day: (r.incident_date ?? '').slice(0, 10),
      category: r.incident_category ?? '',
      neighborhood: r.analysis_neighborhood ?? '',
      intersection: r.intersection ?? '',
      lng,
      lat,
    });
  }
  return out;
}

export interface IncidentLoad {
  incidents: Incident[];
  live: boolean;
  capped: boolean;
}

export async function fetchIncidents(win: ReportWindow): Promise<IncidentLoad> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INCIDENT_TIMEOUT_MS);
  try {
    const res = await fetch(incidentsUrl(win), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as SocrataRow[];
    const incidents = parseRows(rows);
    if (!incidents.length) throw new Error('no geocoded rows in window');
    return { incidents, live: true, capped: rows.length >= INCIDENT_CAP };
  } finally {
    clearTimeout(timer);
  }
}

/* ---- simulated fallback: gaussian clusters + thin scatter, seeded ---- */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeFakeIncidents(win: ReportWindow): Incident[] {
  const rand = mulberry32(20260821);
  const gauss = (): number => {
    const u = rand() || 1e-9;
    const v = rand() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clusters = [
    { c: [-122.414, 37.783], n: 950, sx: 0.0075, sy: 0.0055 }, /* Tenderloin / SoMa */
    { c: [-122.419, 37.76], n: 520, sx: 0.006, sy: 0.0075 }, /* Mission */
    { c: [-122.39, 37.732], n: 280, sx: 0.0085, sy: 0.007 }, /* Bayview */
  ];
  const out: Incident[] = [];
  const push = (lng: number, lat: number): void => {
    const day = win.days[Math.floor(rand() * win.days.length)] ?? win.startDay;
    out.push({ day, category: '', neighborhood: '', intersection: '', lng, lat });
  };
  for (const k of clusters) {
    for (let i = 0; i < k.n; i++) push(k.c[0]! + gauss() * k.sx, k.c[1]! + gauss() * k.sy);
  }
  for (let i = 0; i < 250; i++) push(-122.515 + rand() * 0.15, 37.708 + rand() * 0.112);
  return out;
}

export async function loadIncidents(win: ReportWindow): Promise<IncidentLoad> {
  try {
    return await fetchIncidents(win);
  } catch (err) {
    console.warn('Live incident fetch failed — using simulated fallback:', err);
    return { incidents: makeFakeIncidents(win), live: false, capped: false };
  }
}
