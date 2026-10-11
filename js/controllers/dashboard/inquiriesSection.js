import { el, clear, formatDate, label } from '../../views/dom.js';
import { loading, empty, failure, announce } from '../../views/status.js';
import { dataTable, pager, badge, actionButton, searchBar } from '../../views/table.js';
import { openFormDialog, confirmDialog } from '../../views/formDialog.js';
import { listAllInquiries, updateInquiry, deleteInquiry } from '../../models/inquiryModel.js';
import { validateInquiryUpdate, INQUIRY_STATUSES } from '../../models/validators.js';

const PAGE_SIZE = 10;
const KIND = { open: 'warn', in_progress: 'info', resolved: 'ok', closed: 'muted' };

export async function adminInquiriesSection(container, ctx = {}) {
  let page = 0; let search = ''; let status = ctx.initialFilter || ''; let category = '';
  clear(container);
  const list = el('div', { class: 'list', 'aria-live': 'polite' });
  const mkSel = (id, text, opts, cur, set) => {
    const s = el('select', { id }, el('option', { value: '', text }), opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur })));
    s.addEventListener('change', () => { set(s.value); page = 0; load(); });
    return s;
  };
  container.append(
    el('div', { class: 'section-head' }, el('h2', { text: 'Inquiries' })),
    searchBar({ placeholder: 'Subject or message', onSearch: (v) => { search = v; page = 0; load(); }, extra: [
      el('div', { class: 'field field-inline' }, el('label', { for: 'inq-status', text: 'Status' }),
        mkSel('inq-status', 'All statuses', INQUIRY_STATUSES.map((s) => [s, label(s)]), status, (v) => { status = v; })),
      el('div', { class: 'field field-inline' }, el('label', { for: 'inq-cat', text: 'Category' }),
        mkSel('inq-cat', 'All categories', [['admissions', 'Admissions'], ['general', 'General']], category, (v) => { category = v; })),
    ] }),
    list);

  async function load() {
    loading(list);
    try {
      const { rows, total } = await listAllInquiries({ search, status, category, page, pageSize: PAGE_SIZE });
      if (!rows.length && page > 0) { page = 0; return load(); }
      if (!rows.length) return empty(list, 'No inquiries found.', search || status || category ? 'Try clearing the search or filters.' : 'Student inquiries will appear here.');
      clear(list).append(
        dataTable({ caption: 'Inquiries', rows, columns: [
          { label: 'Received', render: (r) => formatDate(r.created_at) },
          { label: 'From', render: (r) => r.profiles?.full_name || r.profiles?.email || 'Unknown' },
          { label: 'Category', render: (r) => label(r.category) },
          { key: 'subject', label: 'Subject' },
          { label: 'Status', render: (r) => badge(label(r.status), KIND[r.status]) },
          { label: 'Actions', render: (r) => el('div', { class: 'row-actions' },
            actionButton('Review', () => review(r), 'quiet', `Review inquiry: ${r.subject}`),
            actionButton('Delete', () => remove(r), 'danger', `Delete inquiry: ${r.subject}`)) },
        ] }),
        pager({ page, pageSize: PAGE_SIZE, total, onPage: (p) => { page = p; load(); } }));
    } catch (e) { failure(list, e.message, load); }
  }

  function review(row) {
    const p = row.profiles || {};
    const details = el('dl', { class: 'details' },
      el('dt', { text: 'From' }), el('dd', { text: `${p.full_name || 'Unknown'}${p.email ? ` (${p.email})` : ''}` }),
      p.student_number ? [el('dt', { text: 'Student number' }), el('dd', { text: p.student_number })] : null,
      el('dt', { text: 'Category' }), el('dd', { text: label(row.category) }),
      el('dt', { text: 'Subject' }), el('dd', { text: row.subject }),
      row.program_of_interest ? [el('dt', { text: 'Program of interest' }), el('dd', { text: row.program_of_interest })] : null,
      row.phone ? [el('dt', { text: 'Phone' }), el('dd', { text: row.phone })] : null,
      row.preferred_contact ? [el('dt', { text: 'Preferred contact' }), el('dd', { text: label(row.preferred_contact) })] : null,
      el('dt', { text: 'Received' }), el('dd', { text: formatDate(row.created_at, true) }),
      el('dt', { text: 'Message' }), el('dd', { class: 'prose', text: row.message }));
    openFormDialog({
      title: 'Review inquiry', extra: details, submitText: 'Save response', values: row,
      fields: [
        { name: 'status', label: 'Status', type: 'select', required: true, blank: '— Choose status —', options: INQUIRY_STATUSES.map((s) => [s, label(s)]) },
        { name: 'admin_response', label: 'Response to the student', type: 'textarea', rows: 5, maxlength: 2000,
          help: 'The student can read this response in their dashboard.' },
      ],
      onSubmit: async (raw) => {
        const r = validateInquiryUpdate(raw);
        if (!r.ok) return { errors: r.errors };
        try { await updateInquiry(row.id, r.value); } catch (e) { return { formError: e.message }; }
        announce('Inquiry updated.'); load(); return {};
      },
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: 'Delete this inquiry?', message: `“${row.subject}” and any response will be permanently deleted.`, confirmText: 'Delete inquiry' });
    if (!ok) return;
    try { await deleteInquiry(row.id); announce('Inquiry deleted.'); load(); } catch (e) { announce(e.message, 'error'); }
  }
  load();
}
