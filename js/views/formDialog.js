import { el, clear } from './dom.js';

let uid = 0;

// Builds one labelled field. Errors are announced through aria-describedby / aria-invalid.
export function buildField(f, value) {
  const id = `fld-${++uid}`;
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const common = {
    id, name: f.name, required: f.required, readonly: f.readonly,
    'aria-describedby': [f.help ? hintId : null, errId].filter(Boolean).join(' '),
    maxlength: f.maxlength, placeholder: f.placeholder, autocomplete: f.autocomplete,
  };
  let control;
  if (f.type === 'textarea') {
    control = el('textarea', { ...common, rows: f.rows || 4 });
    control.value = value ?? '';
  } else if (f.type === 'select') {
    control = el('select', { ...common }, el('option', { value: '', text: f.blank || '— Select —' }),
      (f.options || []).map(([v, t]) => el('option', { value: v, text: t })));
    control.value = value ?? '';
  } else if (f.type === 'checkbox') {
    control = el('input', { ...common, type: 'checkbox' });
    control.checked = value === true;
    return el('div', { class: 'field field-check' },
      el('label', { for: id }, control, ' ', f.label),
      f.help ? el('p', { class: 'hint', id: hintId, text: f.help }) : null,
      el('p', { class: 'field-error', id: errId, hidden: true }));
  } else {
    control = el('input', { ...common, type: f.type || 'text', min: f.min, max: f.max, inputmode: f.inputmode });
    control.value = value ?? '';
  }
  return el('div', { class: 'field' },
    el('label', { for: id }, f.label, f.required ? el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null),
    control,
    f.help ? el('p', { class: 'hint', id: hintId, text: f.help }) : null,
    el('p', { class: 'field-error', id: errId, hidden: true }));
}

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    const c = form.elements[f.name];
    if (!c) continue;
    out[f.name] = f.type === 'checkbox' ? c.checked : c.value;
  }
  return out;
}

export function showErrors(form, errors) {
  let first = null;
  for (const c of form.querySelectorAll('[name]')) {
    const err = c.closest('.field')?.querySelector('.field-error');
    if (!err) continue;
    const msg = errors[c.name];
    err.hidden = !msg;
    err.textContent = msg || '';
    if (msg) { c.setAttribute('aria-invalid', 'true'); first = first || c; } else c.removeAttribute('aria-invalid');
  }
  if (first) first.focus();
}

export function setBusy(form, busy, busyText = 'Saving…') {
  const btn = form.querySelector('button[type="submit"]');
  form.setAttribute('aria-busy', String(busy));
  for (const c of form.querySelectorAll('input,select,textarea,button')) {
    if (c.dataset.keepEnabled === undefined) c.disabled = busy;
  }
  if (btn) {
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyText; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}

/**
 * Modal dialog form. onSubmit(rawValues) must return { errors } to show field errors, or
 * { formError } for a server failure; return nothing/ok to close. The dialog stays open
 * (with the user's input intact) on any failure.
 */
export function openFormDialog({ title, fields, values = {}, submitText = 'Save', extra, onSubmit }) {
  const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
  const form = el('form', { novalidate: true, class: 'form' });
  const formError = el('p', { class: 'form-error', role: 'alert', hidden: true });
  form.append(
    el('h2', { id: 'dlg-title', text: title }),
    extra || null,
    ...fields.map((f) => buildField(f, values[f.name])),
    formError,
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn btn-quiet', 'data-keep-enabled': '', onclick: () => dialog.close(), text: 'Cancel' }),
      el('button', { type: 'submit', class: 'btn', text: submitText })));
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return; // block duplicate submits
    formError.hidden = true; showErrors(form, {});
    setBusy(form, true);
    let res;
    try { res = await onSubmit(readForm(form, fields)); }
    catch (err) { res = { formError: err?.message || 'Could not save. Please try again.' }; }
    setBusy(form, false);
    if (res?.errors) { showErrors(form, res.errors); return; }
    if (res?.formError) { formError.textContent = res.formError; formError.hidden = false; return; }
    dialog.close();
  });
  dialog.showModal();
  dialog.querySelector('input:not([readonly]),select,textarea')?.focus();
  return dialog;
}

export function confirmDialog({ title, message, confirmText = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dialog dialog-small', 'aria-labelledby': 'cfm-title', 'aria-describedby': 'cfm-msg' });
    let answer = false;
    dialog.append(el('form', { method: 'dialog', class: 'form' },
      el('h2', { id: 'cfm-title', text: title }),
      el('p', { id: 'cfm-msg', text: message }),
      el('div', { class: 'actions' },
        el('button', { type: 'submit', class: 'btn btn-quiet', value: 'no', autofocus: true, text: 'Cancel' }),
        el('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : ''}`, value: 'yes',
          onclick: () => { answer = true; }, text: confirmText }))));
    dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export { clear };
