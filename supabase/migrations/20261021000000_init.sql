create extension if not exists postgis with schema extensions;

create type offer_kind as enum ('surplus', 'discount', 'combo', 'daily_menu', 'happy_hour', 'coupon');

create table venues (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_venue_id text not null,
  name text not null,
  address text,
  chain text,
  url text,
  match_key text not null,
  location extensions.geography(point, 4326),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, source_venue_id)
);

create index venues_location_idx on venues using gist (location);
create index venues_match_key_idx on venues (match_key);

create table offers (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_offer_id text not null,
  venue_id uuid references venues (id) on delete cascade,
  kind offer_kind not null,
  title text not null,
  description text,
  price_ron numeric(10, 2),
  original_price_ron numeric(10, 2),
  discount_pct smallint generated always as (
    case
      when original_price_ron > 0 and price_ron < original_price_ron
        then round((1 - price_ron / original_price_ron) * 100)::smallint
    end
  ) stored,
  starts_at timestamptz,
  ends_at timestamptz,
  pickup_start timestamptz,
  pickup_end timestamptz,
  available_count integer,
  image_url text,
  url text not null,
  delivery_only boolean not null default false,
  raw jsonb,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, source_offer_id)
);

create index offers_active_idx on offers (active, kind) where active;
create index offers_venue_idx on offers (venue_id);

create table scrape_runs (
  id bigint generated always as identity primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  offers_seen integer not null default 0,
  offers_rejected integer not null default 0,
  error text
);

create index scrape_runs_source_idx on scrape_runs (source, started_at desc);

create table geocode_cache (
  query text primary key,
  lat double precision,
  lon double precision,
  display_name text,
  created_at timestamptz not null default now()
);

create table llm_cache (
  content_hash text primary key,
  model text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create view live_offers
with (security_invoker = true) as
select
  o.id,
  o.source,
  o.kind,
  o.title,
  o.description,
  o.price_ron::float8 as price_ron,
  o.original_price_ron::float8 as original_price_ron,
  o.discount_pct,
  o.starts_at,
  o.ends_at,
  o.pickup_start,
  o.pickup_end,
  o.available_count,
  o.image_url,
  o.url,
  o.delivery_only,
  o.last_seen_at,
  v.id as venue_id,
  v.name as venue_name,
  v.address as venue_address,
  v.chain as venue_chain,
  extensions.st_y(v.location::extensions.geometry) as lat,
  extensions.st_x(v.location::extensions.geometry) as lon,
  v.location
from offers o
left join venues v on v.id = o.venue_id
where o.active
  and (o.ends_at is null or o.ends_at > now())
  and (o.pickup_end is null or o.pickup_end > now());

create function offers_near(
  lat double precision,
  lon double precision,
  radius_m double precision default 3000,
  kinds offer_kind[] default null,
  include_delivery boolean default true,
  max_rows integer default 500
)
returns table (
  id uuid,
  source text,
  kind offer_kind,
  title text,
  description text,
  price_ron float8,
  original_price_ron float8,
  discount_pct smallint,
  starts_at timestamptz,
  ends_at timestamptz,
  pickup_start timestamptz,
  pickup_end timestamptz,
  available_count integer,
  image_url text,
  url text,
  delivery_only boolean,
  last_seen_at timestamptz,
  venue_id uuid,
  venue_name text,
  venue_address text,
  venue_chain text,
  lat float8,
  lon float8,
  distance_m float8
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(offers_near.lon, offers_near.lat), 4326)::geography as point
  )
  select
    l.id, l.source, l.kind, l.title, l.description, l.price_ron, l.original_price_ron,
    l.discount_pct, l.starts_at, l.ends_at, l.pickup_start, l.pickup_end, l.available_count,
    l.image_url, l.url, l.delivery_only, l.last_seen_at, l.venue_id, l.venue_name,
    l.venue_address, l.venue_chain, l.lat, l.lon,
    case when l.location is null then null else st_distance(l.location, origin.point) end as distance_m
  from live_offers l, origin
  where (l.location is null or st_dwithin(l.location, origin.point, radius_m))
    and (kinds is null or l.kind = any (kinds))
    and (include_delivery or not l.delivery_only)
  order by l.location is null, st_distance(l.location, origin.point) nulls last, l.discount_pct desc nulls last
  limit max_rows;
$$;

alter table venues enable row level security;
alter table offers enable row level security;
alter table scrape_runs enable row level security;
alter table geocode_cache enable row level security;
alter table llm_cache enable row level security;

create policy "public read venues" on venues for select to anon, authenticated using (true);
create policy "public read offers" on offers for select to anon, authenticated using (true);
create policy "public read scrape runs" on scrape_runs for select to anon, authenticated using (true);

revoke all on geocode_cache, llm_cache from anon, authenticated;
grant select on live_offers to anon, authenticated;
grant execute on function offers_near to anon, authenticated;
