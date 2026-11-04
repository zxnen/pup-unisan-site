# PUP Unisan deployment and external configuration

## Database projects

Keep two Supabase projects. Apply `supabase/main/migrations/001_schema.sql`, `002_rls.sql`, `003_public_security.sql`, `004_admin_activity.sql`, `005_media_storage.sql`, and `006_public_inquiries.sql` to the **main website** project in order. Apply `supabase/faculty/migrations/001_faculty.sql` and `002_faculty_storage.sql` only to the **faculty** project. Faculty writes and faculty media operations are proxied through Netlify Functions that validate the user's main-project session and administrator profile.

Bootstrap one confirmed main-project account using `supabase/main/admin_bootstrap.sql`, replacing the placeholder email. Never add service-role credentials to browser config.

Run `supabase/main/tests/rls_checks.sql` and `supabase/faculty/tests/rls_checks.sql` in the matching development projects after applying their migrations. These are SQL privilege assertions; they do not replace end-to-end checks using actual anon, student and admin sessions.

The main `site-media` bucket and faculty `faculty-media` bucket accept JPEG, PNG and WebP images up to 5 MB. Main project storage permits uploads and deletion only to approved administrators through Storage RLS. Faculty media listing, upload and deletion use the `faculty-media` Netlify Function, which checks the main project's signed-in admin profile. Both buckets provide public image retrieval for published campus pages.

## Environment variables

Public build values:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: main website project.
- `FACULTY_SUPABASE_URL`, `FACULTY_SUPABASE_PUBLISHABLE_KEY`: independent faculty project.
- `TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key.

Netlify Function runtime values:

- `SUPABASE_SERVICE_ROLE_KEY`: main website project service-role key.
- `FACULTY_SUPABASE_SERVICE_ROLE_KEY`: faculty project service-role key.
- `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret.
- `ABUSE_HASH_SECRET`: random secret used to HMAC the platform-provided client IP before storage.
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`: public key used by Functions to verify signed-in inquiry submissions. This key is publishable, but it must also be available in the Function runtime.

Use separate credentials for the two projects. Set server-only values in Netlify's function runtime environment; never copy service-role or Turnstile secret values into `js/config.js`, `.env.example`, or a frontend build artifact. Public inquiry writes require migration `006_public_inquiries.sql`; it adds nullable user association and contact fields, a service-role-only submission RPC, a review flag for previously restricted visitors, and removes direct client inserts. The live dashboard also requires migration `004_admin_activity.sql`; both media libraries require their respective storage migrations.

Set the public `TURNSTILE_SITE_KEY` and server-only `TURNSTILE_SECRET_KEY` to enable Turnstile on public inquiry submissions. When the server secret is set, the function requires and verifies a token. Without the secret, input validation and database-backed abuse limits remain enabled, but Turnstile is disabled.

## Local operation

Set the public values in `.env` and run `npm run build`. For Netlify Functions and full form/moderation workflows, use `npx netlify dev` after setting all server-only variables. `npm run serve` serves only static files; the function-backed forms and admin actions will not work there. The main dashboard and public site can be viewed at the Netlify dev URL.

Run `npm test` for the local static project checks. Database migrations and role policies still need to be applied and verified against development copies of both Supabase projects before production.
