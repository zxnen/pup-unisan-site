import { backendProblem } from '../supabaseClient.js';
import { facultyModel } from '../models/contentModel.js';
import { el, clear } from '../views/dom.js';
import { loading, empty, failure } from '../views/status.js';

export async function init() {
  const host = document.getElementById('faculty-directory');
  if (backendProblem) return failure(host, backendProblem);
  const load = async () => {
    loading(host, 'Loading directory…');
    try {
      const rows = await facultyModel.listPublic();
      if (!rows.length) return empty(host, 'The directory is empty.', 'Faculty and staff will be listed here.');
      // Group rows under the same headings the original table used (Administration, BSIT Faculty…).
      const groups = new Map();
      for (const r of rows) {
        const g = r.group_label || 'Faculty & Staff';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(r);
      }
      const tbody = el('tbody');
      for (const [g, people] of groups) {
        tbody.append(el('tr', { class: 'group-row' }, el('th', { colspan: 4, scope: 'colgroup', text: g })));
        for (const p of people) {
          tbody.append(el('tr', {},
            el('td', { text: p.name }), el('td', { text: p.position }), el('td', { text: p.department }),
            el('td', {}, p.email ? el('a', { href: `mailto:${p.email}`, text: p.email }) : '')));
        }
      }
      clear(host).append(el('div', { class: 'table-wrap' },
        el('table', { class: 'data-table' },
          el('caption', { class: 'sr-only', text: 'PUP Unisan faculty and staff directory' }),
          el('thead', {}, el('tr', {}, ['Name', 'Position', 'Department', 'Email'].map((h) => el('th', { scope: 'col', text: h })))),
          tbody)));
    } catch (e) { failure(host, e.message, load); }
  };
  load();
}
