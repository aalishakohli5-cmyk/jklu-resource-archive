# JKLU Resource Archive

A React + TypeScript starter for a soft-brutalist / claymorphism resource library.

## What's included

- Editorial homepage and responsive visual system.
- Live folder tree and protected file reads from `aalishakohli5-cmyk/JKLU_PAPERS` through a Supabase Edge Function.
- Semester → cycle → subject → nested folder → file navigation, shown only after an authorised sign-in.
- Global file-name/path search and type filters.
- Microsoft OAuth sign-in via Supabase, restricted to verified `@jklu.edu.in` identities.
- Authenticated Edge Function proxy for reading the private GitHub tree and opening files.
- Initial private admin dashboard UI and import status entry point.
- Supabase schema migration starter for profiles, roles, library nodes, resource metadata, review submissions, audit logs and import jobs.

## Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Sign-in is required before the archive tree is fetched.

## Configure Supabase + Microsoft sign-in

1. Enable Azure under Supabase **Authentication → Sign In / Providers**.
2. Register a web application in Microsoft Entra ID. Add the Azure callback URL shown in Supabase's Azure provider settings to the Entra app, create a client secret, then enter the client ID and secret in the Supabase Azure provider settings. Keep that client secret in Supabase only.
3. In Supabase **Authentication → URL Configuration**, add your local and deployed site URLs as allowed redirect URLs.
4. In the Supabase SQL editor, run `supabase/migrations/001_initial_schema.sql`, then `supabase/migrations/002_restrict_archive_to_jklu.sql`. The second migration rejects account emails outside `@jklu.edu.in` and removes anonymous archive table reads.
5. In GitHub, change the resource repository to **Private**. Until it is private, people can still access its files directly through GitHub regardless of the app's login gate.
6. Create a fine-grained GitHub token with **read-only Contents** access to that repository. In the project directory, install/use the Supabase CLI, link your Supabase project, then set the Edge Function secrets (never add these to `.env.local`):

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set GITHUB_TOKEN=YOUR_READ_ONLY_TOKEN GITHUB_OWNER=aalishakohli5-cmyk GITHUB_REPO=JKLU_PAPERS GITHUB_BRANCH=main
   supabase functions deploy archive-github
   ```

7. In `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The key value should be the Supabase **Publishable key** (`sb_publishable_…`) or legacy `anon` key. Never use a secret/service-role key in a `VITE_` variable.
8. Restart Vite after changing environment variables.

The frontend checks the account domain, the auth trigger rejects non-JKLU account creation/email changes, RLS protects direct Supabase table requests, and the Edge Function verifies the user's Supabase access token and domain before proxying GitHub content. The GitHub token stays in Supabase Function secrets. The repository must be private for this proxy to prevent bypass through direct GitHub links.

Microsoft is used as an identity provider; this does not connect to a user's Outlook mailbox.

## Owner bootstrap

New Microsoft users receive the default `student` role. After signing in with your own `@jklu.edu.in` account, verify your user UUID in Supabase Authentication → Users and run this SQL manually as the project owner:

```sql
insert into public.user_roles(user_id, role)
values ('YOUR-VERIFIED-USER-UUID', 'owner')
on conflict (user_id) do update set role = 'owner';
```

Do not add a public “make me admin” button. Future role-management writes should use a trusted Edge Function/RPC with strict owner checks.

## GitHub resource import

The archive Edge Function proxies the GitHub tree and file bytes after validating the Supabase session and JKLU email domain. A fine-grained, read-only GitHub token is required after making the repository private. The admin page has an import entry point, but **binary migration into Supabase Storage is not implemented yet**. For a Storage-based import pipeline, implement a trusted Edge Function that:

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
