import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const facultyUrl = process.env.FACULTY_SUPABASE_URL || '';
const facultyKey = process.env.FACULTY_SUPABASE_PUBLISHABLE_KEY || '';
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '';

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY");
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) || isPrivilegedKey(key)) {
  console.error('Invalid Supabase configuration. Use a project URL and a publishable/anon key; privileged keys are rejected.');
  process.exit(1);
}
if ((facultyUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(facultyUrl)) || (facultyKey && isPrivilegedKey(facultyKey))) {
  console.error('Invalid faculty Supabase configuration. Use a separate project URL and publishable/anon key.');
  process.exit(1);
}

mkdirSync("js", { recursive: true });
writeFileSync(
  "js/config.js",
  `export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};
export const FACULTY_SUPABASE_URL = ${JSON.stringify(facultyUrl)};
export const FACULTY_SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(facultyKey)};
export const TURNSTILE_SITE_KEY = ${JSON.stringify(turnstileSiteKey)};
`
);
console.log("Wrote js/config.js");

function isPrivilegedKey(value) {
  if (/^sb_secret_/i.test(value)) return true;
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')).role === 'service_role';
  } catch { return false; }
}
