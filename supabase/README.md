# Supabase setup notes

Run `migrations/001_initial_schema.sql` in a development project first and test each role before using real student data.

The schema is a foundation, not a complete authorization implementation. Do not assume that UI visibility is security. In particular, role assignment, publication state transitions, storage object operations, and audit writes should be handled by trusted server-side functions with explicit permission checks. Add scoped permission evaluation before using sub-admin permissions in production.