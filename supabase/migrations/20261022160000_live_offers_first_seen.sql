create or replace view live_offers
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
  v.location,
  o.days_of_week,
  to_char(o.time_start, 'HH24:MI') as time_start,
  to_char(o.time_end, 'HH24:MI') as time_end,
  o.conditions,
  o.first_seen_at
from offers o
left join venues v on v.id = o.venue_id
where o.active
  and o.last_seen_at > now() - case when o.kind = 'surplus' then interval '6 hours' else interval '72 hours' end
  and (o.starts_at is null or o.starts_at <= now() + interval '7 days')
  and (o.ends_at is null or o.ends_at > now())
  and (o.pickup_end is null or o.pickup_end > now());
