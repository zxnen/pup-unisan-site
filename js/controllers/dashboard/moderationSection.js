import { supabase } from '../../supabaseClient.js';
import { el, clear, formatDate } from '../../views/dom.js';
import { failure, announce } from '../../views/status.js';

export async function moderationSection(container) {
  let view = 'queue';
  const tabs = el('div', { class: 'tabs moderation-tabs', role: 'tablist', 'aria-label': 'Moderation tools' });
  const content = el('div', { class: 'moderation-list', 'aria-live': 'polite' });
  const historyDialog = el('dialog', { class: 'dialog' });
  container.replaceChildren(el('div', { class: 'section-head' }, el('h2', { text: 'Comments & safety' }),
    el('p', { class: 'muted', text: 'Review submissions and manage visitor restrictions.' })), tabs, content, historyDialog);

  const labels = { queue: 'Review queue', visitors: 'Flagged visitors', bans: 'Ban history', logs: 'Security log' };
  const renderTabs = () => tabs.replaceChildren(...Object.entries(labels).map(([key, title]) => el('button', {
    type: 'button', role: 'tab', 'aria-selected': String(view === key), text: title,
    onclick: () => { view = key; load(); },
  })));

  async function load() {
    renderTabs();
    content.replaceChildren(el('p', { class: 'state', text: 'Loading moderation records…' }));
    try {
      const result = await api(`?view=${view}`);
      const rows = result.data || [];
      if (!rows.length) { content.replaceChildren(el('p', { class: 'state state-empty', text: view === 'queue' ? 'No comments need review.' : 'No records to show.' })); return; }
      content.replaceChildren(...rows.map((row) => view === 'queue' ? commentCard(row) : view === 'bans' ? banCard(row) : view === 'logs' ? logCard(row) : visitorCard(row)));
    } catch (error) { failure(content, error.message, load); }
  }

  function commentCard(row) {
    return el('article', { class: 'moderation-card' },
      el('div', { class: 'moderation-card-head' }, el('strong', { text: row.display_name }), el('time', { datetime: row.created_at, text: formatDate(row.created_at, true) })),
      el('p', { class: 'moderation-body', text: row.body }),
      el('p', { class: 'moderation-id', text: `Visitor ${row.visitor_id}` }),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-ok btn-small', type: 'button', text: 'Approve', onclick: () => review(row,'approved') }),
        el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Reject', onclick: () => review(row,'rejected') }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'View history', onclick: () => history(row.visitor_id) }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Ban visitor', onclick: () => ban(row.visitor_id) })));
  }
  function visitorCard(row) {
    return el('article', { class: 'moderation-card' },
      el('div', { class: 'moderation-card-head' }, el('strong', { text: `Visitor ${row.visitor_id}` }), el('time', { text: row.last_offense_at ? formatDate(row.last_offense_at, true) : 'No recent activity' })),
      el('p', { text: `${row.offense_count} recorded offenses · ${row.serious_offense_count} serious signals · ${row.previous_ban_restriction ? 'review required' : 'no moderation hold'}` }),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'View history', onclick: () => history(row.visitor_id) }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Ban visitor', onclick: () => ban(row.visitor_id) }),
        row.previous_ban_restriction ? el('button', { class: 'btn btn-ok btn-small', type: 'button', text: 'Clear review restriction', onclick: () => clearRestriction(row.visitor_id) }) : null));
  }
  function banCard(row) {
    const active = !row.lifted_at && (!row.expires_at || new Date(row.expires_at) > new Date());
    return el('article', { class: 'moderation-card' },
      el('div', { class: 'moderation-card-head' }, el('strong', { text: row.reason }), el('time', { text: active ? 'Active' : 'Expired or lifted' })),
      el('p', { text: `Visitor ${row.visitor_id}` }),
      el('p', { class: 'muted', text: `Started ${formatDate(row.starts_at, true)} · ${row.expires_at ? `Ends ${formatDate(row.expires_at, true)}` : 'No expiry'}` }),
      el('div', { class: 'row-actions' },
        active ? el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'Unban', onclick: () => unban(row) }) : null,
        el('button', { class: 'btn btn-ok btn-small', type: 'button', text: 'Clear review restriction', onclick: () => clearRestriction(row.visitor_id) }),
        el('button', { class: 'btn btn-quiet btn-small', type: 'button', text: 'View history', onclick: () => history(row.visitor_id) })));
  }
  function logCard(row) {
    return el('article', { class: 'moderation-card' },
      el('div', { class: 'moderation-card-head' }, el('strong', { text: row.action.replaceAll('_',' ') }), el('time', { datetime: row.created_at, text: formatDate(row.created_at, true) })),
      row.visitor_id ? el('p', { class: 'moderation-id', text: `Visitor ${row.visitor_id}` }) : null,
      el('p', { class: 'muted', text: JSON.stringify(row.detail || {}) }));
  }
  async function review(row, decision) {
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : 'Reject'} this comment?`)) return;
    try { await api('', 'PATCH', { action: 'review', id: row.id, decision }); announce(`Comment ${decision}.`); load(); }
    catch (error) { announce(error.message, 'error'); }
  }
  async function ban(visitorId) {
    const form = el('form', { class: 'moderation-ban-form' });
    const reason = el('input', { name: 'reason', required: true, maxlength: '500', placeholder: 'Reason for restriction' });
    const days = el('select', { name: 'days' }, el('option', { value: '1', text: '24 hours' }), el('option', { value: '3', text: '3 days' }), el('option', { value: '7', text: '7 days' }), el('option', { value: '0', text: 'No expiry — administrator decision' }));
    const dialog = el('dialog', { class: 'dialog dialog-small' }, el('h2', { text: 'Restrict visitor' }), el('p', { class: 'muted', text: `Visitor ${visitorId}` }),
      el('label', {}, 'Reason', reason), el('label', {}, 'Duration', days),
      el('div', { class: 'actions' }, el('button', { class: 'btn', type: 'submit', text: 'Apply restriction' }), el('button', { class: 'btn btn-quiet', type: 'button', text: 'Cancel', onclick: () => dialog.close() })));
    dialog.append(form); document.body.append(dialog); dialog.showModal();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api('', 'POST', { action: 'ban', visitor_id: visitorId, days: Number(days.value), reason: reason.value }); dialog.close(); dialog.remove(); announce('Visitor restriction applied.'); load(); }
      catch (error) { announce(error.message, 'error'); }
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  async function unban(row) {
    if (!window.confirm('Lift the active ban? Previous-ban moderation review will remain until you clear it explicitly.')) return;
    try { await api('', 'POST', { action: 'unban', id: row.id }); announce('Ban lifted. Review restriction remains.'); load(); }
    catch (error) { announce(error.message, 'error'); }
  }
  async function clearRestriction(visitorId) {
    if (!window.confirm('Clear the previous-ban review requirement for this visitor?')) return;
    try { await api('', 'POST', { action: 'clear-restriction', visitor_id: visitorId }); announce('Moderation restriction cleared.'); load(); }
    catch (error) { announce(error.message, 'error'); }
  }
  async function history(visitorId) {
    try {
      const result = await api(`?view=history&visitor_id=${encodeURIComponent(visitorId)}`);
      const events = result.events || [], bans = result.bans || [], abuse = result.abuse;
      historyDialog.replaceChildren(el('h2', { text: 'Visitor history' }), el('p', { class: 'moderation-id', text: visitorId }),
        abuse ? el('p', { text: `${abuse.offense_count} offenses · ${abuse.serious_offense_count} serious signals · ${abuse.previous_ban_restriction ? 'review restriction active' : 'no review restriction'}` }) : el('p', { text: 'No aggregate abuse record.' }),
        el('h3', { text: 'Security events' }), events.length ? el('ul', {}, events.map((item) => el('li', { text: `${formatDate(item.created_at, true)} · ${item.event_type}` }))) : el('p', { text: 'No security events.' }),
        el('h3', { text: 'Ban history' }), bans.length ? el('ul', {}, bans.map((item) => el('li', { text: `${item.reason} · ${formatDate(item.starts_at)} to ${item.expires_at ? formatDate(item.expires_at) : 'no expiry'}${item.lifted_at ? ' · lifted' : ''}` }))) : el('p', { text: 'No prior bans.' }),
        el('button', { class: 'btn btn-quiet', type: 'button', text: 'Close', onclick: () => historyDialog.close() }));
      historyDialog.showModal();
    } catch (error) { announce(error.message, 'error'); }
  }
  async function api(query = '', method = 'GET', body) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Your session has expired. Sign in again.');
    const response = await fetch(`/.netlify/functions/moderation${query}`, { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Moderation request failed.');
    return result;
  }

  renderTabs();
  await load();
}
