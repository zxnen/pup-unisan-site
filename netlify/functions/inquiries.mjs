import { createHmac } from 'node:crypto';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i;

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const env = process.env;
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const hashSecret = env.ABUSE_HASH_SECRET;
  const captchaSecret = env.TURNSTILE_SECRET_KEY;
  if (!url || !serviceKey || !publicKey || !hashSecret) return json(503, { error: 'Inquiry submissions are not configured on the server.' });

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return json(413, { error: 'The inquiry is too large.' });
    input = JSON.parse(raw);
  } catch { return json(400, { error: 'Invalid request.' }); }

  const visitorId = input?.visitor_id;
  const fullName = typeof input?.full_name === 'string' ? input.full_name.trim().replace(/\s+/g, ' ') : '';
  let email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  let userId = null;
  let accountName = '';
  let accountEmail = '';
  const category = input?.category;
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  const message = typeof input?.message === 'string' ? input.message.trim() : '';
  const token = typeof input?.turnstile_token === 'string' ? input.turnstile_token : '';

  if (!uuidPattern.test(visitorId || '') || !['admissions', 'general'].includes(category) ||
      subject.length < 3 || subject.length > 120 || message.length > 2000) {
    return json(400, { error: 'Enter a valid name, email address, and inquiry.' });
  }
  if (input?.website) return json(201, { message: 'Your inquiry has been received.' });

  const bearer = request.headers.get('authorization') || '';
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (bearer && !accessToken) return json(401, { error: 'Your session is invalid or expired.' });
  if (accessToken) {
    const verified = await fetch(`${url}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` } });
    if (!verified.ok) return json(401, { error: 'Your session is invalid or expired.' });
    const user = await verified.json();
    userId = user.id;
    const profiles = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=full_name`, { headers: restHeaders(serviceKey) });
    const rows = profiles.ok ? await profiles.json() : [];
    accountName = fullNameFromProfile(rows, user);
    accountEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  }

  const resolvedName = accessToken ? accountName : fullName;
  const resolvedEmail = accessToken ? accountEmail : email;
  const localPart = resolvedEmail.split('@')[0] || '';
  if (resolvedName.length < 2 || resolvedName.length > 120 || !emailPattern.test(resolvedEmail) || resolvedEmail.length > 254 || localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return json(400, { error: 'Enter a valid name and email address.' });
  }

  const remoteIp = request.headers.get('x-nf-client-connection-ip') || '';
  const ipHash = remoteIp ? createHmac('sha256', hashSecret).update(remoteIp).digest('hex') : null;
  if (!accessToken && captchaSecret) {
    if (!token) {
      await logEvent(url, serviceKey, visitorId, ipHash, 'inquiry_captcha_failed');
      return json(400, { error: 'Complete the spam protection check, then try again.' });
    }
    try {
      const captchaBody = new URLSearchParams({ secret: captchaSecret, response: token });
      if (remoteIp) captchaBody.set('remoteip', remoteIp);
      const verified = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: captchaBody });
      const result = verified.ok ? await verified.json() : null;
      if (!result?.success || result.action !== 'inquiry' || result.hostname !== new URL(request.url).hostname) {
        await logEvent(url, serviceKey, visitorId, ipHash, 'inquiry_captcha_failed');
        return json(400, { error: 'CAPTCHA verification failed. Please try again.' });
      }
    } catch {
      return json(503, { error: 'Spam protection is temporarily unavailable. Please try again later.' });
    }
  }

  let submitted;
  try {
    submitted = await fetch(`${url}/rest/v1/rpc/submit_public_inquiry`, {
      method: 'POST',
      headers: restHeaders(serviceKey),
      body: JSON.stringify({
        p_user_id: userId,
        p_visitor_id: visitorId,
        p_ip_hash: ipHash,
        p_full_name: resolvedName,
        p_email: resolvedEmail,
        p_category: category,
        p_subject: subject,
        p_message: message,
      }),
    });
  } catch {
    return json(503, { error: 'The inquiry could not be sent. Please try again later.' });
  }
  if (!submitted.ok) {
    console.error('Public inquiry transaction failed:', submitted.status);
    return json(503, { error: 'The inquiry could not be sent. Please try again later.' });
  }
  const result = await submitted.json();
  if (!result.accepted) {
    if (result.reason === 'banned') return json(403, { error: 'Submissions are temporarily unavailable for this visitor.' });
    return json(429, { error: 'You have reached the inquiry limit. Please wait before trying again.' });
  }
  return json(201, { message: 'Your inquiry has been received.', requires_review: result.requires_review });
};

function fullNameFromProfile(rows, user) {
  const name = typeof rows?.[0]?.full_name === 'string' ? rows[0].full_name.trim() : '';
  const metadataName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  return name || metadataName;
}
function restHeaders(key) { return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }; }
async function logEvent(url, key, visitorId, ipHash, eventType) {
  await fetch(`${url}/rest/v1/security_events`, {
    method: 'POST', headers: { ...restHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ visitor_id: visitorId, ip_hash: ipHash, event_type: eventType }),
  }).catch(() => {});
}
function json(statusCode, body) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
