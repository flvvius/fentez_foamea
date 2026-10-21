create schema if not exists extensions;
alter database fentezfoamea set search_path = "$user", public, extensions;
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$;
grant usage on schema public, extensions to anon, authenticated;
