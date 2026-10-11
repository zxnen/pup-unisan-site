import { supabase } from '../supabaseClient.js';
import { unwrap } from './errors.js';
import { sanitizeSearch } from './validators.js';

// Generic repository for programs / faculty / announcements. Public reads rely on RLS
// (anonymous visitors only ever receive published programs/announcements); the explicit
// is_published filter is for clarity and so admins viewing the public page see what visitors see.
function repository(table, { order, searchCols, published }) {
  return {
    async listPublic() {
      let q = supabase.from(table).select('*');
      if (published) q = q.eq('is_published', true);
      for (const o of order) q = q.order(o.col, { ascending: o.asc });
      return unwrap(await q, `Could not load ${table}.`);
    },
    async listAdmin({ search = '', page = 0, pageSize = 10 } = {}) {
      let q = supabase.from(table).select('*', { count: 'exact' });
      const s = sanitizeSearch(search);
      if (s) q = q.or(searchCols.map((c) => `${c}.ilike.%${s}%`).join(','));
      for (const o of order) q = q.order(o.col, { ascending: o.asc });
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await q;
      unwrap({ data, error }, `Could not load ${table}.`);
      return { rows: data, total: count ?? 0 };
    },
    async create(values) {
      return unwrap(await supabase.from(table).insert(values).select().single(), 'Could not create the record.');
    },
    async update(id, values) {
      return unwrap(await supabase.from(table).update(values).eq('id', id).select().single(), 'Could not save the record.');
    },
    async remove(id) {
      const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);
      unwrap({ data: true, error }, 'Could not delete the record.');
      if (!count) throw new Error('Nothing was deleted. You may not have permission.');
    },
    async count() {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      unwrap({ data: true, error }, 'Could not load counts.');
      return count ?? 0;
    },
    async countPublished() {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('is_published', true);
      unwrap({ data: true, error }, 'Could not load counts.');
      return count ?? 0;
    },
  };
}

export const programsModel = repository('programs', {
  order: [{ col: 'display_order', asc: true }, { col: 'title', asc: true }],
  searchCols: ['title', 'code'], published: true,
});
export const announcementsModel = repository('announcements', {
  order: [{ col: 'published_at', asc: false }, { col: 'created_at', asc: false }],
  searchCols: ['title', 'content'], published: true,
});
export const facultyModel = repository('faculty', {
  order: [{ col: 'display_order', asc: true }, { col: 'name', asc: true }],
  searchCols: ['name', 'position', 'department'], published: false,
});

// Used only when no program is published yet, so the admissions/profile dropdowns still
// offer the original eight programs from the supplied admission.html.
export const LEGACY_PROGRAM_OPTIONS = [
  ['BEED', 'BEED - Bachelor of Elementary Education'],
  ['BSIT', 'BSIT - Bachelor of Science in Information Technology'],
  ['BPA', 'BPA - Bachelor of Public Administration'],
  ['BSENT', 'BSENT - Bachelor of Science in Entrepreneurship'],
  ['DIT', 'DIT - Diploma in Information Technology'],
  ['DOMT', 'DOMT - Diploma in Office Management Technology'],
  ['MEM', 'MEM - Master in Educational Management'],
  ['MPA', 'MPA - Master in Public Administration'],
];

export async function programOptions() {
  try {
    const rows = await programsModel.listPublic();
    if (rows.length) return rows.map((p) => [p.code, `${p.code} - ${p.title}`]);
  } catch { /* fall through to the original list */ }
  return LEGACY_PROGRAM_OPTIONS;
}
