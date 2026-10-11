import { el } from './dom.js';

export function dataTable({ caption, columns, rows }) {
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'data-table' },
      el('caption', { class: 'sr-only', text: caption }),
      el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col', text: c.label })))),
      el('tbody', {}, rows.map((r) => el('tr', {}, columns.map((c) => {
        const v = c.render ? c.render(r) : r[c.key];
        return el('td', { 'data-label': c.label }, v === null || v === undefined ? '' : v);
      }))))));
}

export function pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return el('p', { class: 'pager-count muted', text: `${total} ${total === 1 ? 'record' : 'records'}` });
  return el('nav', { class: 'pager', 'aria-label': 'Pagination' },
    el('button', { type: 'button', class: 'btn btn-quiet', disabled: page === 0, onclick: () => onPage(page - 1), text: 'Previous' }),
    el('span', { class: 'pager-count', text: `Page ${page + 1} of ${pages} (${total} records)` }),
    el('button', { type: 'button', class: 'btn btn-quiet', disabled: page >= pages - 1, onclick: () => onPage(page + 1), text: 'Next' }));
}

export function badge(text, kind) { return el('span', { class: `badge badge-${kind}`, text }); }

export function actionButton(text, onclick, kind = 'quiet', aria) {
  return el('button', { type: 'button', class: `btn btn-small btn-${kind}`, onclick, 'aria-label': aria }, text);
}

export function searchBar({ value = '', placeholder, onSearch, extra = [] }) {
  const input = el('input', { type: 'search', id: `q-${Math.random().toString(36).slice(2, 7)}`, value, placeholder, maxlength: 60 });
  const form = el('form', { class: 'toolbar', role: 'search', onsubmit: (e) => { e.preventDefault(); onSearch(input.value, form); } },
    el('div', { class: 'field field-inline' }, el('label', { for: input.id, text: 'Search' }), input),
    ...extra,
    el('button', { type: 'submit', class: 'btn btn-quiet', text: 'Search' }));
  return form;
}
