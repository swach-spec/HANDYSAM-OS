-- Record who created each document. Defaults to the calling user
-- automatically (auth.uid()), including from inside the security
-- definer functions (POS sale, invoice confirm) — the JWT identity
-- is request-scoped, not affected by a function's elevated privileges.
alter table handysam_quotations add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table handysam_invoices add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table handysam_receipts add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table handysam_credit_notes add column if not exists created_by uuid references auth.users(id) default auth.uid();
alter table handysam_bills add column if not exists created_by uuid references auth.users(id) default auth.uid();

-- Any authenticated HandySam user can resolve a colleague's id to an
-- email (needed to print "Served by" on someone else's document) —
-- low sensitivity, internal staff directory only, not admin-gated.
create or replace function handysam_staff_directory()
returns table (user_id uuid, email text) as $$
  select u.id, u.email from auth.users u
  join handysam_user_roles r on r.user_id = u.id;
$$ language sql stable security definer set search_path = public;
