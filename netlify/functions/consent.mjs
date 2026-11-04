const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) return json(503, { error: 'Consent sync is not configured.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  if (!uuid.test(body?.visitor_id || '') || typeof body.analytics !== 'boolean') return json(400, { error: 'Invalid preferences.' });
  const saved = await fetch(`${url}/rest/v1/cookie_consents?on_conflict=visitor_id`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ visitor_id: body.visitor_id, essential: true, analytics: body.analytics, updated_at: new Date().toISOString() }),
  });
  return saved.ok ? json(204, null) : json(503, { error: 'Preferences could not be synchronized.' });
};
function json(statusCode, body) { return new Response(body === null ? null : JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
