// Pure validation helpers (no DOM, no network) so they can be unit-tested in Node.
// Client-side validation is for usability only; the same rules are enforced by
// CHECK constraints and RLS in supabase/migrations.

export const YEARS = [1, 2, 3, 4, 5];
export const INQUIRY_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const INQUIRY_CATEGORIES = ['admissions', 'general'];
export const PROGRAM_LEVELS = ['Bachelor', 'Diploma', 'Master'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() -]{7,20}$/;
const STUNO_RE = /^[A-Za-z0-9-]{4,20}$/;
const CODE_RE = /^[A-Z0-9-]{2,12}$/;
const URL_RE = /^https?:\/\/\S+$/i;

export const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const finish = (errors, value) => ({ ok: Object.keys(errors).length === 0, errors, value });
const len = (s, min, max, label, errors, key) => {
  if (s.length < min) errors[key] = min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  else if (s.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
};

export function validateEmail(email) { return EMAIL_RE.test(clean(email)); }

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include at least one letter and one number.';
  return null;
}

export function validateLogin({ email, password }) {
  const errors = {};
  if (!validateEmail(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return finish(errors, { email: clean(email), password });
}

export function validateRegistration({ fullName, email, password, confirm }) {
  const errors = {};
  const name = clean(fullName);
  len(name, 2, 120, 'Full name', errors, 'fullName');
  if (!validateEmail(email)) errors.email = 'Enter a valid email address.';
  const pwErr = validatePassword(password);
  if (pwErr) errors.password = pwErr;
  else if (password !== confirm) errors.confirm = 'Passwords do not match.';
  return finish(errors, { fullName: name, email: clean(email), password });
}

export function validateProfile(input) {
  const errors = {};
  const v = {};
  v.full_name = clean(input.full_name) || null;
  if (v.full_name) len(v.full_name, 2, 120, 'Full name', errors, 'full_name');

  v.student_number = clean(input.student_number) || null;
  if (v.student_number && !STUNO_RE.test(v.student_number))
    errors.student_number = 'Use 4–20 letters, numbers or hyphens.';

  v.program = clean(input.program) || null;
  if (v.program && !CODE_RE.test(v.program)) errors.program = 'Choose a program from the list.';

  const yr = clean(String(input.year ?? ''));
  v.year = yr === '' ? null : Number(yr);
  if (v.year !== null && !YEARS.includes(v.year)) errors.year = 'Choose a year level from 1 to 5.';

  v.phone = clean(input.phone) || null;
  if (v.phone && !PHONE_RE.test(v.phone)) errors.phone = 'Use 7–20 digits; + ( ) and - are allowed.';

  v.address = clean(input.address) || null;
  if (v.address && v.address.length > 255) errors.address = 'Address must be 255 characters or fewer.';

  v.birthdate = clean(input.birthdate) || null;
  if (v.birthdate) {
    const d = new Date(v.birthdate + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.birthdate) || Number.isNaN(d.getTime()) ||
        d.toISOString().slice(0, 10) !== v.birthdate) errors.birthdate = 'Enter a valid date.';
    else if (d >= new Date() || d < new Date('1900-01-02T00:00:00Z')) errors.birthdate = 'Birthdate must be in the past.';
  }
  return finish(errors, v);
}

export function validateInquiry(input) {
  const errors = {};
  const category = clean(input.category) || 'general';
  if (!INQUIRY_CATEGORIES.includes(category)) errors.category = 'Choose a valid category.';
  let subject = clean(input.subject);
  if (!subject && category === 'admissions') subject = 'Admissions inquiry';
  len(subject, 3, 120, 'Subject', errors, 'subject');
  const message = clean(input.message);
  len(message, 10, 2000, 'Message', errors, 'message');
  const phone = clean(input.phone) || null;
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Use 7–20 digits; + ( ) and - are allowed.';
  const program = clean(input.program_of_interest) || null;
  if (program && !CODE_RE.test(program)) errors.program_of_interest = 'Choose a program from the list.';
  const pref = clean(input.preferred_contact) || null;
  if (pref && !['email', 'phone'].includes(pref)) errors.preferred_contact = 'Choose email or phone.';
  if (pref === 'phone' && !phone) errors.phone = 'Add a phone number if you prefer to be contacted by phone.';
  return finish(errors, { category, subject, message, phone, program_of_interest: program, preferred_contact: pref });
}

export function validateInquiryUpdate(input) {
  const errors = {};
  const status = clean(input.status);
  if (!INQUIRY_STATUSES.includes(status)) errors.status = 'Choose a valid status.';
  const resp = clean(input.admin_response) || null;
  if (resp && resp.length > 2000) errors.admin_response = 'Response must be 2000 characters or fewer.';
  return finish(errors, { status, admin_response: resp });
}

export function slugify(s) {
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

const optUrl = (raw, errors, key) => {
  const u = clean(raw) || null;
  if (u && !URL_RE.test(u)) errors[key] = 'Enter a full http(s) link, or leave blank.';
  return u;
};
const optInt = (raw, errors, key, label) => {
  const s = clean(String(raw ?? ''));
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 100000) { errors[key] = `${label} must be a whole number of 0 or more.`; return 0; }
  return n;
};

export function validateProgram(input) {
  const errors = {};
  const code = clean(input.code).toUpperCase();
  if (!CODE_RE.test(code)) errors.code = 'Use 2–12 capital letters, numbers or hyphens (e.g. BSIT).';
  const title = clean(input.title);
  len(title, 3, 150, 'Title', errors, 'title');
  const level = clean(input.level);
  if (!PROGRAM_LEVELS.includes(level)) errors.level = 'Choose Bachelor, Diploma or Master.';
  const description = clean(input.description) || null;
  if (description && description.length > 5000) errors.description = 'Description must be 5000 characters or fewer.';
  const image_url = optUrl(input.image_url, errors, 'image_url');
  const display_order = optInt(input.display_order, errors, 'display_order', 'Display order');
  const is_published = input.is_published === true || input.is_published === 'on';
  return finish(errors, { code, slug: code.toLowerCase(), title, level, description, image_url, display_order, is_published });
}

export function validateFaculty(input) {
  const errors = {};
  const name = clean(input.name); len(name, 2, 120, 'Name', errors, 'name');
  const position = clean(input.position); len(position, 2, 120, 'Position', errors, 'position');
  const department = clean(input.department); len(department, 2, 120, 'Department', errors, 'department');
  const group_label = clean(input.group_label) || null;
  if (group_label && group_label.length > 80) errors.group_label = 'Group must be 80 characters or fewer.';
  const email = clean(input.email) || null;
  if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address, or leave blank.';
  const bio = clean(input.bio) || null;
  if (bio && bio.length > 2000) errors.bio = 'Bio must be 2000 characters or fewer.';
  const image_url = optUrl(input.image_url, errors, 'image_url');
  const display_order = optInt(input.display_order, errors, 'display_order', 'Display order');
  return finish(errors, { name, position, department, group_label, email, bio, image_url, display_order });
}

export function validateAnnouncement(input) {
  const errors = {};
  const title = clean(input.title); len(title, 3, 150, 'Title', errors, 'title');
  const content = clean(input.content); len(content, 1, 10000, 'Content', errors, 'content');
  const is_published = input.is_published === true || input.is_published === 'on';
  return finish(errors, { title, content, is_published });
}

// PostgREST .or()/ilike filters treat , ( ) * % \ specially. Strip them from user search text.
export function sanitizeSearch(raw) {
  return clean(raw).replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
}
