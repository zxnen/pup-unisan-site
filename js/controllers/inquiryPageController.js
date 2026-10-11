import { backendProblem } from '../supabaseClient.js';
import { getCurrentUser } from './sessionController.js';
import { createInquiry } from '../models/inquiryModel.js';
import { programOptions } from '../models/contentModel.js';
import { validateInquiry } from '../models/validators.js';
import { showErrors, setBusy } from '../views/formDialog.js';
import { el, clear } from '../views/dom.js';
import { notice } from '../views/status.js';

// Shared by admission.html (category "admissions") and contact.html (category "general").
export async function init() {
  const gate = document.getElementById('inquiry-gate');
  const form = document.getElementById('inquiry-form');
  const success = document.getElementById('successMessage');
  const show = (...nodes) => clear(gate).append(...nodes);
  if (backendProblem) return show(notice('error', 'Inquiries are unavailable.', backendProblem));

  const current = await getCurrentUser();
  const loginLink = (t) => el('a', { href: 'login.html', text: t });
  if (!current) return show(notice('warn', 'Log in to send an inquiry.'), el('p', {}, loginLink('Log in'), ' or ',
    el('a', { href: 'login.html#register', text: 'create an account' }), '. Accounts are approved by a campus administrator before inquiries can be sent.'));
  const { profile, user } = current;
  if (profile.role === 'admin') return show(notice('ok', 'You are signed in as an administrator.'),
    el('p', {}, 'Inquiries are managed from the ', el('a', { href: 'dashboard.html#inquiries', text: 'dashboard' }), '.'));
  if (profile.approval_status === 'pending') return show(notice('warn', 'Your account is waiting for approval.',
    'You can send inquiries once an administrator approves it. You can update your profile in the dashboard meanwhile.'),
    el('p', {}, el('a', { href: 'dashboard.html', text: 'Go to dashboard' })));
  if (profile.approval_status === 'rejected') return show(notice('error', 'Your registration was not approved.',
    'You cannot send inquiries. Contact unisan@pup.edu.ph if you think this is a mistake.'));

  clear(gate);
  // Name and email come from the signed-in account and are display-only; they are never submitted.
  form.elements.fullname.value = profile.full_name || '';
  form.elements.email.value = profile.email || user.email || '';
  const sel = form.elements.program_of_interest;
  if (sel) for (const [code, text] of await programOptions()) sel.append(el('option', { value: code, text }));
  form.hidden = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    success.hidden = true;
    const r = validateInquiry({
      category: form.dataset.category,
      subject: form.elements.subject?.value,
      message: form.elements.message.value,
      phone: form.elements.phone?.value,
      program_of_interest: sel?.value,
      preferred_contact: form.elements.preferred_contact?.value,
    });
    showErrors(form, r.errors);
    if (!r.ok) return;
    setBusy(form, true, 'Sending…');
    try {
      await createInquiry(r.value);
      form.elements.message.value = '';
      if (form.elements.subject) form.elements.subject.value = '';
      success.hidden = false; success.focus();
    } catch (ex) {
      clear(gate).append(notice('error', 'Your inquiry was not sent.', ex.message + ' Your message is still in the form.'));
    }
    setBusy(form, false);
  });
}
