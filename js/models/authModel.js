import { supabase } from '../supabaseClient.js';
import { AppError, unwrap, friendlyError } from './errors.js';

const redirectBase = () => new URL('login.html', window.location.href).href;

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AppError(friendlyError(error), error);
  return data.session;
}

export async function signUp({ fullName, email, password }) {
  // Only name is sent as metadata. Role and approval status are assigned by the database
  // (student / pending) and can never be supplied by the browser.
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: redirectBase() },
  });
  if (error) throw new AppError(authMessage(error), error);
  // With email confirmation enabled Supabase returns a user but no session.
  // An obfuscated duplicate (existing email) returns a user with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
    throw new AppError('An account with that email already exists. Try logging in instead.');
  return { session: data.session, needsEmailConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AppError(authMessage(error), error);
  return data.session;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectBase() },
  });
  if (error) throw new AppError(authMessage(error), error);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new AppError(friendlyError(error), error);
}

function authMessage(error) {
  const m = String(error.message || '');
  if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if (/already registered|already exists/i.test(m)) return 'An account with that email already exists. Try logging in instead.';
  if (/password/i.test(m) && /(weak|short|least)/i.test(m)) return 'That password is too weak. Use at least 8 characters with a letter and a number.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a moment and try again.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in is not enabled for this project yet.';
  return friendlyError(error, 'Could not complete that request. Please try again.');
}

// Reads role/status from the profiles table (trusted, RLS-protected), NOT from JWT metadata.
export async function fetchProfile(uid) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle(), 'Could not load your profile.');
}

// Controlled recovery path: creates a pending student profile only if none exists.
export async function ensureProfile() {
  return unwrap(await supabase.rpc('ensure_profile'), 'Could not set up your profile.');
}

export async function loadCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  let profile = await fetchProfile(session.user.id);
  if (!profile) profile = await ensureProfile();
  return { session, user: session.user, profile };
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((event, session) => cb(event, session));
}
