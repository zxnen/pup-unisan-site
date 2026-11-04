import { createHmac } from 'node:crypto';

const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const env = process.env;
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: dbKey, TURNSTILE_SECRET_KEY: captchaSecret, ABUSE_HASH_SECRET: hashSecret } = env;
  if (!url || !dbKey || !captchaSecret || !hashSecret) return json(503, { error: 'Comment submissions are not configured yet.' });
  let input;
  try { input = await request.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  const display_name = typeof input?.display_name === 'string' ? input.display_name.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  const visitor_id = input?.visitor_id;
  const token = typeof input?.turnstile_token === 'string' ? input.turnstile_token : '';
  if (!visitorPattern.test(visitor_id || '') || display_name.length < 1 || display_name.length > 80 || body.length < 3 || body.length > 1500 || !token)
    return json(400, { error: 'Complete the form and CAPTCHA, then try again.' });

  const remoteIp = request.headers.get('x-nf-client-connection-ip') || '';
  const ipHash = remoteIp ? createHmac('sha256', hashSecret).update(remoteIp).digest('hex') : null;
  const captchaBody = new URLSearchParams({ secret: captchaSecret, response: token });
  if (remoteIp) captchaBody.set('remoteip', remoteIp);
  const verified = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: captchaBody });
  const result = verified.ok ? await verified.json() : null;
  const siteHostname = new URL(request.url).hostname;
  if (!result?.success || result.action !== 'comment' || result.hostname !== siteHostname) {
    await fetch(`${url}/rest/v1/security_events`, {
      method: 'POST', headers: { apikey: dbKey, Authorization: `Bearer ${dbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ visitor_id, ip_hash: ipHash, event_type: 'captcha_failed' }),
    }).catch(() => {});
    return json(400, { error: 'CAPTCHA verification failed. Please try again.' });
  }

  const submitted = await fetch(`${url}/rest/v1/rpc/submit_public_comment`, {
    method: 'POST',
    headers: { apikey: dbKey, Authorization: `Bearer ${dbKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_visitor_id: visitor_id, p_ip_hash: ipHash, p_display_name: display_name, p_body: body }),
  });
  if (!submitted.ok) return json(503, { error: 'The comment could not be submitted. Please try again later.' });
  const status = await submitted.json();
  if (!status.accepted) {
    if (status.reason === 'banned') return json(403, { error: 'Submissions are currently unavailable for this visitor.' });
    return json(429, { error: 'You have reached the submission limit. Please wait before trying again.' });
  }
  return json(201, { message: status.held_for_review ? 'Your comment was sent for administrator review.' : 'Your comment was posted.' });
};

function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
