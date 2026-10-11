import { backendProblem } from '../supabaseClient.js';
import { getCurrentUser } from './sessionController.js';
import { signIn, signUp, signInWithGoogle, signOut } from '../models/authModel.js';
import { validateLogin, validateRegistration } from '../models/validators.js';
import { showErrors, setBusy } from '../views/formDialog.js';
import { el, clear, label } from '../views/dom.js';
import { notice } from '../views/status.js';

const STATUS_TEXT = {
  pending: 'Your account is waiting for approval by a campus administrator. Until then you can only update your basic profile.',
  approved: 'Your account is approved.',
  rejected: 'Your registration was not approved. Contact unisan@pup.edu.ph if you think this is a mistake.',
};

const $ = (id) => document.getElementById(id);
const val = (form, n) => form.elements[n]?.value ?? '';

function say(kind, title, body) {
  const host = $('auth-message');
  clear(host).append(notice(kind, title, body));
  host.hidden = false;
}

function oauthReturn() {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const err = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  const returning = q.has('code') || h.has('access_token');
  const code = q.get('error_code') || h.get('error_code') || q.get('error') || h.get('error');
  return { err, code, returning };
}

export async function init() {
  if (backendProblem) { $('auth-forms').hidden = true; say('error', 'Sign-in is unavailable.', backendProblem); return; }

  const { err, code, returning } = oauthReturn();
  if (err) {
    // Remove error details from the address bar and show a safe message.
    window.history.replaceState(null, '', window.location.pathname);
    say('error', /access_denied/i.test(code || err) ? 'Google sign-in was cancelled.' : 'Sign-in could not be completed.',
      /access_denied/i.test(code || err) ? 'You can try again or use your email and password.' : 'Please try again. If it keeps happening, use your email and password.');
  }

  const current = await getCurrentUser(true);
  if (current) {
    if (returning) { window.location.replace('dashboard.html'); return; }
    return showSignedIn(current);
  }
  wireTabs(); wireLogin(); wireRegister(); wireGoogle();
}

function showSignedIn({ profile, user }) {
  $('auth-forms').hidden = true;
  const panel = $('signed-in'); panel.hidden = false;
  clear(panel).append(
    el('h2', { text: `Welcome, ${profile.full_name || user.email}` }),
    notice(profile.approval_status === 'approved' ? 'ok' : profile.approval_status === 'pending' ? 'warn' : 'error',
      `Account status: ${label(profile.approval_status)}.`, STATUS_TEXT[profile.approval_status]),
    el('div', { class: 'actions' },
      el('a', { class: 'btn', href: 'dashboard.html', text: 'Go to dashboard' }),
      el('button', { type: 'button', class: 'btn btn-quiet', text: 'Log out',
        onclick: async () => { try { await signOut(); } finally { window.location.reload(); } } })));
}

function wireTabs() {
  const tabs = { login: $('tab-login'), register: $('tab-register') };
  const panels = { login: $('panel-login'), register: $('panel-register') };
  const select = (k) => {
    for (const key of Object.keys(tabs)) {
      tabs[key].setAttribute('aria-selected', String(key === k));
      tabs[key].tabIndex = key === k ? 0 : -1;
      panels[key].hidden = key !== k;
    }
  };
  for (const [k, t] of Object.entries(tabs)) {
    t.addEventListener('click', () => select(k));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const o = k === 'login' ? 'register' : 'login'; select(o); tabs[o].focus(); }
    });
  }
  select(window.location.hash === '#register' ? 'register' : 'login');
}

function wireLogin() {
  const form = $('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    $('auth-message').hidden = true;
    const r = validateLogin({ email: val(form, 'email'), password: val(form, 'password') });
    showErrors(form, r.errors);
    if (!r.ok) return;
    setBusy(form, true, 'Logging in…');
    try { await signIn(r.value); window.location.assign('dashboard.html'); return; }
    catch (ex) { say('error', 'Could not log in.', ex.message); }
    setBusy(form, false);
  });
}

function wireRegister() {
  const form = $('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    $('auth-message').hidden = true;
    const r = validateRegistration({ fullName: val(form, 'fullName'), email: val(form, 'email'),
      password: val(form, 'password'), confirm: val(form, 'confirm') });
    showErrors(form, r.errors);
    if (!r.ok) return;
    setBusy(form, true, 'Creating account…');
    try {
      const res = await signUp(r.value);
      if (res.needsEmailConfirmation) {
        say('ok', 'Account created.', 'Check your email and open the confirmation link, then log in. Your account will stay pending until an administrator approves it.');
        form.reset();
      } else { window.location.assign('dashboard.html'); return; }
    } catch (ex) { say('error', 'Could not create your account.', ex.message); }
    setBusy(form, false);
  });
}

function wireGoogle() {
  for (const btn of document.querySelectorAll('.google-btn')) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await signInWithGoogle(); }
      catch (ex) { say('error', 'Could not start Google sign-in.', ex.message); btn.disabled = false; }
    });
  }
}
