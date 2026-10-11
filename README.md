# PUP Unisan Campus Website and Student Portal

Plain HTML, CSS and vanilla JavaScript (ES modules) on **Supabase** (Auth, Postgres, RLS), hosted on **Netlify**. No framework, no build step beyond a tiny config-generation script.

> **Status:** code, SQL and docs are written and statically tested. It has **not** been run against a live Supabase project or in a browser, and **nothing has been deployed**. See `docs/ACCEPTANCE_TESTS.md` for exactly what passed and what is still unverified.

## Structure (MVC-inspired)

| Layer | Files | Responsibility |
|---|---|---|
| Models | `js/models/*` | Validation (`validators.js`, pure and unit-tested), Supabase data access, error mapping |
| Controllers | `js/controllers/*`, `js/main.js` | Page logic, session/nav, dashboard sections |
| Views | `js/views/*`, `*.html`, `css/styles.css` | Safe DOM helpers (no `innerHTML`), dialogs, tables, markup, styling |
| Database | `supabase/migrations/001..003`, `admin_bootstrap.sql`, `tests/rls_tests.sql` | Schema, RLS, seed content, admin bootstrap, RLS tests |

Pages: `index`, `students`, `programs`, `announcements`, `faculty`, `admission`, `contact`, `login` (login + register + Google), `privacy`, `dashboard` (one role-aware entry point), `404`.

## Database (apply in order, in the Supabase SQL editor or CLI)

1. `001_schema.sql` tables `profiles`, `programs`, `announcements`, `faculty`, `inquiries`; constraints, indexes, timestamps; helpers `is_admin()`, `is_approved_student()`, `handle_new_user()` (trigger), `ensure_profile()`, `review_student()`; protective trigger.
2. `002_rls.sql` RLS enabled on all five tables, column-level grants, explicit per-operation policies.
3. `003_seed_content.sql` migrates the 8 programs (from `admission.html`) and 5 faculty (from `faculty.html`). Re-runnable; never overwrites dashboard edits. **Programs are seeded unpublished**; there were no descriptions or images in the source files.

All scripts are idempotent. **Publication:** `is_published` boolean is authoritative; `published_at` is set automatically on publish and cleared on unpublish.

### Security model in one paragraph
Role and approval status live only in `profiles`, are assigned by database defaults (`student` / `pending`), and are never read from the browser or JWT metadata. API roles have no grant to change `role`, `approval_status`, `email` or `reviewed_*`, and a trigger blocks it even if grants change. Approval goes through `review_student()` (admin-only, cannot review self). Inquiries: INSERT requires an approved student, `user_id` is not insertable (defaults to `auth.uid()`), reads are own-only for students and all for admins, updates and deletes are admin-only. Programs and announcements are publicly readable only when published; faculty is public (as on the original page); all writes are admin-only. No policy exists for `anon` on `profiles` or `inquiries`.

## Run locally

1. Create a Supabase project (a **dev** one first). Apply the three migrations in order.
2. Auth settings: *Authentication > URL Configuration*: Site URL `http://localhost:8000`, add redirect URLs `http://localhost:8000/login.html`.
3. Put the public values in `js/config.js` **or** copy `.env.example` to `.env`, fill it in, and run `node scripts/generate-config.mjs`. Use the **publishable/anon** key only (the script rejects service-role/secret keys).
4. `python3 -m http.server 8000` (or `npm run serve`), then open `http://localhost:8000`. ES modules need HTTP; `file://` will not work.
5. Register an account on `login.html`, then create the first admin (below).

`supabase-js` is loaded from jsDelivr, pinned to `2.45.4` in every page. **Confirm this version loads for you** (it could not be fetched where this was written); you can change the pin or vendor the file into `js/vendor/`.

## Create the first administrator (private, one-time)
1. Register normally (email/password or Google) and confirm your email if confirmation is enabled.
2. Supabase dashboard > SQL Editor: open `supabase/admin_bootstrap.sql`, replace the placeholder email, run it. It promotes only an existing, confirmed account and aborts unless exactly one matches. There is no public admin registration and no default password.
3. Verify with the query at the bottom of the script (lists all admins). Log in and confirm the Administrator dashboard appears; confirm a normal student sees no admin sections.
4. The service-role key is not needed for any of this and must never be placed in the frontend.

## Google OAuth
1. Google Cloud Console > APIs & Services > Credentials > *Create OAuth client ID* (Web application).
2. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase > Authentication > Providers > Google: enable, paste Client ID and Client Secret (**the secret goes only into Supabase**, never into this repo).
4. Supabase > Authentication > URL Configuration: Site URL = your Netlify URL; Redirect URLs = `http://localhost:8000/login.html` and `https://<your-site>.netlify.app/login.html` (plus any custom domain).
5. Google accounts follow the same rule as email accounts: new = `student` + `pending`.

## Netlify (prepared, not deployed)
- `netlify.toml`: build `node scripts/generate-config.mjs`, publish `.`. No framework.
- Netlify env vars (public values only): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. The build fails if they are missing or if a secret key is supplied.
- `/supabase`, `/scripts`, `/tests`, `/docs` are redirected to 404 so SQL and docs are not served.
- CSP is shipped as **Report-Only**. After deploying a preview, load each page, check the console, then rename the header to `Content-Security-Policy` to enforce.
- Before launch: run the migrations on the production project, run `supabase/tests/rls_tests.sql` on a dev copy, update Google/Supabase redirect URLs, and run the bootstrap.
- **Do not deploy until you have reviewed `docs/ACCEPTANCE_TESTS.md` and approved.**

## Rollback
Frontend: redeploy the previous Netlify deploy. Database: migrations are additive and idempotent; to undo, drop the objects in reverse (`drop table public.inquiries, public.faculty, public.announcements, public.programs, public.profiles cascade;` plus the functions and the `on_auth_user_created` trigger). **Back up first**; this deletes data.

## Tests you can run here
`npm test` runs unit tests (validators, config generator), the import-graph check, and `tests/static_check.py` (HTML structure, `<aside>`, links, secrets, content preservation). RLS tests are in `supabase/tests/rls_tests.sql` and require a real Supabase project.

## Known limitations and open items
- **Not verified in a browser or against live Supabase** (see acceptance doc).
- Address inconsistency kept as in the originals: index says "Brgy. Kalilayan Ibaba", contact says "Brgy. Ibabang Kalilayan". Please confirm which is correct.
- Facebook link: the originals had no real URL (`#facebook`), so "Follow us: Facebook" is plain text until you supply it.
- Privacy page has three **[To be confirmed]** items (retention, correction/deletion requests, legal notices).
- Student number format is a loose pattern (4-20 letters/digits/hyphens); year levels 1-5. Tighten when the real format is known.
- The anonymous Contact form and the "Subscribe to announcements" checkbox were removed (they conflict with the auth-only inquiry rule / had no backing mechanism). The contact `Address` input was dropped; address lives on the student profile.
- No email notifications on inquiry responses; no password-reset page yet (Supabase can send reset emails, but a reset UI is not built).
- Admin role changes are SQL-only by design; there is no UI to promote users.
- Deleting an auth user in Supabase cascades to their profile and inquiries.
