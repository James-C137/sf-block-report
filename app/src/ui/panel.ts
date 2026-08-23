/* The report panel: period + reset, count, histogram (which doubles as
   the date brush), category filter chips with All/None, neighborhood
   ranking, notice, and the footnote's updated date. */

import { WINDOW_DAYS } from '../config';
import { dailyCounts, maxDay, neighborhoodCounts, sortedCounts } from '../model/stats';
import { NHOOD_DISPLAY, INCIDENT_CAP } from '../config';
import type { Store } from '../state';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export function showNotice(msg: string): void {
  const n = el('notice');
  n.textContent = msg;
  n.classList.add('show');
}

export function initPanel(store: Store): void {
  const { state } = store;
  const days = state.win.days;
  const histEl = el('histogram');
  const periodEl = el('period-range');
  const resetEl = el<HTMLButtonElement>('range-reset');
  const countEl = el('count-value');
  const rankingEl = el('ranking');
  const chipsEl = el('chips');

  el('hist-start').textContent = fmtDay(days[0] ?? state.win.startDay);
  el('hist-end').textContent = fmtDay(days[days.length - 1] ?? state.win.endDay);

  /* quirk fix (PORT_PLAN §6.5): "Updated" reflects the dataset's true
     freshest day, not the fetch window's end */
  const updated = state.live ? maxDay(state.incidents) : null;
  if (updated) el('updated').textContent = `Updated ${fmtDay(updated)}, ${updated.slice(0, 4)}.`;
  if (state.capped) {
    showNotice(`Unusually heavy period — showing the ${INCIDENT_CAP.toLocaleString('en-US')} most recent reports.`);
  }
  if (!state.live) {
    el('data-note').textContent = 'Live SFPD data could not be reached — the density shown is simulated.';
    showNotice('Live incident data could not be loaded — showing simulated density.');
    histEl.setAttribute('aria-disabled', 'true');
    histEl.classList.add('inert');
  }

  /* ---- histogram + dim state ---- */
  let bars: HTMLSpanElement[] = [];
  const renderHistogram = (vals: number[]): void => {
    histEl.innerHTML = '';
    bars = [];
    let max = 0;
    let peak = 0;
    vals.forEach((v, i) => {
      if (v > max) {
        max = v;
        peak = i;
      }
    });
    if (!max) max = 1;
    vals.forEach((v, i) => {
      const bar = document.createElement('span');
      bar.style.height = `${Math.round((v / max) * 100)}%`;
      if (i === peak) bar.className = 'hi'; /* window-peak by design (§6.8) */
      bars.push(bar);
      histEl.appendChild(bar);
    });
  };
  const applyDim = (): void => {
    const sel = store.state.filters.dateSel;
    const a = sel ? days.indexOf(sel.from) : -1;
    const b = sel ? days.indexOf(sel.to) : -1;
    bars.forEach((bar, i) => bar.classList.toggle('dim', !!sel && (i < a || i > b)));
  };
  const updatePeriodLabel = (): void => {
    const sel = store.state.filters.dateSel;
    const from = sel?.from ?? days[0] ?? state.win.startDay;
    const to = sel?.to ?? days[days.length - 1] ?? state.win.endDay;
    periodEl.textContent = `${fmtDay(from)} – ${fmtDay(to)}, ${to.slice(0, 4)}`;
    resetEl.hidden = !sel;
  };

  /* ---- category chips (live only): every category gets its own chip,
     sorted by count, no "Other" aggregate ---- */
  const chipEls = new Map<string, HTMLButtonElement>();
  const renderChips = (): void => {
    chipsEl.innerHTML = '';
    chipEls.clear();
    if (!state.live) {
      for (const label of ['Larceny / Theft', 'Assault', 'Motor Vehicle Theft', 'Burglary', 'Robbery']) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label;
        chipsEl.appendChild(chip);
      }
      return;
    }
    el('chips-actions').hidden = false;
    for (const [name, count] of state.allCats) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = name;
      chip.setAttribute('aria-pressed', 'true');
      const n = document.createElement('span');
      n.className = 'n num';
      n.textContent = count.toLocaleString('en-US');
      chip.appendChild(n);
      chip.addEventListener('click', () => {
        store.commit((s) => {
          const active = s.filters.activeCats ?? new Set(s.allCats.map(([c]) => c));
          if (active.has(name)) active.delete(name);
          else active.add(name);
          s.filters.activeCats = active;
        });
      });
      chipEls.set(name, chip);
      chipsEl.appendChild(chip);
    }
  };
  const paintChips = (): void => {
    const active = store.state.filters.activeCats;
    for (const [name, chip] of chipEls) {
      const on = !active || active.has(name);
      chip.classList.toggle('off', !on);
      chip.setAttribute('aria-pressed', String(on));
    }
  };
  el('cats-all').addEventListener('click', () => {
    if (!state.live) return;
    store.commit((s) => {
      s.filters.activeCats = new Set(s.allCats.map(([c]) => c));
    });
  });
  el('cats-none').addEventListener('click', () => {
    if (!state.live) return;
    store.commit((s) => {
      s.filters.activeCats = new Set();
    });
  });

  /* ---- date brush: drag across the histogram. Pointer capture keeps
     the drag smooth on touch (touch-action:none stops page scroll).
     Single tap = one day; whole track, or the Reset link, = full. ---- */
  let brushing = false;
  let anchor = 0;
  const barIndex = (ev: PointerEvent): number => {
    const r = histEl.getBoundingClientRect();
    const t = (ev.clientX - r.left) / (r.width || 1);
    return Math.max(0, Math.min(WINDOW_DAYS - 1, Math.floor(t * WINDOW_DAYS)));
  };
  const previewSel = (a: number, b: number): void => {
    store.state.filters.dateSel = { from: days[Math.min(a, b)]!, to: days[Math.max(a, b)]! };
    applyDim();
    updatePeriodLabel();
  };
  histEl.addEventListener('pointerdown', (ev) => {
    if (!state.live) return;
    brushing = true;
    anchor = barIndex(ev);
    previewSel(anchor, anchor);
    try {
      histEl.setPointerCapture(ev.pointerId);
    } catch {
      /* capture unsupported — drag still works within the element */
    }
    ev.preventDefault();
  });
  histEl.addEventListener('pointermove', (ev) => {
    if (!brushing) return;
    previewSel(anchor, barIndex(ev));
  });
  const commitBrush = (clear: boolean): void => {
    if (!brushing) return;
    brushing = false;
    store.commit((s) => {
      const sel = s.filters.dateSel;
      const full = sel && sel.from === days[0] && sel.to === days[days.length - 1];
      if (clear || full) s.filters.dateSel = null;
    });
  };
  histEl.addEventListener('pointerup', () => commitBrush(false));
  histEl.addEventListener('pointercancel', () => commitBrush(true));
  resetEl.addEventListener('click', () => {
    store.commit((s) => {
      s.filters.dateSel = null;
    });
  });

  /* ---- ranking ---- */
  const renderRanking = (rows: Array<[string, number]>): void => {
    rankingEl.innerHTML = '';
    const max = rows[0]?.[1] ?? 1;
    rows.forEach(([name, count], idx) => {
      const li = document.createElement('li');
      li.innerHTML =
        `<div class="rank-row"><span class="idx num">${idx + 1}</span>` +
        `<span class="name"></span><span class="val num">${count.toLocaleString('en-US')}</span></div>` +
        `<div class="rank-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></div>`;
      li.querySelector('.name')!.textContent = name;
      rankingEl.appendChild(li);
    });
  };

  /* ---- refresh on every commit ---- */
  const refresh = (): void => {
    const d = store.derive();
    /* the histogram always spans the FULL window (it is the brush
       track), showing category-filtered daily counts; the count and
       ranking come from the fully filtered set */
    const catOnly = store.state.incidents.filter((inc) => {
      const active = store.state.filters.activeCats;
      if (!active) return true;
      return inc.category === '' ? active.size > 0 : active.has(inc.category);
    });
    const daily = dailyCounts(catOnly);
    renderHistogram(days.map((day) => daily[day] ?? 0));
    applyDim();
    updatePeriodLabel();
    countEl.textContent = state.live ? d.filtered.length.toLocaleString('en-US') : '—';
    /* every neighborhood with reports — the panel scrolls (user call;
       was a top-5) */
    renderRanking(
      sortedCounts(neighborhoodCounts(d.filtered))
        .map(([name, count]) => [NHOOD_DISPLAY[name] ?? name, count]),
    );
    paintChips();
  };

  renderChips();
  refresh();
  store.subscribe(refresh);
}
