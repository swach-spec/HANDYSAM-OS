create table if not exists handysam_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','accountant','procurement')),
  created_at timestamptz default now()
);

create or replace function handysam_current_role() returns text as $$
  select role from handysam_user_roles where user_id = auth.uid() limit 1;
$$ language sql stable security definer set search_path = public;

alter table handysam_user_roles enable row level security;
drop policy if exists "self or admin read" on handysam_user_roles;
create policy "self or admin read" on handysam_user_roles for select to authenticated
  using (user_id = auth.uid() or handysam_current_role() = 'admin');
drop policy if exists "admin manage roles" on handysam_user_roles;
create policy "admin manage roles" on handysam_user_roles for all to authenticated
  using (handysam_current_role() = 'admin') with check (handysam_current_role() = 'admin');

-- Bootstrap: everyone with an existing account becomes admin once, so you
-- aren't locked out. Anyone added afterward needs a role assigned explicitly.
insert into handysam_user_roles (user_id, role)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;

create or replace function handysam_assign_role(p_email text, p_role text)
returns void as $$
declare v_uid uuid;
begin
  if handysam_current_role() <> 'admin' then
    raise exception 'Only an admin can assign roles';
  end if;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then
    raise exception 'No user found with that email — they must sign in at least once first';
  end if;
  insert into handysam_user_roles (user_id, role) values (v_uid, p_role)
    on conflict (user_id) do update set role = excluded.role;
end;
$$ language plpgsql security definer set search_path = public;
