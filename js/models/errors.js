// Convert Supabase/Postgres errors into short, safe, user-facing messages.
// Raw error details go to the console only (never into the page, to avoid leaking internals).
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  console.error('[supabase]', error.code || '', error.message || error);
  const msg = String(error.message || '');
  if (error.code === '23505') {
    if (/student_number/.test(msg)) return 'That student number is already registered to another account.';
    if (/faculty_email/.test(msg)) return 'A faculty record with that email already exists.';
    if (/programs_(code|slug)/.test(msg)) return 'A program with that code already exists.';
    return 'A record with that value already exists.';
  }
  if (error.code === '23514') return 'One of the values is not allowed. Please check the form and try again.';
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied/i.test(msg))
    return 'You do not have permission to do that.';
  if (error.code === 'PGRST116') return 'That record could not be found.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return fallback;
}

export class AppError extends Error {
  constructor(message, cause) { super(message); this.name = 'AppError'; this.cause = cause; }
}

export function unwrap({ data, error }, fallback) {
  if (error) throw new AppError(friendlyError(error, fallback), error);
  return data;
}
