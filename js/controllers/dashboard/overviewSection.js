import { el, clear } from '../../views/dom.js';
import { loading, failure } from '../../views/status.js';
import { countByStatus as studentCounts } from '../../models/profileModel.js';
import { countByStatus as inquiryCounts } from '../../models/inquiryModel.js';
import { programsModel, facultyModel, announcementsModel } from '../../models/contentModel.js';

export async function overviewSection(container, ctx) {
  clear(container);
  const host = el('div');
  container.append(el('div', { class: 'section-head' }, el('h2', { text: 'Overview' })), host);
  async function load() {
    loading(host);
    try {
      const [stu, inq, progAll, progPub, fac, annAll, annPub] = await Promise.all([
        studentCounts(), inquiryCounts(), programsModel.count(), programsModel.countPublished(),
        facultyModel.count(), announcementsModel.count(), announcementsModel.countPublished()]);
      const link = (text, section, filter) => el('a', { href: `#${section}`, text,
        onclick: () => { ctx.setFilter(section, filter); } });
      clear(host).append(
        el('div', { class: 'overview' },
          el('section', { 'aria-labelledby': 'ov-students' },
            el('h3', { id: 'ov-students', text: 'Students' }),
            el('dl', { class: 'stats' },
              el('dt', {}, link('Waiting for approval', 'students', 'pending')), el('dd', { text: stu.pending }),
              el('dt', { text: 'Approved' }), el('dd', { text: stu.approved }),
              el('dt', { text: 'Rejected' }), el('dd', { text: stu.rejected }))),
          el('section', { 'aria-labelledby': 'ov-inq' },
            el('h3', { id: 'ov-inq', text: 'Inquiries' }),
            el('dl', { class: 'stats' },
              el('dt', {}, link('Open', 'inquiries', 'open')), el('dd', { text: inq.open }),
              el('dt', { text: 'In progress' }), el('dd', { text: inq.in_progress }),
              el('dt', { text: 'Resolved' }), el('dd', { text: inq.resolved }),
              el('dt', { text: 'Closed' }), el('dd', { text: inq.closed }))),
          el('section', { 'aria-labelledby': 'ov-content' },
            el('h3', { id: 'ov-content', text: 'Content' }),
            el('dl', { class: 'stats' },
              el('dt', {}, link('Programs published', 'programs')), el('dd', { text: `${progPub} of ${progAll}` }),
              el('dt', {}, link('Announcements published', 'announcements')), el('dd', { text: `${annPub} of ${annAll}` }),
              el('dt', {}, link('Faculty and staff', 'faculty')), el('dd', { text: fac })))));
    } catch (e) { failure(host, e.message, load); }
  }
  load();
}
