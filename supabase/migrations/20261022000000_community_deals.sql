-- Community deals: user-submitted deals, Better Auth tables, votes and rate limiting.
-- Supabase exposes the public schema over PostgREST, so every table that holds user
-- data has RLS enabled with no policies and no grants for anon/authenticated.
-- Only published deals are readable by them.

alter table offers
  add column source_type text not null default 'scraped' check (source_type in ('scraped', 'user'));

-- Better Auth tables (generated with `npx auth generate`; column names are kept as generated).
create table "auth_user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth_session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth_user" ("id") on delete cascade);

create table "auth_account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "auth_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth_rate_limit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "auth_session_userId_idx" on "auth_session" ("userId");
create index "auth_account_userId_idx" on "auth_account" ("userId");
create index "auth_verification_identifier_idx" on "auth_verification" ("identifier");

create type deal_status as enum ('pending', 'published', 'hidden', 'expired');
create type deal_type as enum ('bogo', 'percent_off', 'combo', 'fixed_price', 'happy_hour', 'other');
create type deal_channel as enum ('in_store', 'app_only', 'delivery', 'promo_code');

create table deal_images (
  id uuid primary key default gen_random_uuid(),
  uploaded_by text not null references auth_user (id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 1572864),
  sha256 text not null,
  created_at timestamptz not null default now()
);

create function deals_unique_days(days smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$ select cardinality(days) = (select count(distinct d) from unnest(days) as d) $$;

revoke execute on function deals_unique_days(smallint[]) from public, anon, authenticated;

create table deals (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'user' check (source_type in ('scraped', 'user')),
  status deal_status not null default 'published',
  restaurant_name text not null,
  title text not null,
  description text,
  deal_type deal_type not null,
  deal_price numeric(10, 2) check (deal_price >= 0 and deal_price <= 99999999.99),
  regular_price numeric(10, 2) check (regular_price > 0 and regular_price <= 99999999.99),
  percent_off smallint check (percent_off between 1 and 100),
  currency char(3) not null default 'RON',
  not_a_discount boolean not null default false,
  -- ISO weekdays, Monday = 1 ... Sunday = 7 (same as core's daysOfWeek)
  days_of_week smallint[] check (
    days_of_week is null
    or (
      cardinality(days_of_week) between 1 and 7
      and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and deals_unique_days(days_of_week)
    )
  ),
  -- both or neither; start > end means the window crosses midnight, start = end is rejected
  time_start time,
  time_end time,
  valid_from timestamptz,
  valid_until timestamptz not null,
  channel deal_channel not null,
  promo_code text,
  address text,
  location extensions.geography(point, 4326),
  source_url text,
  source_url_normalized text,
  -- deleting the image deletes the deal, even one that also has a source_url
  image_id uuid references deal_images (id) on delete cascade,
  evidence_snippet text,
  llm_confidence real check (llm_confidence between 0 and 1),
  extraction_source text not null default 'manual' check (extraction_source in ('text', 'image', 'manual')),
  submitted_by text not null references auth_user (id) on delete cascade,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_url is not null or image_id is not null),
  check ((source_url is null) = (source_url_normalized is null)),
  check (valid_from is null or valid_from <= valid_until),
  check ((time_start is null) = (time_end is null)),
  check (time_start is null or time_start <> time_end)
);

create index deals_status_created_idx on deals (status, created_at desc);
create index deals_source_url_normalized_idx on deals (source_url_normalized);
create index deals_valid_until_idx on deals (valid_until);
create index deals_location_idx on deals using gist (location);
create index deals_submitted_by_idx on deals (submitted_by, created_at desc);

create table deal_votes (
  deal_id uuid not null references deals (id) on delete cascade,
  user_id text not null references auth_user (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create index deal_votes_user_idx on deal_votes (user_id);

-- user_id is null for the global budget row
create table rate_limit_events (
  id bigint generated always as identity primary key,
  user_id text references auth_user (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on rate_limit_events (action, user_id, created_at desc);

alter table auth_user enable row level security;
alter table auth_session enable row level security;
alter table auth_account enable row level security;
alter table auth_verification enable row level security;
alter table auth_rate_limit enable row level security;
alter table deal_images enable row level security;
alter table deals enable row level security;
alter table deal_votes enable row level security;
alter table rate_limit_events enable row level security;

create policy "public read published deals" on deals for select to anon, authenticated using (status = 'published');

revoke all on auth_user, auth_session, auth_account, auth_verification, auth_rate_limit,
  deal_images, deal_votes, rate_limit_events from anon, authenticated;
revoke all on deals from anon, authenticated;
-- Public columns only: submitted_by, evidence_snippet, llm_confidence, image_id and
-- source_url_normalized stay private.
grant select (
  id, source_type, status, restaurant_name, title, description, deal_type, deal_price,
  regular_price, percent_off, currency, not_a_discount, days_of_week, time_start, time_end,
  valid_from, valid_until, channel, promo_code, address, location, source_url,
  extraction_source, score, created_at, updated_at
) on deals to anon, authenticated;

revoke all on sequence rate_limit_events_id_seq from anon, authenticated;
