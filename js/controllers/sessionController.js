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
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
      }
    });
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
