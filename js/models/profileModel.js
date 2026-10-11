import { supabase } from '../supabaseClient.js';
import { unwrap } from './errors.js';
import { sanitizeSearch } from './validators.js';

// Self-service update. Only whitelisted columns are sent; RLS + column grants + a trigger
// also reject anything else.
export async function updateOwnProfile(uid, values) {
  const { full_name, student_number, program, year, phone, address, birthdate } = values;
  return unwrap(
    await supabase.from('profiles')
      .update({ full_name, student_number, program, year, phone, address, birthdate })
      .eq('id', uid).select().single(),
    'Could not save your profile.');
}

// ---- Administrator operations (RLS limits these to admins regardless of what the UI shows) ----
export async function listStudents({ search = '', status = '', page = 0, pageSize = 10 } = {}) {
  let q = supabase.from('profiles').select('*', { count: 'exact' }).eq('role', 'student');
  if (status) q = q.eq('approval_status', status);
  const s = sanitizeSearch(search);
  if (s) q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,student_number.ilike.%${s}%`);
  q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await q;
  unwrap({ data, error }, 'Could not load students.');
  return { rows: data, total: count ?? 0 };
}

export async function reviewStudent(id, status) {
  return unwrap(await supabase.rpc('review_student', { target: id, new_status: status }), 'Could not update the account status.');
}

export async function adminUpdateStudent(id, values) {
  const { full_name, student_number, program, year, phone, address, birthdate } = values;
  return unwrap(
    await supabase.from('profiles')
      .update({ full_name, student_number, program, year, phone, address, birthdate })
      .eq('id', id).select().single(),
    'Could not save the student record.');
}

export async function countByStatus() {
  const out = {};
  for (const s of ['pending', 'approved', 'rejected']) {
    const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'student').eq('approval_status', s);
    unwrap({ data: true, error }, 'Could not load counts.');
    out[s] = count ?? 0;
  }
  return out;
}
