const fields = ['name','position','department','group_label','email','bio','image_url','qualifications','professional_info','display_order'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async (request) => {
  const env = process.env;
  const mainUrl = env.SUPABASE_URL;
  const mainKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const mainServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const facultyUrl = env.FACULTY_SUPABASE_URL;
  const facultyServiceKey = env.FACULTY_SUPABASE_SERVICE_ROLE_KEY;
  if (!mainUrl || !mainKey || !mainServiceKey || !facultyUrl || !facultyServiceKey)
    return json(503, { error: 'Faculty management is not configured on the server.' });
  if (!['POST','PATCH','DELETE'].includes(request.method)) return json(405, { error: 'Method not allowed.' });

  const bearer = request.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) return json(401, { error: 'Administrator sign-in required.' });
  const userResponse = await fetch(`${mainUrl}/auth/v1/user`, { headers: { apikey: mainKey, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) return json(401, { error: 'Your session is invalid or expired.' });
  const user = await userResponse.json();
  const profileResponse = await fetch(`${mainUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,approval_status`, {
    headers: { apikey: mainServiceKey, Authorization: `Bearer ${mainServiceKey}` },
  });
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  if (profile?.role !== 'admin' || profile?.approval_status !== 'approved')
    return json(403, { error: 'Administrator access required.' });

  let input;
  try { input = await request.json(); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const id = input?.id;
  if (request.method !== 'POST' && !uuid.test(id || '')) return json(400, { error: 'A valid faculty record id is required.' });
  const payload = Object.fromEntries(fields.filter((field) => Object.hasOwn(input || {}, field)).map((field) => [field, input[field]]));
  if (request.method !== 'DELETE') {
    if (request.method === 'POST' && (!payload.name || !payload.position || !payload.department))
      return json(400, { error: 'Name, position and department are required.' });
    if (Object.entries(payload).some(([key, value]) => typeof value === 'string' && value.length > ({ bio: 2000, professional_info: 2000, qualifications: 2000 }[key] || 200)))
      return json(400, { error: 'One or more fields are too long.' });
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return json(400, { error: 'Enter a valid email address.' });
    if (payload.image_url && !/^https:\/\//i.test(payload.image_url)) return json(400, { error: 'Image URLs must use HTTPS.' });
  }
  const method = request.method === 'POST' ? 'POST' : request.method === 'PATCH' ? 'PATCH' : 'DELETE';
  const query = method === 'POST' ? '' : `?id=eq.${encodeURIComponent(id)}&select=*`;
  const url = `${facultyUrl}/rest/v1/faculty${query}`;
  const rest = await fetch(url, {
    method,
    headers: {
      apikey: facultyServiceKey,
      Authorization: `Bearer ${facultyServiceKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'DELETE' ? 'return=minimal' : 'return=representation',
    },
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(payload) }),
  });
  if (!rest.ok) return json(400, { error: 'The faculty database rejected this change.' });
  const rows = method === 'DELETE' ? [] : await rest.json();
  if (method !== 'POST' && !rows.length && method !== 'DELETE') return json(404, { error: 'Faculty record not found.' });
  await auditMain(mainUrl, mainServiceKey, user.id, 'faculty', method, method === 'DELETE' ? id : rows[0]?.id);
  return json(200, { data: rows[0] ?? null });
};

async function auditMain(url, key, actor, entity, operation, entityId) {
  await fetch(`${url}/rest/v1/admin_activity`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: actor, entity, operation, entity_id: entityId || null }),
  }).catch(() => {});
}

function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
