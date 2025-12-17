create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, username)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'username'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(excluded.username, public.users.username);
  return new;
end;
$$;

-- Ensure any existing trigger is dropped and recreate it on auth.users
drop trigger if exists auth_user_created on auth.users;
create trigger auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();