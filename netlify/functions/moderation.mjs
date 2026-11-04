const mainUrl = () => process.env.SUPABASE_URL;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey = () => process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const restHeaders = () => ({ apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json' });
const validId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '');

export default async (request) => {
  if (!mainUrl() || !serviceKey() || !publicKey()) return json(503, { error: 'Moderation is not configured on the server.' });
  const bearer = request.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) return json(401, { error: 'Administrator sign-in required.' });
  const verified = await fetch(`${mainUrl()}/auth/v1/user`, { headers: { apikey: publicKey(), Authorization: `Bearer ${token}` } });
  if (!verified.ok) return json(401, { error: 'Your session is invalid or expired.' });
  const user = await verified.json();
  const profileResponse = await fetch(`${mainUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,approval_status`, { headers: restHeaders() });
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  if (profile?.role !== 'admin' || profile?.approval_status !== 'approved') return json(403, { error: 'Administrator access required.' });

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'queue';
    if (view === 'summary') {
      const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      try {
        const [students, announcements, inquiries, pendingInquiries, pendingComments, activeBans,
          comments, recentInquiries, actions, moderationActions, events, inquiryTrend, commentTrend] = await Promise.all([
          countRows('profiles?role=eq.student&select=id'),
          countRows('announcements?select=id'),
          countRows('inquiries?select=id'),
          countRows('inquiries?status=in.(open,in_progress)&select=id'),
          countRows('public_comments?status=eq.pending&select=id'),
          countRows(`visitor_bans?lifted_at=is.null&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&select=id`),
          getData('public_comments?select=id,display_name,body,status,created_at&order=created_at.desc&limit=5'),
          getData('inquiries?select=id,subject,status,created_at,full_name,email,profiles!inquiries_user_id_fkey(full_name)&order=created_at.desc&limit=5'),
          getData('admin_activity?select=id,entity,entity_id,operation,created_at,profiles(full_name)&order=created_at.desc&limit=8'),
          getData('security_audit_logs?select=id,action,created_at,profiles(full_name)&order=created_at.desc&limit=8'),
          getData('security_events?select=id,event_type,created_at&order=created_at.desc&limit=8'),
          getData(`inquiries?created_at=gte.${encodeURIComponent(since)}&select=created_at&order=created_at.asc&limit=1000`),
          getData(`public_comments?created_at=gte.${encodeURIComponent(since)}&select=created_at&order=created_at.asc&limit=1000`),
        ]);
        const recentActions = [...actions, ...moderationActions].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,8);
        return json(200, { days, totals: { students, faculty: null, announcements, inquiries, pendingInquiries, pendingComments, activeBans },
          recent: { comments, inquiries: recentInquiries, actions: recentActions, events }, trends: { inquiries: inquiryTrend, comments: commentTrend } });
      } catch (error) {
        console.error('Dashboard summary query failed:', error);
        return json(503, { error: 'Dashboard activity data could not be loaded. Apply the latest main-project migrations and try again.' });
      }
    }
    if (view === 'queue') return getRows('public_comments?status=eq.pending&select=id,visitor_id,display_name,body,created_at,held_for_review&order=created_at.asc&limit=100');
    if (view === 'bans') return getRows('visitor_bans?select=id,visitor_id,reason,starts_at,expires_at,lifted_at,created_at&order=created_at.desc&limit=100');
    if (view === 'visitors') return getRows('visitor_abuse?serious_offense_count=gte.1&select=visitor_id,offense_count,serious_offense_count,previous_ban_restriction,last_offense_at&order=last_offense_at.desc&limit=100');
    if (view === 'logs') return getRows('security_audit_logs?select=id,actor_id,action,visitor_id,subject_id,detail,created_at&order=created_at.desc&limit=150');
    if (view === 'history') {
      const visitorId = url.searchParams.get('visitor_id');
      if (!validId(visitorId)) return json(400, { error: 'A valid visitor id is required.' });
      const [events, bans, abuse] = await Promise.all([
        getData(`security_events?visitor_id=eq.${visitorId}&select=event_type,ip_hash,created_at&order=created_at.desc&limit=50`),
        getData(`visitor_bans?visitor_id=eq.${visitorId}&select=reason,starts_at,expires_at,lifted_at,created_at&order=created_at.desc&limit=50`),
        getData(`visitor_abuse?visitor_id=eq.${visitorId}&select=offense_count,serious_offense_count,previous_ban_restriction,last_offense_at`),
      ]);
      return json(200, { events, bans, abuse: abuse[0] || null });
    }
    return json(400, { error: 'Unknown moderation view.' });
  }
  if (!['PATCH','POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
  let input;
  try { input = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  const actor = user.id;
  if (request.method === 'PATCH' && input.action === 'review') {
    if (!validId(input.id) || !['approved','rejected'].includes(input.decision)) return json(400, { error: 'Invalid moderation decision.' });
    const result = await fetch(`${mainUrl()}/rest/v1/public_comments?id=eq.${input.id}&status=eq.pending`, {
      method: 'PATCH', headers: { ...restHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ status: input.decision, reviewed_at: new Date().toISOString(), reviewed_by: actor, moderation_note: String(input.note || '').slice(0,500) }),
    });
    const rows = result.ok ? await result.json() : [];
    if (!rows.length) return json(404, { error: 'Pending comment not found.' });
    await audit(actor, `comment_${input.decision}`, rows[0].visitor_id, rows[0].id);
    return json(200, { data: rows[0] });
  }
  if (request.method === 'POST' && input.action === 'ban') {
    if (!validId(input.visitor_id) || ![1,3,7,0].includes(Number(input.days)) || !String(input.reason || '').trim()) return json(400, { error: 'Choose a visitor, reason, and 1, 3, 7 or 0 days (0 means no expiry).' });
    const expiresAt = Number(input.days) === 0 ? null : new Date(Date.now()+Number(input.days)*86400000).toISOString();
    const inserted = await fetch(`${mainUrl()}/rest/v1/visitor_bans`, {
      method: 'POST', headers: { ...restHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ visitor_id: input.visitor_id, reason: String(input.reason).trim().slice(0,500), expires_at: expiresAt, created_by: 'admin' }),
    });
    if (!inserted.ok) return json(400, { error: 'Could not create the ban.' });
    await fetch(`${mainUrl()}/rest/v1/visitor_abuse?on_conflict=visitor_id`, {
      method: 'POST', headers: { ...restHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ visitor_id: input.visitor_id, previous_ban_restriction: true, last_offense_at: new Date().toISOString() }),
    });
    await audit(actor, 'visitor_banned', input.visitor_id, null, { days: Number(input.days) });
    return json(201, { data: (await inserted.json())[0] });
  }
  if (request.method === 'POST' && input.action === 'unban') {
    if (!validId(input.id)) return json(400, { error: 'Invalid ban id.' });
    const result = await fetch(`${mainUrl()}/rest/v1/visitor_bans?id=eq.${input.id}&lifted_at=is.null`, {
      method: 'PATCH', headers: { ...restHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ lifted_at: new Date().toISOString(), lifted_by: actor }),
    });
    const rows = result.ok ? await result.json() : [];
    if (!rows.length) return json(404, { error: 'Active ban not found.' });
    await audit(actor, 'visitor_unbanned', rows[0].visitor_id, rows[0].id);
    return json(200, { data: rows[0] });
  }
  if (request.method === 'POST' && input.action === 'clear-restriction') {
    if (!validId(input.visitor_id)) return json(400, { error: 'Invalid visitor id.' });
    await fetch(`${mainUrl()}/rest/v1/visitor_abuse?visitor_id=eq.${input.visitor_id}`, {
      method: 'PATCH', headers: { ...restHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ previous_ban_restriction: false }),
    });
    await audit(actor, 'moderation_restriction_cleared', input.visitor_id);
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown moderation action.' });
};

async function getRows(path) {
  try { return json(200, { data: await getData(path) }); }
  catch { return json(503, { error: 'Could not load moderation records.' }); }
}
async function countRows(path) {
  const response = await fetch(`${mainUrl()}/rest/v1/${path}`, {
    method: 'HEAD', headers: { ...restHeaders(), Prefer: 'count=exact' },
  });
  if (!response.ok) throw new Error(`Count query failed for ${path || 'faculty'}`);
  const range = response.headers.get('content-range') || '';
  return Number(range.split('/').at(-1)) || 0;
}
async function getData(path) {
  const response = await fetch(`${mainUrl()}/rest/v1/${path}`, { headers: restHeaders() });
  if (!response.ok) throw new Error('Query failed');
  return response.json();
}
async function audit(actor, action, visitorId, subjectId = null, detail = {}) {
  await fetch(`${mainUrl()}/rest/v1/security_audit_logs`, {
    method: 'POST', headers: { ...restHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: actor, action, visitor_id: visitorId, subject_id: subjectId, detail }),
  });
}
function json(statusCode, body) { return new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
