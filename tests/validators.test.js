import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFaculty, validateAnnouncement, validateProgram, validatePassword, sanitizeSearch } from '../js/models/validators.js';

test('registration password rules require length, letters and digits', () => {
  assert.equal(validatePassword('short'), 'Password must be at least 8 characters.');
  assert.match(validatePassword('allletters'), /letter and one number/);
  assert.equal(validatePassword('unisan2026'), null);
});

test('faculty form accepts safe optional profile data and rejects malformed email', () => {
  const valid = validateFaculty({ name:'Maria Santos', position:'Instructor', department:'Education', email:'maria@example.edu', image_url:'https://example.edu/photo.jpg', display_order:'1' });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.display_order, 1);
  const invalid = validateFaculty({ name:'M', position:'Instructor', department:'Education', email:'not-an-email' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.email);
});

test('program and announcement content stay within validation rules', () => {
  assert.equal(validateProgram({ code:'BSIT', title:'Information Technology', level:'Bachelor', is_published:true }).ok, true);
  assert.equal(validateProgram({ code:'bad code', title:'X', level:'Other' }).ok, false);
  assert.equal(validateAnnouncement({ title:'Campus Forum', content:'Welcome to the forum.', is_published:false }).ok, true);
  assert.equal(validateAnnouncement({ title:'', content:'' }).ok, false);
});

test('search sanitization removes PostgREST filter operators', () => {
  assert.equal(sanitizeSearch('Maria,(admin)%'), 'Maria admin');
});
