const KEY = 'pup-unisan-cookie-consent-v1';

export function initCookieConsent() {
  const footer = document.querySelector('.site-footer .footer-inner');
  if (footer && !footer.querySelector('[data-cookie-policy-link]')) {
    const link = document.createElement('p');
    link.innerHTML = '<a data-cookie-policy-link href="cookie-policy.html">Cookie Policy</a> · <button class="cookie-manage-link" type="button">Cookie settings</button>';
    footer.append(link);
  }

  const saved = readConsent();
  const banner = document.createElement('section');
  banner.className = 'cookie-banner';
  banner.setAttribute('aria-label', 'Cookie preferences');
  banner.innerHTML = '<div class="cookie-copy"><strong>Your privacy matters</strong><p>Essential storage keeps this site working. Optional analytics are not active yet; if added later, they will stay off unless you enable them. <a href="cookie-policy.html">Read the Cookie Policy</a>.</p></div><div class="cookie-actions"><button type="button" class="btn btn-maroon" data-cookie="accept">Accept all</button><button type="button" class="btn btn-outline-maroon" data-cookie="reject">Reject optional</button><button type="button" class="btn btn-text" data-cookie="customize">Customize</button></div>';
  if (!saved) document.body.append(banner);

  const dialog = document.createElement('dialog');
  dialog.className = 'cookie-dialog';
  dialog.setAttribute('aria-labelledby', 'cookie-settings-title');
  dialog.innerHTML = '<form method="dialog"><h2 id="cookie-settings-title">Cookie settings</h2><p>Essential storage is always on because the site needs it for security and core features.</p><label class="cookie-option"><input type="checkbox" checked disabled> <span><strong>Essential</strong><small>Required for site functionality and security.</small></span></label><label class="cookie-option"><input type="checkbox" name="analytics"> <span><strong>Optional analytics</strong><small>Save your preference. No analytics tool is currently active on this site.</small></span></label><div class="cookie-actions"><button class="btn btn-maroon" value="save">Save preferences</button><button class="btn btn-outline-maroon" value="cancel">Cancel</button></div></form>';
  document.body.append(dialog);

  const save = (analytics) => {
    const preference = { essential: true, analytics, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(preference));
      let visitorId = localStorage.getItem('pup-unisan-visitor-id-v1');
      if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('pup-unisan-visitor-id-v1', visitorId); }
      fetch('/.netlify/functions/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, analytics }) }).catch(() => {});
    } catch { /* Browser storage may be disabled; the banner choice still closes for this session. */ }
    banner.remove();
    dialog.close();
  };
  banner.addEventListener('click', (event) => {
    const action = event.target.closest('[data-cookie]')?.dataset.cookie;
    if (action === 'accept') save(true);
    if (action === 'reject') save(false);
    if (action === 'customize') {
      dialog.querySelector('[name="analytics"]').checked = false;
      dialog.showModal();
    }
  });
  dialog.querySelector('form').addEventListener('submit', (event) => {
    if (event.submitter?.value === 'save') {
      event.preventDefault();
      save(dialog.querySelector('[name="analytics"]').checked);
    }
  });
  document.querySelectorAll('.cookie-manage-link').forEach((button) => button.addEventListener('click', () => {
    const current = readConsent();
    dialog.querySelector('[name="analytics"]').checked = Boolean(current?.analytics);
    dialog.showModal();
  }));
}

function readConsent() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
