-- Lets an admin see who currently has which role (with email), without
-- exposing auth.users to the client directly.
create or replace function handysam_list_user_roles()
returns table (user_id uuid, email text, role text) as $$
begin
  if handysam_current_role() <> 'admin' then
    raise exception 'Only an admin can list user roles';
  end if;
  return query
    select u.id, u.email, r.role
    from handysam_user_roles r
    join auth.users u on u.id = r.user_id
    order by u.email;
end;
$$ language plpgsql security definer set search_path = public;
