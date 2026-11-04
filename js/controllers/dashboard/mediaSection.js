import { supabase } from '../../supabaseClient.js';
import { FACULTY_SUPABASE_URL } from '../../config.js';
import { el, clear, safeUrl, formatDate } from '../../views/dom.js';
import { announce, failure } from '../../views/status.js';

const BUCKETS = { campus: 'site-media', faculty: 'faculty-media' };
const LIMIT = 5 * 1024 * 1024;

export async function mediaSection(container) {
  let active = 'campus';
  const host = el('div', { class: 'media-library' });
  const tabs = el('div', { class: 'media-tabs', role: 'group', 'aria-label': 'Media storage' });
  const panel = el('div');
  container.replaceChildren(
    el('div', { class: 'section-head' }, el('h2', { text: 'Media library' }),
      el('p', { class: 'muted', text: 'Upload campus imagery and faculty portraits. Images are organized by year and month.' })),
    tabs, panel, host);

  const renderTabs = () => tabs.replaceChildren(...[
    ['campus', 'Campus media'], ['faculty', 'Faculty photos'],
  ].map(([key, label]) => el('button', { type: 'button', 'aria-pressed': String(active === key), text: label,
    onclick: () => { active = key; renderTabs(); load(); } })));

  const uploadForm = el('form', { class: 'media-upload' });
  const input = el('input', { class: 'form-control', type: 'file', accept: 'image/jpeg,image/png,image/webp', required: true, 'aria-label': 'Choose JPEG, PNG or WebP image' });
  const help = el('p', { class: 'hint', text: 'JPEG, PNG or WebP · 5 MB maximum.' });
  const submit = el('button', { class: 'btn btn-maroon mt-2', type: 'submit', text: 'Upload image' });
  uploadForm.append(input, help, submit);
  panel.append(uploadForm);
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) return announce('Choose a JPEG, PNG or WebP image.', 'error');
    if (file.size > LIMIT) return announce('Images must be 5 MB or smaller.', 'error');
    submit.disabled = true;
    try {
      if (active === 'campus') {
        if (!supabase) throw new Error('Main Supabase configuration is missing.');
        const now = new Date();
        const extension = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' })[file.type];
        const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(BUCKETS.campus).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
      } else {
        const session = await getSession();
        const form = new FormData(); form.append('file', file);
        const response = await fetch('/.netlify/functions/faculty-media', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Faculty photo upload failed.');
      }
      announce('Image uploaded.'); uploadForm.reset(); await load();
    } catch (error) { announce(error.message || 'Image upload failed.', 'error'); }
    finally { submit.disabled = false; }
  });

  async function load() {
    host.replaceChildren(el('p', { class: 'state', text: 'Loading images…' }));
    try {
      const items = active === 'campus' ? await listCampus() : await listFaculty();
      const grid = el('div', { class: 'media-grid', 'aria-live': 'polite' });
      if (!items.length) grid.append(el('p', { class: 'state state-empty', text: 'No images yet. Upload an image to start the library.' }));
      else grid.append(...items.map((item) => mediaCard(item)));
      host.replaceChildren(grid);
    } catch (error) { failure(host, error.message || 'Images could not be loaded.', load); }
  }

  function mediaCard(item) {
    const card = el('article', { class: 'media-card' });
    const url = safeUrl(item.url);
    if (url) card.append(el('img', { src: url, alt: '', loading: 'lazy' }));
    const body = el('div', { class: 'media-card-body' }, el('strong', { text: item.path || item.name }),
      item.created_at ? el('p', { class: 'hint', text: formatDate(item.created_at) }) : null,
      el('div', { class: 'media-card-actions' },
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Copy URL', onclick: async () => {
          try { await navigator.clipboard.writeText(item.url); announce('Image URL copied.'); }
          catch { announce(item.url); }
        } }),
        el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Delete', onclick: () => remove(item) })));
    card.append(body); return card;
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.path || item.name}? Existing content that uses this image may show a broken image.`)) return;
    try {
      if (active === 'campus') {
        const { error } = await supabase.storage.from(BUCKETS.campus).remove([item.path]);
        if (error) throw error;
      } else {
        const session = await getSession();
        const response = await fetch('/.netlify/functions/faculty-media', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: item.path }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not delete image.');
      }
      announce('Image deleted.'); await load();
    } catch (error) { announce(error.message || 'Could not delete image.', 'error'); }
  }

  async function listCampus() {
    if (!supabase) throw new Error('Main Supabase configuration is missing.');
    const storage = supabase.storage.from(BUCKETS.campus);
    const output = [];
    async function walk(prefix = '', depth = 0) {
      const { data, error } = await storage.list(prefix, { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      for (const file of data || []) {
        const path = `${prefix}${file.name}`;
        if (file.id) {
          const { data: publicData } = storage.getPublicUrl(path);
          output.push({ ...file, path, url: publicData.publicUrl });
        } else if (depth < 2) await walk(`${path}/`, depth + 1);
      }
    }
    await walk(); return output;
  }

  async function listFaculty() {
    if (!FACULTY_SUPABASE_URL) throw new Error('Faculty Supabase configuration is missing.');
    const session = await getSession();
    const output = [];
    const request = async (prefix) => {
      const response = await fetch(`/.netlify/functions/faculty-media?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not list faculty photos.');
      return result.data || [];
    };
    for (const year of await request('')) {
      if (!year.isFolder || !/^\d{4}$/.test(year.name)) continue;
      for (const month of await request(`${year.name}/`)) {
        if (!month.isFolder || !/^\d{2}$/.test(month.name)) continue;
        output.push(...(await request(`${year.name}/${month.name}/`)).filter((file) => !file.isFolder));
      }
    }
    return output;
  }

  async function getSession() {
    if (!supabase) throw new Error('Main Supabase configuration is missing.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session expired. Sign in again.');
    return session;
  }

  renderTabs(); await load();
}
