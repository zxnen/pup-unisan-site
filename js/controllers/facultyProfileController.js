import { facultySupabase, facultyConfigurationMessage } from '../facultySupabaseClient.js';
import { el, safeUrl } from '../views/dom.js';

export async function init() {
  const host = document.getElementById('faculty-profile-content');
  if (!facultySupabase) return showError(facultyConfigurationMessage());
  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return showError('This faculty profile link is invalid.');
  const { data: person, error } = await facultySupabase.from('faculty').select('*').eq('id', id).maybeSingle();
  if (error) return showError('The faculty profile could not be loaded. Please try again later.');
  if (!person) return showError('This faculty profile is unavailable.');

  document.title = `${person.name} | PUP Unisan Faculty`;
  document.getElementById('faculty-breadcrumb-name').textContent = person.name;
  const image = safeUrl(person.image_url);
  const portrait = image ? el('img', { class: 'faculty-profile-photo', src: image, alt: person.name, fetchpriority: 'high' })
    : el('div', { class: 'faculty-profile-placeholder', 'aria-hidden': 'true', text: String(person.name).split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase() });
  const card = el('aside', { class: 'faculty-profile-card' }, portrait,
    el('div', { class: 'faculty-profile-card-caption' }, el('h1', { text: person.name }),
      el('p', { text: [person.position, person.department].filter(Boolean).join(' · ') }),
      person.email ? el('a', { href: `mailto:${person.email}`, class: 'btn btn-gold', text: 'Contact' }) : null));
  const details = el('div', { class: 'faculty-profile-details' }, el('h2', { text: 'About me' }),
    el('p', { class: person.bio ? '' : 'muted', text: person.bio || 'Profile information will be added soon.' }));
  if (person.qualifications) details.append(el('section', { class: 'faculty-profile-section' }, el('h2', { text: 'Education & qualifications' }), ...String(person.qualifications).split(/\n+/).filter(Boolean).map((item) => el('p', { text: item }))));
  if (person.professional_info) details.append(el('section', { class: 'faculty-profile-section' }, el('h2', { text: 'Research & professional work' }), ...String(person.professional_info).split(/\n+/).filter(Boolean).map((item) => el('p', { text: item }))));
  host.replaceChildren(el('div', { class: 'faculty-profile-layout' }, card, details));

  function showError(message) {
    host.replaceChildren(el('p', { class: 'notice notice-warn', role: 'status', text: message }), el('a', { href: 'faculty.html', class: 'btn btn-quiet', text: 'Back to faculty directory' }));
  }
}
