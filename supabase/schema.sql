-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Each app "tab" (Roadshow, Jesselton, Messages, Drafts, Config, ...) is stored as numbered rows; row 1 is the header.
create table if not exists public.sheet_rows (
  tab   text    not null,
  row   integer not null,
  cells text[]  not null default '{}',
  primary key (tab, row)
);

-- No public access. The app uses the service_role key on the server, which bypasses RLS.
alter table public.sheet_rows enable row level security;

-- Newer Supabase projects do not grant table access automatically. Only the server key gets it.
grant select, insert, update, delete on table public.sheet_rows to service_role;
