import { crudSection } from './crudSection.js';
import { programsModel, facultyModel, announcementsModel, siteSettingsModel } from '../../models/contentModel.js';
import { validateProgram, validateFaculty, validateAnnouncement, PROGRAM_LEVELS } from '../../models/validators.js';
import { formatDate } from '../../views/dom.js';

export const programsSection = crudSection({
  title: 'Programs', singular: 'program', plural: 'programs', model: programsModel, validate: validateProgram,
  searchPlaceholder: 'Title or code', publishable: true, label: (r) => r.code,
  defaults: { level: 'Bachelor', display_order: 0, is_published: false },
  columns: [{ key: 'code', label: 'Code' }, { key: 'title', label: 'Title' }, { key: 'level', label: 'Level' }],
  fields: [
    { name: 'code', label: 'Code', required: true, maxlength: 12, help: 'Capital letters, numbers or hyphens, e.g. BSIT.' },
    { name: 'title', label: 'Title', required: true, maxlength: 150 },
    { name: 'level', label: 'Level', type: 'select', required: true, options: PROGRAM_LEVELS.map((l) => [l, l]) },
    { name: 'description', label: 'Description', type: 'textarea', rows: 6, maxlength: 5000 },
    { name: 'image_url', label: 'Image link', type: 'url', preview: true, help: 'Optional. A full https:// link to an image.' },
    { name: 'display_order', label: 'Display order', type: 'number', min: 0, help: 'Lower numbers appear first.' },
    { name: 'is_published', label: 'Published on the public Programs page', type: 'checkbox' },
  ],
});

export const facultySection = crudSection({
  title: 'Faculty', singular: 'faculty member', plural: 'faculty members', model: facultyModel, validate: validateFaculty,
  searchPlaceholder: 'Name, position or department', publishable: false, label: (r) => r.name,
  defaults: { display_order: 0 },
  columns: [{ key: 'name', label: 'Name' }, { key: 'position', label: 'Position' },
    { key: 'department', label: 'Department' }, { key: 'group_label', label: 'Group' }],
  fields: [
    { name: 'name', label: 'Name', required: true, maxlength: 120 },
    { name: 'position', label: 'Position', required: true, maxlength: 120 },
    { name: 'department', label: 'Department', required: true, maxlength: 120 },
    { name: 'group_label', label: 'Group heading', maxlength: 80, help: 'Rows with the same heading are listed together, e.g. Administration.' },
    { name: 'email', label: 'Email', type: 'email', maxlength: 120 },
    { name: 'bio', label: 'Profile description', type: 'textarea', maxlength: 2000 },
    { name: 'image_url', label: 'Image link', type: 'url', preview: true },
    { name: 'display_order', label: 'Display order', type: 'number', min: 0 },
  ],
});

export const announcementsSection = crudSection({
  title: 'Announcements', singular: 'announcement', plural: 'announcements', model: announcementsModel, validate: validateAnnouncement,
  searchPlaceholder: 'Title or text', publishable: true, label: (r) => r.title,
  defaults: { is_published: false },
  columns: [{ key: 'title', label: 'Title' },
    { label: 'Published', render: (r) => (r.published_at ? formatDate(r.published_at) : '—') },
    { label: 'Created', render: (r) => formatDate(r.created_at) }],
  fields: [
    { name: 'title', label: 'Title', required: true, maxlength: 150 },
    { name: 'content', label: 'Content', type: 'textarea', rows: 8, required: true, maxlength: 10000, help: 'Leave a blank line between paragraphs.' },
    { name: 'is_published', label: 'Published on the public Announcements page', type: 'checkbox', help: 'Leave unchecked to keep it as a private draft.' },
  ],
});

const SITE_SETTING_KEYS = [
  ['homepage_hero_title', 'Homepage hero title'],
  ['homepage_hero_tagline', 'Homepage hero tagline'],
  ['homepage_hero_image_url', 'Homepage banner image URL'],
  ['brand_logo_url', 'Campus logo image URL'],
  ['campus_motto', 'Campus motto'],
  ['campus_established', 'Established year'],
];
export const siteContentSection = crudSection({
  title: 'Homepage & identity', singular: 'site setting', plural: 'site settings', model: siteSettingsModel,
  validate: validateSiteSetting, searchPlaceholder: 'Setting key or value', publishable: true, label: (r) => r.key,
  defaults: { is_public: true },
  columns: [
    { label: 'Setting', render: (r) => SITE_SETTING_KEYS.find(([key]) => key === r.key)?.[1] || r.key },
    { key: 'value', label: 'Value', render: (r) => r.key.endsWith('_url') ? r.value : String(r.value).slice(0, 100) },
  ],
  fields: [
    { name: 'key', label: 'Setting', type: 'select', required: true, options: SITE_SETTING_KEYS },
    { name: 'value', label: 'Value', type: 'textarea', rows: 3, maxlength: 1000, required: true,
      help: 'Banner and logo values must be HTTPS image URLs. Image uploads can be added after storage is configured.' },
    { name: 'is_public', label: 'Visible on the public website', type: 'checkbox' },
  ],
});

function validateSiteSetting(input) {
  const errors = {};
  const key = String(input.key || '').trim();
  const value = String(input.value || '').trim();
  if (!SITE_SETTING_KEYS.some(([allowed]) => allowed === key)) errors.key = 'Choose a supported site setting.';
  if (!value) errors.value = 'Enter a value.';
  if (value.length > 1000) errors.value = 'Value must be 1000 characters or fewer.';
  if (key.endsWith('_url') && value && !/^https:\/\/[^\s]+$/i.test(value)) errors.value = 'Use a complete HTTPS image URL.';
  return { ok: !Object.keys(errors).length, errors, value: { key, value, is_public: input.is_public === true || input.is_public === 'on' } };
}
