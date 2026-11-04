import { el, clear, formatDate } from '../../views/dom.js';
import { loading, failure } from '../../views/status.js';
import { facultyModel } from '../../models/contentModel.js';
import { supabase } from '../../supabaseClient.js';

export async function overviewSection(container, ctx) {
  const host = el('div');
  let days = 30;
  const sectionHead = el('div', { class: 'section-head' }, el('div', {}, el('h2', { text: 'Dashboard overview' }),
    el('p', { class: 'muted', text: 'Live counts and recent activity from the campus systems.' })),
    el('a', { class: 'btn btn-quiet btn-small', href: '#inquiries', text: 'Review inquiries' }));
  container.replaceChildren(sectionHead, host);

  async function load() {
    loading(host, 'Loading live dashboard data…');
    try {
      if (!supabase) throw new Error('Main Supabase configuration is missing. Add the public main-project values and apply the current migrations.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired. Sign in again.');
      const response = await fetch(`/.netlify/functions/moderation?view=summary&days=${days}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Live dashboard data could not be loaded.');
      const faculty = await facultyModel.count();
      render(data, faculty);
    } catch (error) { failure(host, error.message || 'Dashboard data could not be loaded.', load); }
  }

  function render(data, faculty) {
    const totals = data.totals;
    const metrics = [
      ['Total students', totals.students], ['Total faculty', faculty], ['Announcements', totals.announcements],
      ['Pending inquiries', totals.pendingInquiries], ['Pending comments', totals.pendingComments], ['Active visitor bans', totals.activeBans],
    ];
    const metricGrid = el('div', { class: 'metric-grid' }, metrics.map(([label, value]) =>
      el('a', { class: 'metric-card', href: metricHref(label), 'aria-label': `${label}: ${value === null ? 'unavailable' : value}` },
        el('span', { class: 'metric-card-label', text: label }),
        el('strong', { class: 'metric-card-value', text: value === null ? '—' : Number(value).toLocaleString() }))));
    const select = el('select', { class: 'form-select form-select-sm', 'aria-label': 'Activity chart date range', onchange: () => { days = Number(select.value); load(); } },
      [7,30,90].map((days) => el('option', { value: String(days), selected: Number(data.days) === days, text: `Last ${days} days` })));
    const activity = el('section', { class: 'activity-panel', 'aria-labelledby': 'activity-title' },
      el('div', { class: 'activity-filters' }, el('h3', { id: 'activity-title', text: 'Submissions over time' }), select),
      buildChart(data.trends, Number(data.days)));
    const recent = el('section', { class: 'activity-panel', 'aria-labelledby': 'recent-comments-title' },
      el('h3', { id: 'recent-comments-title', text: 'Recent comments' }),
      activityList(data.recent.comments || [], (row) => row.display_name, (row) => `${row.body} · ${row.status}`, '#moderation'));
    const inquiries = el('section', { class: 'activity-panel', 'aria-labelledby': 'recent-inquiries-title' },
      el('h3', { id: 'recent-inquiries-title', text: 'Recent inquiries' }),
      activityList(data.recent.inquiries || [], (row) => row.full_name || row.profiles?.full_name || row.email || row.profiles?.email || 'Inquiry', (row) => `${row.email || row.profiles?.email || ''}${row.email || row.profiles?.email ? ' · ' : ''}${row.subject} · ${row.status}`, '#inquiries'));
    const actions = el('section', { class: 'activity-panel', 'aria-labelledby': 'recent-actions-title' },
      el('h3', { id: 'recent-actions-title', text: 'Administrative activity' }),
      activityList(data.recent.actions || [], (row) => row.profiles?.full_name || 'Administrator', (row) => row.action ? row.action.replaceAll('_',' ') : `${row.operation} · ${row.entity}`, '#moderation'));
    const events = el('section', { class: 'activity-panel', 'aria-labelledby': 'security-events-title' },
      el('h3', { id: 'security-events-title', text: 'Recent security events' }),
      activityList(data.recent.events || [], () => 'Visitor event', (row) => row.event_type.replaceAll('_',' '), '#moderation'));
    clear(host).append(metricGrid, el('div', { class: 'overview-grid' }, activity, recent),
      el('div', { class: 'overview-grid mt-3' }, inquiries, actions),
      el('div', { class: 'overview-grid mt-3' }, events,
        el('section', { class: 'activity-panel' }, el('h3', { text: 'Manage campus content' }),
          el('div', { class: 'row-actions' }, ...[['Students','#students'],['Programs','#programs'],['Faculty','#faculty'],['Announcements','#announcements'],['Homepage settings','#sitecontent'],['Media library','#media']]
            .map(([label, href]) => el('a', { class: 'btn btn-quiet btn-small', href, text: label }))))));
  }

  await load();
  function metricHref(label) {
    if (label.includes('student')) return '#students';
    if (label.includes('inquir')) return '#inquiries';
    if (label.includes('comment') || label.includes('bans')) return '#moderation';
    if (label.includes('faculty')) return '#faculty';
    return '#announcements';
  }
}

function activityList(rows, title, detail, href) {
  if (!rows.length) return el('p', { class: 'state', text: 'No recent records.' });
  return el('div', { class: 'activity-list' }, rows.map((row) => el('article', {},
    el('strong', { text: title(row) }), el('p', { class: 'mb-1', text: detail(row) }),
    el('time', { datetime: row.created_at, text: formatDate(row.created_at, true) }),
    el('a', { class: 'visually-hidden-focusable', href, text: 'Open related section' }))));
}

function buildChart(trends, days) {
  const inquiryRows = trends?.inquiries || [];
  const commentRows = trends?.comments || [];
  const bins = Math.min(days, days === 90 ? 13 : days === 30 ? 15 : 7);
  const start = Date.now() - days * 86400000;
  const totals = Array.from({ length: bins }, () => 0);
  for (const row of [...inquiryRows, ...commentRows]) {
    const offset = new Date(row.created_at).getTime() - start;
    const index = Math.floor(offset / (days * 86400000) * bins);
    if (index >= 0 && index < bins) totals[index] += 1;
  }
  if (!totals.some(Boolean)) return el('p', { class: 'state', text: `No inquiry or comment submissions were recorded in the last ${days} days.` });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const viewportWidth = window.innerWidth;
  const chartWidth = Math.max(220, Math.min(640, Math.floor(viewportWidth <= 900
    ? viewportWidth - 80
    : (Math.min(viewportWidth - 32, 1280) - 312) * 1.3 / 2.2 - 32)));
  svg.setAttribute('class', 'activity-chart'); svg.setAttribute('viewBox', `0 0 ${chartWidth} 220`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Inquiry and comment submissions over the last ${days} days. Total ${totals.reduce((a,b)=>a+b,0)}.`);
  const max = Math.max(...totals, 1); const left = 34, right = chartWidth - 12, top = 22, bottom = 180;
  for (let line = 0; line <= 3; line++) {
    const y = top + (bottom - top) * line / 3;
    const grid = document.createElementNS(svg.namespaceURI, 'line'); grid.setAttribute('x1', left); grid.setAttribute('x2', right); grid.setAttribute('y1', y); grid.setAttribute('y2', y); grid.setAttribute('class', 'chart-grid'); svg.append(grid);
    const label = document.createElementNS(svg.namespaceURI, 'text'); label.setAttribute('x', '2'); label.setAttribute('y', String(y + 4)); label.textContent = String(Math.round(max * (3 - line) / 3)); svg.append(label);
  }
  const coords = totals.map((value, i) => [left + (right-left) * (bins === 1 ? .5 : i/(bins-1)), bottom - (bottom-top) * value/max]);
  const area = document.createElementNS(svg.namespaceURI, 'polygon');
  area.setAttribute('class', 'chart-area'); area.setAttribute('points', `${left},${bottom} ${coords.map((p)=>p.join(',')).join(' ')} ${right},${bottom}`); svg.append(area);
  const line = document.createElementNS(svg.namespaceURI, 'polyline'); line.setAttribute('class', 'chart-line'); line.setAttribute('points', coords.map((p)=>p.join(',')).join(' ')); svg.append(line);
  for (const [x,y] of coords) { const point = document.createElementNS(svg.namespaceURI, 'circle'); point.setAttribute('class','chart-point'); point.setAttribute('cx',x); point.setAttribute('cy',y); point.setAttribute('r','3.5'); svg.append(point); }
  const firstDate = document.createElementNS(svg.namespaceURI, 'text'); firstDate.setAttribute('x', String(left)); firstDate.setAttribute('y', '210'); firstDate.textContent = `${days} days ago`; svg.append(firstDate);
  const lastDate = document.createElementNS(svg.namespaceURI, 'text'); lastDate.setAttribute('x', String(right)); lastDate.setAttribute('y', '210'); lastDate.setAttribute('text-anchor', 'end'); lastDate.textContent = 'Today'; svg.append(lastDate);
  const wasLimited = inquiryRows.length >= 1000 || commentRows.length >= 1000;
  const caption = el('p', { class: 'hint', text: `Combined inquiries and public comments · ${inquiryRows.length + commentRows.length} records loaded · ${days}-day window${wasLimited ? ' (maximum 1,000 records per source)' : ''}.` });
  return el('div', {}, svg, caption);
}
