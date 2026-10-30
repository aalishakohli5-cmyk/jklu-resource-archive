# Supabase setup notes

Run `migrations/001_initial_schema.sql` followed by `migrations/002_restrict_archive_to_jklu.sql` in the Supabase SQL editor. The second migration only permits confirmed `@jklu.edu.in` accounts and removes public read policies from archive metadata.

The browser calls the `archive-github` Edge Function for the repository tree and file bytes. Make the GitHub repository private, create a fine-grained read-only Contents token, set it as the `GITHUB_TOKEN` function secret, set the repository owner/name/branch secrets, then deploy the function. Never put the GitHub token or a Supabase secret/service-role key in a `VITE_` environment variable.

The Edge Function validates the Supabase access token and confirmed university email before it reads the repository. UI visibility alone is not the security boundary: use the SQL policies for Supabase REST access and keep the GitHub source repository private so direct GitHub URLs cannot bypass the app.
