import { backendProblem } from '../supabaseClient.js';
import { getCurrentUser } from './sessionController.js';
import { el, clear, label } from '../views/dom.js';
import { failure, notice } from '../views/status.js';
import { overviewSection } from './dashboard/overviewSection.js';
import { profileSection } from './dashboard/profileSection.js';
import { studentInquiriesSection } from './dashboard/studentInquiriesSection.js';
import { studentsSection } from './dashboard/studentsSection.js';
import { adminInquiriesSection } from './dashboard/inquiriesSection.js';
import { programsSection, facultySection, announcementsSection } from './dashboard/manageSections.js';

const ALL = {
  overview: { title: 'Overview', render: overviewSection },
  students: { title: 'Students', render: studentsSection },
  inquiries: { title: 'Inquiries', render: adminInquiriesSection },
  programs: { title: 'Programs', render: programsSection },
  faculty: { title: 'Faculty', render: facultySection },
  announcements: { title: 'Announcements', render: announcementsSection },
  profile: { title: 'My profile', render: profileSection },
  myinquiries: { title: 'My inquiries', render: studentInquiriesSection },
};

// Which sections to OFFER, based on the profile read from the database. This only decides what
// the interface shows; Supabase RLS independently refuses anything the user is not entitled to.
function allowedSections(p) {
  if (p.role === 'admin' && p.approval_status === 'approved') return ['overview', 'students', 'inquiries', 'programs', 'faculty', 'announcements', 'profile'];
  if (p.role === 'student' && p.approval_status === 'approved') return ['profile', 'myinquiries'];
  return ['profile']; // pending, rejected, or an unapproved admin: basic profile only
}

export async function init() {
  const root = document.getElementById('dashboard-root');
  if (backendProblem) return failure(root, backendProblem);
  const current = await getCurrentUser();
  if (!current) { window.location.replace('login.html'); return; }
  const { profile, user } = current;
  const allowed = allowedSections(profile);
  const filters = {};
  const ctx = { profile, user, setFilter: (s, f) => { filters[s] = f || ''; } };

  const banner = el('div');
  if (profile.approval_status === 'pending') banner.append(notice('warn', 'Your account is waiting for approval.',
    'A campus administrator needs to approve it before you can send inquiries. Until then you can only update your basic profile.'));
  if (profile.approval_status === 'rejected') banner.append(notice('error', 'Your registration was not approved.',
    'You cannot send inquiries. Please contact the campus at unisan@pup.edu.ph if you think this is a mistake.'));

  const nav = el('nav', { class: 'dash-nav', 'aria-label': 'Dashboard sections' });
  const content = el('section', { class: 'dash-content', id: 'dash-content', tabindex: '-1', 'aria-label': 'Dashboard content' });
  clear(root).append(
    el('div', { class: 'dash-intro' },
      el('h1', { text: profile.role === 'admin' && allowed.includes('overview') ? 'Administrator dashboard' : 'Student dashboard' }),
      el('p', { class: 'muted', text: `Signed in as ${profile.full_name || profile.email || user.email} (${label(profile.role)})` })),
    banner, el('div', { class: 'dash' }, nav, content));

  function current_() {
    const h = window.location.hash.slice(1);
    return allowed.includes(h) ? h : allowed[0];
  }
  function renderNav(active) {
    clear(nav).append(el('ul', {}, allowed.map((k) => el('li', {},
      el('a', { href: `#${k}`, 'aria-current': k === active ? 'page' : null, text: ALL[k].title })))));
  }
  async function show() {
    const key = current_();
    renderNav(key);
    content.dataset.section = key;
    const initialFilter = filters[key]; delete filters[key]; // a filter set from the overview applies once
    try { await ALL[key].render(content, { ...ctx, initialFilter }); }
    catch (e) { console.error(e); failure(content, e.message || 'This section could not be loaded.', show); }
  }
  window.addEventListener('hashchange', () => { show(); content.focus({ preventScroll: true }); });
  show();
}
