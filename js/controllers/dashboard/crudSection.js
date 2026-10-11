import { el, clear, formatDate } from '../../views/dom.js';
import { loading, empty, failure, announce } from '../../views/status.js';
import { dataTable, pager, badge, actionButton, searchBar } from '../../views/table.js';
import { openFormDialog, confirmDialog } from '../../views/formDialog.js';

const PAGE_SIZE = 10;

/** Generic admin list + create/edit/delete (+ publish toggle) for one Supabase-backed module. */
export function crudSection(cfg) {
  return async function render(container) {
    let page = 0; let search = '';
    clear(container);
    const list = el('div', { class: 'list', 'aria-live': 'polite' });
    const toolbarHost = el('div');
    container.append(
      el('div', { class: 'section-head' }, el('h2', { text: cfg.title }),
        el('button', { type: 'button', class: 'btn', onclick: () => edit(null), text: `New ${cfg.singular}` })),
      toolbarHost, list);
    toolbarHost.append(searchBar({ placeholder: cfg.searchPlaceholder, onSearch: (v) => { search = v; page = 0; load(); } }));

    async function load() {
      loading(list);
      try {
        const { rows, total } = await cfg.model.listAdmin({ search, page, pageSize: PAGE_SIZE });
        if (!rows.length && page > 0) { page = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1); return load(); }
        if (!rows.length) {
          return empty(list, search ? `No ${cfg.plural} match “${search}”.` : `No ${cfg.plural} yet.`,
            search ? 'Try a different search.' : `Use “New ${cfg.singular}” to add the first one.`);
        }
        const columns = [...cfg.columns];
        if (cfg.publishable) columns.push({ label: 'Status', render: (r) => r.is_published
          ? badge('Published', 'ok') : badge('Draft', 'muted') });
        columns.push({ label: 'Actions', render: (r) => el('div', { class: 'row-actions' },
          actionButton('Edit', () => edit(r), 'quiet', `Edit ${cfg.label(r)}`),
          cfg.publishable ? actionButton(r.is_published ? 'Unpublish' : 'Publish', () => togglePublish(r), 'quiet',
            `${r.is_published ? 'Unpublish' : 'Publish'} ${cfg.label(r)}`) : null,
          actionButton('Delete', () => remove(r), 'danger', `Delete ${cfg.label(r)}`)) });
        clear(list).append(
          dataTable({ caption: cfg.title, columns, rows }),
          pager({ page, pageSize: PAGE_SIZE, total, onPage: (p) => { page = p; load(); } }));
      } catch (e) { failure(list, e.message, load); }
    }

    function edit(row) {
      openFormDialog({
        title: row ? `Edit ${cfg.singular}` : `New ${cfg.singular}`,
        fields: cfg.fields,
        values: row || cfg.defaults || {},
        submitText: row ? 'Save changes' : `Create ${cfg.singular}`,
        onSubmit: async (raw) => {
          const r = cfg.validate(raw);
          if (!r.ok) return { errors: r.errors };
          try {
            if (row) await cfg.model.update(row.id, r.value); else await cfg.model.create(r.value);
          } catch (e) { return { formError: e.message }; }
          announce(row ? `${cap(cfg.singular)} saved.` : `${cap(cfg.singular)} created.`);
          load();
          return {};
        },
      });
    }

    async function togglePublish(row) {
      try {
        await cfg.model.update(row.id, { is_published: !row.is_published });
        announce(row.is_published ? `${cap(cfg.singular)} unpublished.` : `${cap(cfg.singular)} published.`);
        load();
      } catch (e) { announce(e.message, 'error'); }
    }

    async function remove(row) {
      const ok = await confirmDialog({
        title: `Delete this ${cfg.singular}?`,
        message: `“${cfg.label(row)}” will be permanently deleted. This cannot be undone.`,
        confirmText: `Delete ${cfg.singular}`,
      });
      if (!ok) return;
      try { await cfg.model.remove(row.id); announce(`${cap(cfg.singular)} deleted.`); load(); }
      catch (e) { announce(e.message, 'error'); }
    }

    load();
  };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export { formatDate };
