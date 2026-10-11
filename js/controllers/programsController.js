import { backendProblem } from '../supabaseClient.js';
import { programsModel } from '../models/contentModel.js';
import { el, clear, safeUrl } from '../views/dom.js';
import { loading, empty, failure } from '../views/status.js';

export async function init() {
  const host = document.getElementById('programs-list');
  if (backendProblem) return failure(host, backendProblem);
  const load = async () => {
    loading(host, 'Loading programs…');
    try {
      const rows = await programsModel.listPublic();
      if (!rows.length) return empty(host, 'No programs are published yet.', 'Please check back soon.');
      clear(host);
      for (const level of ['Bachelor', 'Diploma', 'Master']) {
        const group = rows.filter((p) => p.level === level);
        if (!group.length) continue;
        host.append(el('section', { class: 'program-group', 'aria-labelledby': `lvl-${level}` },
          el('h2', { id: `lvl-${level}`, text: level === 'Bachelor' ? 'Undergraduate programs' : level === 'Diploma' ? 'Diploma programs' : 'Graduate programs' }),
          el('div', { class: 'program-list' }, group.map(card))));
      }
    } catch (e) { failure(host, e.message, load); }
  };
  load();
}

function card(p) {
  const img = p.image_url ? safeUrl(p.image_url) : null;
  return el('article', { class: 'program' },
    img ? el('img', { src: img, alt: `${p.title} program`, loading: 'lazy' }) : null,
    el('div', { class: 'program-body' },
      el('p', { class: 'program-code', text: p.code }),
      el('h3', { text: p.title }),
      p.description ? el('p', { text: p.description }) : el('p', { class: 'muted', text: 'Program details will be added soon.' })));
}
