import { supabase } from '../supabaseClient.js';
import { loadCurrentUser, signOut } from '../models/authModel.js';

let cached = null;
export function getCurrentUser(force = false) {
  if (!supabase) return Promise.resolve(null);
  if (!cached || force) cached = loadCurrentUser().catch((e) => { console.error(e); return null; });
  return cached;
}

// Session-aware navigation + mobile menu. Hiding links is only convenience; real access
// control is enforced by Supabase RLS.
export async function initSession() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'nav-close';
    closeButton.setAttribute('aria-label', 'Close navigation');
    closeButton.textContent = 'Close ×';
    nav.prepend(closeButton);
    const brand = document.querySelector('.header-inner > .brand');
    if (brand && !nav.querySelector('.nav-brand')) {
      const overlayBrand = brand.cloneNode(true);
      overlayBrand.classList.add('nav-brand');
      overlayBrand.setAttribute('aria-label', 'PUP Unisan Campus home');
      nav.insertBefore(overlayBrand, nav.querySelector('ul'));
    }
    const focusable = () => [...nav.querySelectorAll('a[href], button:not([disabled])')].filter((node) => !node.closest('[hidden]'));
    let returnFocus = toggle;
    const closeNav = () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      document.body.classList.remove('nav-open');
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      document.querySelectorAll('[data-nav-inert]').forEach((node) => { node.inert = false; node.removeAttribute('data-nav-inert'); });
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      if (!open) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
        document.querySelectorAll('.skip-link, main, .site-footer, .header-inner > .brand, .header-inner > .nav-toggle').forEach((node) => { node.inert = true; node.dataset.navInert = 'true'; });
        nav.setAttribute('role', 'dialog');
        nav.setAttribute('aria-modal', 'true');
      } else closeNav();
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-label', open ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('is-open', !open);
      document.body.classList.toggle('nav-open', !open);
      if (!open) closeButton.focus();
    });
    closeButton.addEventListener('click', () => { closeNav(); returnFocus.focus(); });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) { closeNav(); returnFocus.focus({ preventScroll: true }); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeNav(); returnFocus.focus();
      } else if (e.key === 'Tab' && nav.classList.contains('is-open')) {
        const items = focusable();
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && (document.activeElement === first || !nav.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !nav.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1160 && nav.classList.contains('is-open')) { closeNav(); returnFocus.focus(); } });
  }

  const current = await getCurrentUser();
  for (const n of document.querySelectorAll('[data-auth="in"]')) n.hidden = !current;
  for (const n of document.querySelectorAll('[data-auth="out"]')) n.hidden = !!current;
  const btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await signOut(); } catch (e) { console.error(e); }
    cached = null;
    window.location.href = 'index.html';
  });
  if (supabase) supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cached = null;
  });
}
