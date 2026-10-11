import { el, clear, formatDate, label } from '../../views/dom.js';
import { loading, empty, failure, announce } from '../../views/status.js';
import { dataTable, pager, badge, actionButton, searchBar } from '../../views/table.js';
import { openFormDialog, confirmDialog } from '../../views/formDialog.js';
import { listStudents, reviewStudent, adminUpdateStudent } from '../../models/profileModel.js';
import { programOptions } from '../../models/contentModel.js';
import { validateProfile, YEARS } from '../../models/validators.js';

const PAGE_SIZE = 10;
const KIND = { pending: 'warn', approved: 'ok', rejected: 'bad' };

export async function studentsSection(container, ctx) {
  let page = 0; let search = ''; let status = ctx.initialFilter || '';
  clear(container);
  const list = el('div', { class: 'list', 'aria-live': 'polite' });
  const statusSel = el('select', { id: 'stu-status' },
    el('option', { value: '', text: 'All statuses' }),
    ['pending', 'approved', 'rejected'].map((s) => el('option', { value: s, text: label(s), selected: s === status })));
  statusSel.addEventListener('change', () => { status = statusSel.value; page = 0; load(); });
  container.append(
    el('div', { class: 'section-head' }, el('h2', { text: 'Students' })),
    searchBar({ placeholder: 'Name, email or student number', onSearch: (v) => { search = v; page = 0; load(); },
      extra: [el('div', { class: 'field field-inline' }, el('label', { for: 'stu-status', text: 'Status' }), statusSel)] }),
    list);

  async function load() {
    loading(list);
    try {
      const { rows, total } = await listStudents({ search, status, page, pageSize: PAGE_SIZE });
      if (!rows.length && page > 0) { page = 0; return load(); }
      if (!rows.length) return empty(list, 'No students found.', search || status ? 'Try clearing the search or filter.' : 'Registered students will appear here.');
      clear(list).append(
        dataTable({ caption: 'Students', rows, columns: [
          { label: 'Name', render: (r) => r.full_name || '—' },
          { key: 'email', label: 'Email' },
          { label: 'Student no.', render: (r) => r.student_number || '—' },
          { label: 'Program', render: (r) => r.program || '—' },
          { label: 'Account', render: (r) => badge(label(r.approval_status), KIND[r.approval_status]) },
          { label: 'Registered', render: (r) => formatDate(r.created_at) },
          { label: 'Actions', render: (r) => el('div', { class: 'row-actions' },
            r.approval_status !== 'approved' ? actionButton('Approve', () => review(r, 'approved'), 'ok', `Approve ${r.full_name || r.email}`) : null,
            r.approval_status !== 'rejected' ? actionButton('Reject', () => review(r, 'rejected'), 'danger', `Reject ${r.full_name || r.email}`) : null,
            actionButton('View / edit', () => edit(r), 'quiet', `View or edit ${r.full_name || r.email}`)) },
        ] }),
        pager({ page, pageSize: PAGE_SIZE, total, onPage: (p) => { page = p; load(); } }));
    } catch (e) { failure(list, e.message, load); }
  }

  async function review(row, next) {
    const who = row.full_name || row.email;
    if (next === 'rejected') {
      const ok = await confirmDialog({ title: 'Reject this account?', message: `${who} will lose access to student features and cannot submit inquiries.`, confirmText: 'Reject account' });
      if (!ok) return;
    }
    try { await reviewStudent(row.id, next); announce(`${who} ${next === 'approved' ? 'approved' : 'rejected'}.`); load(); }
    catch (e) { announce(e.message, 'error'); }
  }

  async function edit(row) {
    const programs = await programOptions();
    openFormDialog({
      title: `Student record: ${row.full_name || row.email}`,
      extra: el('p', { class: 'muted', text: `${row.email} · ${label(row.approval_status)} · registered ${formatDate(row.created_at)}` }),
      values: { ...row, year: row.year ?? '' }, submitText: 'Save changes',
      fields: [
        { name: 'full_name', label: 'Full name', maxlength: 120 },
        { name: 'student_number', label: 'Student number', maxlength: 20 },
        { name: 'program', label: 'Program', type: 'select', options: programs },
        { name: 'year', label: 'Year level', type: 'select', options: YEARS.map((y) => [String(y), `Year ${y}`]) },
        { name: 'phone', label: 'Phone', type: 'tel', maxlength: 20 },
        { name: 'address', label: 'Address', maxlength: 255 },
        { name: 'birthdate', label: 'Birthdate', type: 'date' },
      ],
      onSubmit: async (raw) => {
        const r = validateProfile(raw);
        if (!r.ok) return { errors: r.errors };
        try { await adminUpdateStudent(row.id, r.value); } catch (e) { return { formError: e.message }; }
        announce('Student record saved.'); load(); return {};
      },
    });
  }
  load();
}
