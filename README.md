# JKLU Resource Archive

A React + TypeScript starter for a soft-brutalist / claymorphism resource library.

## What's included

- Editorial homepage and responsive visual system.
- Live, read-only folder tree fetch from `aalishakohli5-cmyk/JKLU_PAPERS` using the GitHub API.
- Semester → subject → nested folder → file navigation.
- Global file-name/path search and type filters.
- Google OAuth sign-in wiring via Supabase (requires configuration).
- Initial private admin dashboard UI and import status entry point.
- Supabase schema migration starter for profiles, roles, library nodes, resource metadata, review submissions, audit logs and import jobs.

## Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. The public repository browser works without Supabase, subject to GitHub API availability/rate limits.

## Configure Supabase + Google sign-in

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase/migrations/001_initial_schema.sql`.
3. In Supabase Authentication → Providers, enable Google.
4. Create OAuth credentials in Google Cloud Console and configure the callback URL displayed by Supabase.
5. In Supabase Authentication → URL Configuration, add your local and deployed site URLs.
6. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` and your hosting provider.
7. Restart Vite after changing environment variables.

The `anon`/publishable key may be used in the frontend; **never put a Supabase service-role key in a `VITE_` variable or commit it**.

## Owner bootstrap

New Google users receive the default `student` role. After signing in with your own account, verify your user UUID in Supabase Authentication → Users and run this SQL manually as the project owner:

```sql
insert into public.user_roles(user_id, role)
values ('YOUR-VERIFIED-USER-UUID', 'owner')
on conflict (user_id) do update set role = 'owner';
```

Do not add a public “make me admin” button. Future role-management writes should use a trusted Edge Function/RPC with strict owner checks.

## GitHub resource import

The library currently reads the public GitHub tree and links files to their repository/raw URLs. The admin page has an import entry point, but **binary migration into Supabase Storage is not implemented yet**. For the real import pipeline, implement a Supabase Edge Function that:

1. Requires an authenticated `owner` or permitted admin.
2. Reads the GitHub recursive tree and handles pagination/truncation.
3. Downloads each allowed file and uploads bytes to the private `archive-files` bucket.
4. Inserts/updates `library_nodes` and `resources` metadata, preserving source path and URL.
5. Writes import progress and errors to `import_jobs` and `audit_log`.
6. Uses idempotent keys/checksums to avoid duplicate imports.

Keep repository import an explicit admin action. Don't run mass uploads automatically on every public page load.

## Production-readiness checklist

This is an **MVP scaffold, not a fully production-secured platform yet**.

- [ ] Verify and test all RLS policies against each role.
- [ ] Add server-side role/scope-aware authorization for every mutation.
- [ ] Implement Edge Functions/RPCs for role grants, uploads, publish/reject, audit writes and import.
- [ ] Implement private Storage policies and secure signed-download flow.
- [ ] Add granular per-subject/folder permission checks; initial SQL has role-level starter helpers only.
- [ ] Add approval UI and make status transitions atomic on the server.
- [ ] Add audit triggers/server-side immutable audit writes for all sensitive operations.
- [ ] Add tests for student/contributor/sub-admin/admin/owner access.
- [ ] Add rate-limit handling, import retry/resume, file size/type restrictions and malware scanning as appropriate.
- [ ] Deploy to Vercel or another static frontend host and configure production OAuth redirects.
- [ ] Review copyright/permissions before making course material public.

## Deploy

Build with `npm run build`. The static site output is `dist/`. Import the project into Vercel or another Vite-compatible host, configure the `VITE_*` environment variables, then set the production URL in Supabase Auth redirect settings.
