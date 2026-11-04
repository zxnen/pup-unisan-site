import { FACULTY_SUPABASE_URL, FACULTY_SUPABASE_PUBLISHABLE_KEY } from './config.js';

const configured = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(FACULTY_SUPABASE_URL)
  && FACULTY_SUPABASE_PUBLISHABLE_KEY.length > 20
  && !FACULTY_SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')
  && !isPrivilegedKey(FACULTY_SUPABASE_PUBLISHABLE_KEY);

export const facultySupabase = configured && window.supabase
  ? window.supabase.createClient(FACULTY_SUPABASE_URL, FACULTY_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

export function facultyConfigurationMessage() {
  return 'Faculty directory configuration is pending. Set FACULTY_SUPABASE_URL and FACULTY_SUPABASE_PUBLISHABLE_KEY to the independent faculty project.';
}

function isPrivilegedKey(value) {
  if (/^sb_secret_/i.test(value)) return true;
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized)).role === 'service_role';
  } catch { return false; }
}
