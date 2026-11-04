# PUP Unisan Campus Website

Static HTML, CSS and vanilla JavaScript pages using Bootstrap 5.3 from CDN, with two Supabase projects for authentication, campus content, faculty records and media. Netlify Functions handle privileged faculty writes, faculty media operations, public comment submissions, cookie preference synchronization and administrator moderation actions.

## Pages and existing functionality

Public pages include Home, Students, Programs, Announcements, Faculty, Admissions, Contact, Privacy and Cookie Policy. `login.html` provides account flows. `dashboard.html` is the role-aware student and administrator portal, including live administrative summaries and media management.

The public layout follows the supplied showcase image in `assets/PUP Unisan Campus UI Showcase.png`: PUP identity, maroon and gold palette, campus photography, direct links to high-value pages, announcement preview, community comments, faculty categories and responsive profiles. Mobile navigation opens as a full-screen accessible overlay.

## Database setup

The two databases are independent:

1. Main website project: apply `supabase/main/migrations/001_schema.sql`, `002_rls.sql`, `003_public_security.sql`, `004_admin_activity.sql`, `005_media_storage.sql`, and `006_public_inquiries.sql` in order.
2. Faculty project: apply `supabase/faculty/migrations/001_faculty.sql` and `002_faculty_storage.sql` separately.

The main schema supports login/profile, programs, announcements and inquiries, plus editable homepage settings, public comment moderation, visitor bans, abuse signals, audit records and campus media. Public inquiry inserts go through a Netlify Function and service-only database RPC; ordinary visitors cannot read or write inquiry rows directly. Faculty records and portraits stay in the separate faculty project. Faculty changes and faculty media operations go through Netlify Functions that verify the signed-in user against the main project's protected `profiles` record before using the faculty server credential.

Bootstrap the first administrator by following the comments in `supabase/main/admin_bootstrap.sql` for an existing, email-confirmed account. There is no public admin registration.

## Configuration and local run

Copy `.env.example` to `.env`, then fill in the public main and faculty Supabase values and the Turnstile **site key**. Run `npm run build` to generate `js/config.js`. Do not commit `.env`.

Set the server-only variables described in [Deployment configuration](docs/DEPLOYMENT.md) in Netlify. They include both service-role credentials, the Turnstile secret and an abuse-hash secret. They must never be placed in browser code. Use `npx netlify dev` for local Netlify Function support; `npm run serve` runs only the static site.

## Security behavior

- RLS protects profiles, inquiries, unpublished content and moderated comments.
- Turnstile tokens are verified server-side before public comments or (when Turnstile is configured) inquiries are sent to the database.
- Submission throttling and temporary ban escalation run in a database transaction. Prior bans hold later comments for review even after expiry or manual unban. Only an explicit admin action clears that review restriction.
- Administrator moderation actions use server-side session and role verification and are written to an audit table.
- Essential cookie storage is always enabled. Optional analytics are not loaded by this website; visitors can still save and revise the preference.

## Verification and limitations

`npm test` runs local static structure checks. This workspace has no local `.env` values or connected Supabase/Turnstile projects, so authentication, storage, policies, CAPTCHA verification and Netlify Function workflows need external configuration before they can run live. The media library stores public image URLs in organized year/month folders; copy a URL into the relevant campus setting or faculty record. Rich page-section editing is not included.
