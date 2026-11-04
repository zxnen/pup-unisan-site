import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePublicInquiry } from '../js/models/validators.js';
import inquiryHandler from '../netlify/functions/inquiries.mjs';

const visitorId = '74f7d975-7f30-4e1e-b2b8-d153e1476142';
const valid = { visitor_id: visitorId, full_name: 'Jamie Santos', email: 'jamie@example.edu', category: 'admissions', subject: 'Admissions inquiry', message: '' };

function withEnvironment(values, run) {
  const old = { ...process.env };
  Object.assign(process.env, values);
  return Promise.resolve().then(run).finally(() => {
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  });
}
function request(body, headers = {}) {
  return new Request('https://unisan.example/.netlify/functions/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
const configured = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only', SUPABASE_ANON_KEY: 'public-key', ABUSE_HASH_SECRET: 'test-hash-secret', TURNSTILE_SECRET_KEY: '' };

test('public inquiry validation requires a valid name and email; message is optional', () => {
  assert.equal(validatePublicInquiry(valid).ok, true);
  assert.match(validatePublicInquiry({ ...valid, full_name: '' }).errors.full_name, /required|at least 2 characters/);
  assert.equal(validatePublicInquiry({ ...valid, email: '' }).errors.email, 'Enter a valid email address.');
  assert.equal(validatePublicInquiry({ ...valid, email: 'person@bad..domain' }).ok, false);
});

test('public visitor submission reaches only the server RPC and stores no user id', async () => {
  await withEnvironment(configured, async () => {
    const originalFetch = globalThis.fetch;
    let rpcPayload;
    globalThis.fetch = async (url, options = {}) => {
      assert.match(String(url), /\/rpc\/submit_public_inquiry$/);
      assert.equal(options.headers.Authorization, 'Bearer server-only');
      rpcPayload = JSON.parse(options.body);
      return Response.json({ accepted: true, requires_review: false }, { status: 200 });
    };
    try {
      const response = await inquiryHandler(request(valid));
      assert.equal(response.status, 201);
      assert.equal(rpcPayload.p_user_id, null);
      assert.equal(rpcPayload.p_full_name, valid.full_name);
      assert.equal(rpcPayload.p_email, valid.email);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('admissions and students content allow public inquiry access without login messaging', () => {
  const admission = fs.readFileSync(new URL('../admission.html', import.meta.url), 'utf8');
  const students = fs.readFileSync(new URL('../students.html', import.meta.url), 'utf8');
  const controller = fs.readFileSync(new URL('../js/controllers/inquiryPageController.js', import.meta.url), 'utf8');
  assert.match(admission, /name="full_name"[^>]*required/);
  assert.match(admission, /name="email"[^>]*required/);
  assert.doesNotMatch(admission, /form[^>]*\bhidden\b/i);
  assert.match(students, /href="admission\.html"[^>]*>Send an inquiry/);
  assert.doesNotMatch(controller, /getCurrentUser|login\.html|approval_status/);
});

test('server rejects missing name, invalid email, and missing email before database access', async () => {
  await withEnvironment(configured, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('database must not be reached'); };
    try {
      for (const body of [{ ...valid, full_name: '' }, { ...valid, email: 'invalid' }, { ...valid, email: '' }]) {
        const response = await inquiryHandler(request(body));
        assert.equal(response.status, 400);
      }
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('Turnstile token is mandatory and verified server-side when enabled', async () => {
  await withEnvironment({ ...configured, TURNSTILE_SECRET_KEY: 'captcha-secret' }, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).includes('siteverify')) return Response.json({ success: false });
      return new Response(null, { status: 201 });
    };
    try {
      assert.equal((await inquiryHandler(request(valid))).status, 400);
      const response = await inquiryHandler(request({ ...valid, turnstile_token: 'invalid-token' }));
      assert.equal(response.status, 400);
      assert.equal(calls.filter((url) => url.includes('siteverify')).length, 1);
      assert.ok(calls.some((url) => url.endsWith('/security_events')));
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('valid Turnstile token passes server verification before database submission', async () => {
  await withEnvironment({ ...configured, TURNSTILE_SECRET_KEY: 'captcha-secret' }, async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes('siteverify')) return Response.json({ success: true, action: 'inquiry', hostname: 'unisan.example' });
      return Response.json({ accepted: true, requires_review: false });
    };
    try {
      const response = await inquiryHandler(request({ ...valid, turnstile_token: 'valid-token' }));
      assert.equal(response.status, 201);
      assert.match(calls[0], /siteverify/);
      assert.match(calls[1], /submit_public_inquiry/);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('signed-in pending users may submit and identity comes from verified account data', async () => {
  await withEnvironment(configured, async () => {
    const originalFetch = globalThis.fetch;
    let rpcPayload;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'fa7a4cb2-f88e-4ea0-8bee-f89826c0b91a', email: 'account@example.edu', user_metadata: { full_name: 'Account Holder' } });
      if (String(url).includes('/rest/v1/profiles')) return Response.json([{ full_name: 'Account Holder' }]);
      rpcPayload = JSON.parse(options.body);
      return Response.json({ accepted: true, requires_review: false });
    };
    try {
      const response = await inquiryHandler(request({ ...valid, full_name: 'Spoofed Name', email: 'spoof@example.net' }, { Authorization: 'Bearer account-token' }));
      assert.equal(response.status, 201);
      assert.equal(rpcPayload.p_user_id, 'fa7a4cb2-f88e-4ea0-8bee-f89826c0b91a');
      assert.equal(rpcPayload.p_full_name, 'Account Holder');
      assert.equal(rpcPayload.p_email, 'account@example.edu');
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('database rate limits are surfaced and public RLS has no direct insert/read/delete path', async () => {
  await withEnvironment(configured, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ accepted: false, reason: 'rate_limited' });
    try { assert.equal((await inquiryHandler(request(valid))).status, 429); }
    finally { globalThis.fetch = originalFetch; }
  });
  const migration = fs.readFileSync(new URL('../supabase/main/migrations/006_public_inquiries.sql', import.meta.url), 'utf8');
  assert.match(migration, /revoke insert on public\.inquiries from anon, authenticated/i);
  assert.match(migration, /revoke all on public\.inquiries from anon/i);
  assert.match(migration, /grant execute on function public\.submit_public_inquiry[\s\S]*to service_role/i);
  assert.match(migration, /drop policy if exists "approved students create own inquiry"/i);
  const originalRls = fs.readFileSync(new URL('../supabase/main/migrations/002_rls.sql', import.meta.url), 'utf8');
  assert.match(originalRls, /inquiries owner or admin read/);
  assert.match(originalRls, /using \(user_id=auth\.uid\(\) or public\.is_admin\(\)\)/i);
});

test('administrator inquiry workflow displays public contact details and clears review on save', () => {
  const section = fs.readFileSync(new URL('../js/controllers/dashboard/inquiriesSection.js', import.meta.url), 'utf8');
  const model = fs.readFileSync(new URL('../js/models/inquiryModel.js', import.meta.url), 'utf8');
  assert.match(section, /r\.full_name/);
  assert.match(section, /r\.email/);
  assert.match(section, /r\.requires_review/);
  assert.match(model, /requires_review: false/);
});
