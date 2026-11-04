# PUP Unisan faculty history recovery report

## Finding

The available Git history does not contain a complete original faculty directory, profile records, or faculty portrait files. The oldest and last commit containing the original faculty directory implementation is:

- `b5fea3cf343221d77640e38ca5b0404644951dfa` — `PUP Unisan site`
- Original directory page: `faculty.html`
- Directory controller: `js/controllers/facultyController.js`
- Generic faculty data model: `js/models/contentModel.js`
- Generic faculty validation: `js/models/validators.js`

The original `faculty.html` contains a loading placeholder and requests records at runtime. It does not embed faculty names, positions, departments, biographies, qualifications, emails, or photos. Its controller reads from `facultyModel.listPublic()` and renders the returned database rows. No faculty profile page existed in that commit.

The original `README.md` at that commit says migration `003_seed_content.sql` migrates “5 faculty (from `faculty.html`)”. That SQL file is not present in the commit tree or in any other reachable commit, and the referenced `faculty.html` has no five records in its source. Therefore the note is not enough to reconstruct those records.

## History search performed

- `git log --all` for `faculty.html`, `faculty-profile.html`, and faculty-related assets/data.
- `git log --all --diff-filter=D --name-status` for deleted files.
- `git log --all --name-status` for every path added or changed.
- `git show b5fea3cf343221d77640e38ca5b0404644951dfa:<path>` for the original faculty page, controller, and model.
- `git ls-tree -r` on that commit for faculty, JSON, CSV, and image paths.
- `git fsck --full --no-reflogs --unreachable`; its only reported dangling object is a copy of the current faculty schema migration, not faculty data.

Relevant timeline:

- `b5fea3cf343221d77640e38ca5b0404644951dfa` is the only commit with the original faculty directory and controller.
- `8d2ac1e422d9a3b67875e090015d39bd601f0c3d` adds the current generic `faculty-profile.html`, `js/controllers/facultyProfileController.js`, and faculty backend/schema files. The profile page reads a database record by ID; it does not add historical faculty records.
- No history entry deletes a faculty data file or portrait asset.

## Portraits and other images

The original commit has no portrait or image assets. The only currently tracked image assets are:

- `assets/PUP Unisan Campus UI Showcase.png`
- `assets/pup-official-seal.png`
- `assets/pup-unisan-campus-2013.jpg`

Their names and attribution identify them as campus/site artwork, not individual faculty portraits. They are not treated as faculty photos.

## Current schema compatibility

The current faculty schema is defined in `supabase/faculty/migrations/001_faculty.sql`. It supports `name`, `position`, `department`, `group_label`, `email`, `bio`, `image_url`, `qualifications`, `professional_info`, and `display_order` (plus generated identifiers and timestamps). There are no source values in repository history to populate these fields. A non-executable, schema-matched SQL template is at `supabase/faculty/recovery/proposed_seed.sql`.

No database was accessed or modified, and no SQL was executed.
