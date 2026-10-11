import { el, clear, formatDate, label } from '../../views/dom.js';
import { announce, notice } from '../../views/status.js';
import { badge } from '../../views/table.js';
import { buildField, readForm, showErrors, setBusy } from '../../views/formDialog.js';
import { updateOwnProfile } from '../../models/profileModel.js';
import { programOptions } from '../../models/contentModel.js';
import { validateProfile, YEARS } from '../../models/validators.js';

const KIND = { pending: 'warn', approved: 'ok', rejected: 'bad' };

export async function profileSection(container, ctx) {
  const { profile, user } = ctx;
  const locked = profile.approval_status === 'rejected';
  const programs = await programOptions();
  clear(container);

  const fields = [
    { name: 'full_name', label: 'Full name', maxlength: 120, autocomplete: 'name', readonly: locked },
    { name: 'student_number', label: 'Student number', maxlength: 20, readonly: locked, help: '4–20 letters, numbers or hyphens.' },
    { name: 'program', label: 'Program', type: 'select', options: programs, readonly: locked },
    { name: 'year', label: 'Year level', type: 'select', options: YEARS.map((y) => [String(y), `Year ${y}`]), readonly: locked },
    { name: 'phone', label: 'Phone', type: 'tel', maxlength: 20, autocomplete: 'tel', readonly: locked },
    { name: 'address', label: 'Address', maxlength: 255, autocomplete: 'street-address', readonly: locked },
    { name: 'birthdate', label: 'Birthdate', type: 'date', readonly: locked, help: 'Only you and campus administrators can see this.' },
  ];
  const values = { ...profile, year: profile.year ?? '' };
  const form = el('form', { class: 'form', novalidate: true },
    ...fields.map((f) => buildField(f, values[f.name])),
    el('p', { class: 'form-error', role: 'alert', hidden: true }),
    locked ? null : el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'btn', text: 'Save profile' })));
  if (locked) for (const c of form.querySelectorAll('select')) c.disabled = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    const err = form.querySelector('.form-error'); err.hidden = true; showErrors(form, {});
    const r = validateProfile(readForm(form, fields));
    if (!r.ok) return showErrors(form, r.errors);
    setBusy(form, true);
    try {
      const saved = await updateOwnProfile(user.id, r.value);
      Object.assign(profile, saved);
      announce('Profile saved.');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    setBusy(form, false);
  });

  container.append(
    el('div', { class: 'section-head' }, el('h2', { text: 'My profile' })),
    el('dl', { class: 'details details-inline' },
      el('dt', { text: 'Email' }), el('dd', { text: profile.email || user.email || '' }),
      el('dt', { text: 'Account status' }), el('dd', {}, badge(label(profile.approval_status), KIND[profile.approval_status])),
      el('dt', { text: 'Registered' }), el('dd', { text: formatDate(profile.created_at) })),
    locked ? notice('error', 'Profile is read-only.', 'Your account was not approved, so changes are turned off.') : null,
    form);
}
