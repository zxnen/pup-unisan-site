import { supabase } from '../supabaseClient.js';
import { unwrap } from './errors.js';
import { sanitizeSearch } from './validators.js';

// user_id is intentionally NOT sent: the database fills it from the authenticated session,
// and RLS rejects the insert unless the caller is an approved student.
export async function createInquiry(v) {
  const { category, subject, message, phone, program_of_interest, preferred_contact } = v;
  return unwrap(
    await supabase.from('inquiries')
      .insert({ category, subject, message, phone, program_of_interest, preferred_contact })
      .select().single(),
    'Your inquiry could not be sent.');
}

export async function listMyInquiries({ page = 0, pageSize = 10 } = {}) {
  const { data, error, count } = await supabase.from('inquiries')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  unwrap({ data, error }, 'Could not load your inquiries.');
  return { rows: data, total: count ?? 0 };
}

export async function listAllInquiries({ search = '', status = '', category = '', page = 0, pageSize = 10 } = {}) {
  let q = supabase.from('inquiries')
    .select('*, profiles!inquiries_user_id_fkey(full_name, email, student_number)', { count: 'exact' });
  if (status) q = q.eq('status', status);
  if (category) q = q.eq('category', category);
  const s = sanitizeSearch(search);
  if (s) q = q.or(`subject.ilike.%${s}%,message.ilike.%${s}%`);
  q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await q;
  unwrap({ data, error }, 'Could not load inquiries.');
  return { rows: data, total: count ?? 0 };
}

export async function updateInquiry(id, { status, admin_response }) {
  return unwrap(
    await supabase.from('inquiries').update({ status, admin_response }).eq('id', id).select().single(),
    'Could not save the inquiry.');
}

export async function deleteInquiry(id) {
  const { error, count } = await supabase.from('inquiries').delete({ count: 'exact' }).eq('id', id);
  unwrap({ data: true, error }, 'Could not delete the inquiry.');
  if (!count) throw new Error('Nothing was deleted. You may not have permission.');
}

export async function countByStatus() {
  const out = {};
  for (const s of ['open', 'in_progress', 'resolved', 'closed']) {
    const { count, error } = await supabase.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', s);
    unwrap({ data: true, error }, 'Could not load counts.');
    out[s] = count ?? 0;
  }
  return out;
}
