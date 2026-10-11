import { el, clear, formatDate, label } from '../../views/dom.js';
import { loading, empty, failure, announce } from '../../views/status.js';
import { pager, badge } from '../../views/table.js';
import { openFormDialog } from '../../views/formDialog.js';
import { createInquiry, listMyInquiries } from '../../models/inquiryModel.js';
import { programOptions } from '../../models/contentModel.js';
import { validateInquiry } from '../../models/validators.js';

const PAGE_SIZE = 8;
const KIND = { open: 'warn', in_progress: 'info', resolved: 'ok', closed: 'muted' };

export async function studentInquiriesSection(container) {
  let page = 0;
  clear(container);
  const list = el('div', { class: 'list', 'aria-live': 'polite' });
  container.append(
    el('div', { class: 'section-head' }, el('h2', { text: 'My inquiries' }),
      el('button', { type: 'button', class: 'btn', onclick: compose, text: 'New inquiry' })),
    list);

  async function load() {
    loading(list);
    try {
      const { rows, total } = await listMyInquiries({ page, pageSize: PAGE_SIZE });
      if (!rows.length && page > 0) { page = 0; return load(); }
      if (!rows.length) return empty(list, 'You have not sent any inquiries yet.', 'Use “New inquiry” to ask the campus a question.');
      clear(list).append(
        el('ul', { class: 'inquiry-list' }, rows.map((r) => el('li', { class: 'inquiry' },
          el('div', { class: 'inquiry-head' },
            el('h3', { text: r.subject }), badge(label(r.status), KIND[r.status])),
          el('p', { class: 'meta', text: `${label(r.category)} · sent ${formatDate(r.created_at, true)}` }),
          el('p', { class: 'prose', text: r.message }),
          r.admin_response
            ? el('div', { class: 'response' }, el('strong', { text: 'Campus response' }),
                el('p', { class: 'prose', text: r.admin_response }),
                r.responded_at ? el('p', { class: 'meta', text: formatDate(r.responded_at, true) }) : null)
            : el('p', { class: 'muted', text: 'No response yet.' })))),
        pager({ page, pageSize: PAGE_SIZE, total, onPage: (p) => { page = p; load(); } }));
    } catch (e) { failure(list, e.message, load); }
  }

  async function compose() {
    const programs = await programOptions();
    openFormDialog({
      title: 'New inquiry', submitText: 'Send inquiry', values: { category: 'general', preferred_contact: 'email' },
      fields: [
        { name: 'category', label: 'Category', type: 'select', required: true, blank: '— Choose —', options: [['general', 'General'], ['admissions', 'Admissions']] },
        { name: 'subject', label: 'Subject', required: true, maxlength: 120 },
        { name: 'program_of_interest', label: 'Program of interest', type: 'select', options: programs },
        { name: 'preferred_contact', label: 'Preferred contact method', type: 'select', options: [['email', 'Email'], ['phone', 'Phone']] },
        { name: 'phone', label: 'Phone number', type: 'tel', maxlength: 20 },
        { name: 'message', label: 'Message', type: 'textarea', rows: 5, required: true, maxlength: 2000 },
      ],
      onSubmit: async (raw) => {
        const r = validateInquiry(raw);
        if (!r.ok) return { errors: r.errors };
        try { await createInquiry(r.value); } catch (e) { return { formError: e.message }; }
        announce('Inquiry sent.'); page = 0; load(); return {};
      },
    });
  }
  load();
}
