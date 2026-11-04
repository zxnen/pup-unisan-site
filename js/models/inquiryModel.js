import { supabase } from '../supabaseClient.js';
import { unwrap } from './errors.js';
import { sanitizeSearch } from './validators.js';

const VISITOR_KEY = 'pup-unisan-visitor-id-v1';

export async function createInquiry(v) {
  let session = null;
  try { session = supabase ? (await supabase.auth.getSession()).data?.session || null : null; } catch { /* Public inquiry submission remains available without a session. */ }
  const response = await fetch('/.netlify/functions/inquiries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ ...v, visitor_id: getVisitorId() }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Your inquiry could not be sent.');
  return result;
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
  if (s) q = q.or(`subject.ilike.%${s}%,message.ilike.%${s}%,full_name.ilike.%${s}%,email.ilike.%${s}%`);
  q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await q;
  unwrap({ data, error }, 'Could not load inquiries.');
  return { rows: data, total: count ?? 0 };
}

export async function updateInquiry(id, { status, admin_response }) {
  return unwrap(
    await supabase.from('inquiries').update({ status, admin_response, requires_review: false }).eq('id', id).select().single(),
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

function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
      id = crypto.randomUUID(); localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch { return crypto.randomUUID(); }
}
