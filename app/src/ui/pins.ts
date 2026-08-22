/* The "Pins" panel section: address input (OpenStreetMap Nominatim,
   browser-direct, bounded to an SF viewbox — same spirit as the Socrata
   calls) and the removable pin list. Duplicate labels are rejected
   (PORT_PLAN §6.4). */

import { NOMINATIM_VIEWBOX } from '../config';
import type { PingsHandle } from '../map/pings';

export function initPinsUI(pings: PingsHandle): void {
  const form = document.getElementById('pin-form') as HTMLFormElement;
  const input = document.getElementById('pin-input') as HTMLInputElement;
  const status = document.getElementById('pin-status') as HTMLElement;
  const list = document.getElementById('pin-list') as HTMLElement;

  const setStatus = (msg: string): void => {
    status.textContent = msg;
    status.classList.toggle('show', !!msg);
  };

  const renderList = (): void => {
    list.innerHTML = '';
    pings.list().forEach((p, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.label;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.textContent = '×';
      rm.setAttribute('aria-label', `Remove pin: ${p.label}`);
      rm.addEventListener('click', () => pings.remove(i));
      li.append(name, rm);
      list.appendChild(li);
    });
  };
  pings.onChange(renderList);
  renderList();

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (pings.hasLabel(q)) {
      setStatus('Already pinned.');
      return;
    }
    setStatus(`Looking up “${q}”…`);
    input.disabled = true;
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&bounded=1' +
      `&viewbox=${encodeURIComponent(NOMINATIM_VIEWBOX)}&q=${encodeURIComponent(q)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Array<{ lon: string; lat: string }>>;
      })
      .then((rows) => {
        const hit = rows[0];
        if (!hit) throw new Error('no match');
        pings.add({ label: q, lng: parseFloat(hit.lon), lat: parseFloat(hit.lat) });
        input.value = '';
        setStatus('');
      })
      .catch(() => setStatus('No match in San Francisco — try a street address.'))
      .then(() => {
        input.disabled = false;
      });
  });
}
