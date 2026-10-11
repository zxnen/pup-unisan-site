import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const isConfigured =
  typeof SUPABASE_URL === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
  typeof SUPABASE_PUBLISHABLE_KEY === 'string' && SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_') && !SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_');

// supabase-js is loaded as a pinned UMD script tag in each page (exposes window.supabase).
export const supabase = (isConfigured && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export const backendProblem = !window.supabase && isConfigured
  ? 'The Supabase library could not be loaded. Check your network connection and try again.'
  : (!isConfigured ? 'This site is not connected to Supabase yet. Set the project URL and publishable key in js/config.js.' : null);
