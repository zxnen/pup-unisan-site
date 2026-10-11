import { backendProblem } from '../supabaseClient.js';
import { announcementsModel } from '../models/contentModel.js';
import { el, clear, formatDate } from '../views/dom.js';
import { loading, empty, failure } from '../views/status.js';

export async function init() {
  const host = document.getElementById('announcements-list');
  if (backendProblem) return failure(host, backendProblem);
  const load = async () => {
    loading(host, 'Loading announcements…');
    try {
      const rows = await announcementsModel.listPublic();
      if (!rows.length) return empty(host, 'No announcements right now.', 'New announcements will appear here when they are published.');
      clear(host);
      for (const a of rows) {
        host.append(el('article', { class: 'announcement' },
          el('h2', { text: a.title }),
          el('p', { class: 'meta' }, el('time', { datetime: a.published_at, text: formatDate(a.published_at) })),
          ...String(a.content).split(/\n{2,}/).map((para) => el('p', { class: 'prose', text: para }))));
      }
    } catch (e) { failure(host, e.message, load); }
  };
  load();
}
