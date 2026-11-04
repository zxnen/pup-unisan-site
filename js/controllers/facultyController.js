import { facultyModel } from '../models/contentModel.js';
import { el, clear, safeUrl } from '../views/dom.js';
import { loading, empty, failure } from '../views/status.js';

export async function init() {
  const host = document.getElementById('faculty-directory');
  let rows = [];
  let activeGroup = 'All';
  const filters = el('div', { class: 'faculty-tools' });
  const query = el('input', { class: 'form-control', type: 'search', placeholder: 'Search faculty by name or department…', 'aria-label': 'Search faculty by name or department' });
  const categoryHost = el('div', { class: 'faculty-categories', role: 'group', 'aria-label': 'Filter faculty by category' });
  filters.append(query, categoryHost);
  const groupsHost = el('div', { class: 'faculty-groups' });
  host.replaceChildren(filters, groupsHost);
  const load = async () => {
    loading(groupsHost, 'Loading directory…');
    try {
      rows = await facultyModel.listPublic();
      renderCategories();
      render();
    } catch (e) { failure(groupsHost, e.message, load); }
  };
  const render = () => {
      const term = query.value.trim().toLocaleLowerCase();
      const filtered = rows.filter((person) => (activeGroup === 'All' || (person.group_label || 'Faculty & Staff') === activeGroup)
        && `${person.name} ${person.position} ${person.department} ${person.group_label || ''}`.toLocaleLowerCase().includes(term));
      if (!filtered.length) return empty(groupsHost, rows.length ? 'No faculty match your search.' : 'The directory is empty.', rows.length ? 'Try another name or department.' : 'Faculty and staff will be listed here.');
      // Keep group headings while allowing a name or department search.
      const groups = new Map();
      for (const r of filtered) {
        const g = r.group_label || 'Faculty & Staff';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(r);
      }
      const directory = el('section', { class: 'faculty-groups', 'aria-label': 'Faculty and staff by group' });
      for (const [g, people] of groups) {
        directory.append(el('section', { class: 'faculty-group', 'aria-label': g },
          el('h2', { class: 'faculty-group-title', text: g }),
          el('ul', { class: 'faculty-cards row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3' }, people.map((p) => facultyCard(p)) )));
      }
      clear(groupsHost).append(directory);
  };
  const renderCategories = () => {
    const groups = ['All', ...new Set(rows.map((person) => person.group_label || 'Faculty & Staff'))];
    categoryHost.replaceChildren(...groups.map((group) => el('button', {
      type: 'button', class: `faculty-category${activeGroup === group ? ' is-active' : ''}`,
      'aria-pressed': String(activeGroup === group), text: group,
      onclick: () => { activeGroup = group; renderCategories(); render(); },
    })));
  };
  query.addEventListener('input', render);
  load();
}

function facultyCard(person) {
  const imageUrl = safeUrl(person.image_url);
  const emailValue = person.email
    ? el('a', { class: 'faculty-email', href: `mailto:${person.email}`, text: person.email })
    : '';
  return el('li', { class: 'col' }, el('article', { class: 'faculty-card' },
    imageUrl ? el('img', { class: 'faculty-photo', src: imageUrl, alt: person.name, loading: 'lazy' }) : el('span', { class: 'faculty-avatar', 'aria-hidden': 'true', text: initials(person.name) }),
    el('h3', { class: 'faculty-name', text: person.name }),
    el('p', { class: 'faculty-position', text: person.position }),
    el('p', { class: 'faculty-department', text: person.department }),
    el('a', { class: 'faculty-profile-link', href: `faculty-profile.html?id=${encodeURIComponent(person.id)}`, text: 'View profile →' }),
    emailValue ? el('div', { class: 'faculty-contact' }, emailValue) : null));
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}
