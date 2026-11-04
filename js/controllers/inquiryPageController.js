import { TURNSTILE_SITE_KEY } from '../config.js';
import { createInquiry } from '../models/inquiryModel.js';
import { validatePublicInquiry } from '../models/validators.js';
import { showErrors, setBusy } from '../views/formDialog.js';

export async function init() {
  const form = document.getElementById('inquiry-form');
  const success = document.getElementById('successMessage');
  const status = document.getElementById('inquiry-status');
  const widget = document.getElementById('inquiry-turnstile');
  if (!form) return;
  let widgetId = null;
  if (TURNSTILE_SITE_KEY && !TURNSTILE_SITE_KEY.startsWith('YOUR_') && widget) {
    try {
      await loadTurnstile();
      widgetId = window.turnstile.render(widget, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'inquiry',
        callback: () => { status.textContent = ''; },
        'expired-callback': () => { status.textContent = 'Spam protection expired. Please verify again.'; },
        'error-callback': () => { status.textContent = 'Spam protection could not load. Refresh and try again.'; },
      });
    } catch {
      status.textContent = 'Spam protection could not load. Refresh and try again.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    success.hidden = true;
    status.textContent = '';
    const raw = {
      full_name: form.elements.full_name.value,
      email: form.elements.email.value,
      category: form.dataset.category,
      message: form.elements.message?.value || '',
    };
    const result = validatePublicInquiry(raw);
    showErrors(form, result.errors);
    if (!result.ok) return;
    const turnstileToken = widgetId !== null ? window.turnstile.getResponse(widgetId) : '';
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      status.textContent = 'Complete the spam protection check before sending.';
      return;
    }
    const website = form.elements.website?.value || '';
    setBusy(form, true, 'Sending…');
    try {
      const response = await createInquiry({ ...result.value, website, turnstile_token: turnstileToken });
      form.reset();
      success.hidden = false;
      success.focus();
      if (response.requires_review) status.textContent = 'Your inquiry was received and will be reviewed by campus staff.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      setBusy(form, false);
    }
  });
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileLoading) return window.__turnstileLoading;
  window.__turnstileLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return window.__turnstileLoading;
}
