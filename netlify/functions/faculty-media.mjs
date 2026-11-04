const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const maxBytes = 5 * 1024 * 1024;

export default async (request) => {
  const env = process.env;
  const mainUrl = env.SUPABASE_URL;
  const mainKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const mainServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const facultyUrl = env.FACULTY_SUPABASE_URL;
  const facultyKey = env.FACULTY_SUPABASE_SERVICE_ROLE_KEY;
  if (!mainUrl || !mainKey || !mainServiceKey || !facultyUrl || !facultyKey)
    return json(503, { error: 'Faculty media storage is not configured on the server.' });

  const bearer = request.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!token) return json(401, { error: 'Administrator sign-in required.' });
  const verified = await fetch(`${mainUrl}/auth/v1/user`, { headers: { apikey: mainKey, Authorization: `Bearer ${token}` } });
  if (!verified.ok) return json(401, { error: 'Your session is invalid or expired.' });
  const user = await verified.json();
  const profileResponse = await fetch(`${mainUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,approval_status`, {
    headers: { apikey: mainServiceKey, Authorization: `Bearer ${mainServiceKey}` },
  });
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  if (profile?.role !== 'admin' || profile?.approval_status !== 'approved') return json(403, { error: 'Administrator access required.' });

  const headers = { apikey: facultyKey, Authorization: `Bearer ${facultyKey}`, 'Content-Type': 'application/json' };
  const storage = `${facultyUrl}/storage/v1`;
  if (request.method === 'GET') {
    const prefix = new URL(request.url).searchParams.get('prefix') || '';
    if (prefix && !/^\d{4}\/\d{2}\/$/.test(prefix)) return json(400, { error: 'Invalid media folder.' });
    const response = await fetch(`${storage}/object/list/faculty-media`, {
      method: 'POST', headers, body: JSON.stringify({ prefix, limit: 500, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
    });
    if (!response.ok) return json(503, { error: 'Could not list faculty images. Apply the faculty storage migration.' });
    const files = (await response.json()).map((file) => {
      if (!file.id) return { name: file.name, isFolder: true };
      const path = `${prefix}${file.name}`;
      return { name: file.name, path, isFolder: false, created_at: file.created_at, size: file.metadata?.size || 0,
        url: `${facultyUrl}/storage/v1/object/public/faculty-media/${path.split('/').map(encodeURIComponent).join('/')}` };
    });
    return json(200, { data: files });
  }
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return json(400, { error: 'Choose an image to upload.' });
    const ext = allowedTypes.get(file.type);
    if (!ext) return json(415, { error: 'Use a JPEG, PNG or WebP image.' });
    if (file.size > maxBytes) return json(413, { error: 'Images must be 5 MB or smaller.' });
    const now = new Date();
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasImageSignature(file.type, bytes)) return json(415, { error: 'The file content does not match its image type.' });
    const uploaded = await fetch(`${storage}/object/faculty-media/${path}`, {
      method: 'POST', headers: { apikey: facultyKey, Authorization: `Bearer ${facultyKey}`, 'Content-Type': file.type, 'x-upsert': 'false' },
      body: bytes,
    });
    if (!uploaded.ok) return json(502, { error: 'Faculty storage rejected the image upload.' });
    await auditMain(mainUrl, mainServiceKey, user.id, 'faculty_media', 'INSERT', path);
    return json(201, { data: { path, url: `${facultyUrl}/storage/v1/object/public/faculty-media/${path}` } });
  }
  if (request.method === 'DELETE') {
    const input = await request.json().catch(() => null);
    const path = input?.path;
    if (typeof path !== 'string' || !/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(path)) return json(400, { error: 'Invalid faculty image path.' });
    const removed = await fetch(`${storage}/object/faculty-media/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE', headers: { apikey: facultyKey, Authorization: `Bearer ${facultyKey}` },
    });
    if (!removed.ok) return json(502, { error: 'Could not delete the faculty image.' });
    await auditMain(mainUrl, mainServiceKey, user.id, 'faculty_media', 'DELETE', path);
    return json(200, { ok: true });
  }
  return json(405, { error: 'Method not allowed.' });
};

function hasImageSignature(type, bytes) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value);
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}

async function auditMain(url, key, actor, entity, operation, entityId) {
  await fetch(`${url}/rest/v1/admin_activity`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: actor, entity, operation, entity_id: entityId || null }),
  }).catch(() => {});
}
