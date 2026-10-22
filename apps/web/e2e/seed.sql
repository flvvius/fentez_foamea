insert into venues (id, source, source_venue_id, name, address, chain, url, match_key, location) values
  ('00000000-0000-0000-0000-00000000a001', 'bonapp', 'v-brutarie', 'Brutăria din Colț', 'Strada Academiei 5', null, 'https://bonapp.eco/v/brutarie', 'brutaria|44.436|26.101', st_setsrid(st_makepoint(26.1010, 44.4360), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a002', 'citygrill', 'cg-centru', 'City Grill Centru', 'Strada Lipscani 10', 'City Grill', 'https://citygrill.ro', 'citygrill|44.432|26.101', st_setsrid(st_makepoint(26.1015, 44.4320), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a003', 'glovo', 'g-burger', 'Burger Rapid', 'Bulevardul Magheru 20', null, 'https://glovoapp.com/ro/ro/bucuresti/burger-rapid', 'burgerrapid|44.443|26.098', st_setsrid(st_makepoint(26.0980, 44.4430), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a004', 'kfc', 'kfc-unirii', 'KFC Unirii', 'Piața Unirii 1', 'KFC', 'https://kfc.ro', 'kfcunirii|44.427|26.103', st_setsrid(st_makepoint(26.1030, 44.4270), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a005', 'kfc', 'kfc-baneasa', 'KFC Băneasa', 'Șoseaua București-Ploiești 42', 'KFC', 'https://kfc.ro', 'kfcbaneasa|44.507|26.090', st_setsrid(st_makepoint(26.0900, 44.5070), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a006', 'kfc', 'kfc-militari', 'KFC Militari', 'Bulevardul Iuliu Maniu 546', 'KFC', 'https://kfc.ro', 'kfcmilitari|44.435|25.980', st_setsrid(st_makepoint(25.9800, 44.4350), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a007', 'bonapp', 'v-titan', 'Patiserie Titan', 'Bulevardul Nicolae Grigorescu 50', null, 'https://bonapp.eco/v/titan', 'patiserietitan|44.420|26.180', st_setsrid(st_makepoint(26.1800, 44.4200), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a009', 'bonapp', 'v-covrigi', 'Covrigăria Vest', 'Bulevardul Iuliu Maniu 300', null, 'https://bonapp.eco/v/covrigi', 'covrigariavest|44.440|25.990', st_setsrid(st_makepoint(25.9900, 44.4400), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a010', 'glovo', 'g-brutarie', 'Brutaria din Colt', 'Strada Academiei 5', null, 'https://glovoapp.com/ro/ro/bucuresti/brutaria', 'brutariadincolt|44.436|26.101', st_setsrid(st_makepoint(26.1011, 44.4361), 4326)::geography),
  ('00000000-0000-0000-0000-00000000a008', 'glovo', 'g-noloc', 'Shaorma Fără Adresă', null, null, 'https://glovoapp.com/ro/ro/bucuresti/shaorma', 'shaorma', null);

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, original_price_ron, pickup_start, pickup_end, available_count, url, delivery_only, days_of_week, time_start, time_end, conditions) values
  ('00000000-0000-0000-0000-00000000b001', 'bonapp', 'bag-1', '00000000-0000-0000-0000-00000000a001', 'surplus', 'Pachet surpriză patiserie', 15, 45, now() - interval '30 minutes', now() + interval '40 minutes', 2, 'https://bonapp.eco/p/bag-1', false, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b002', 'citygrill', 'menu-1', '00000000-0000-0000-0000-00000000a002', 'daily_menu', 'Meniul zilei City Grill', 40.9, null, null, null, null, 'https://citygrill.ro/meniul-zilei', false, '{1,2,3,4,5,6,7}', '00:00', '23:59', 'doar în restaurant'),
  ('00000000-0000-0000-0000-00000000b003', 'glovo', 'g-burger:item:1', '00000000-0000-0000-0000-00000000a003', 'discount', 'Burger dublu cu cartofi', 24, 40, null, null, null, 'https://glovoapp.com/ro/ro/bucuresti/burger-rapid', true, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b004', 'kfc', 'kfc-unirii:deal', '00000000-0000-0000-0000-00000000a004', 'combo', 'Meniu Crispy Strips 2+1', 19.9, null, null, null, null, 'https://kfc.ro/oferte', false, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b005', 'kfc', 'kfc-baneasa:deal', '00000000-0000-0000-0000-00000000a005', 'combo', 'Meniu Crispy Strips 2+1', 19.9, null, null, null, null, 'https://kfc.ro/oferte', false, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b006', 'kfc', 'kfc-militari:deal', '00000000-0000-0000-0000-00000000a006', 'combo', 'Meniu Crispy Strips 2+1', 19.9, null, null, null, null, 'https://kfc.ro/oferte', false, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b007', 'bonapp', 'bag-2', '00000000-0000-0000-0000-00000000a007', 'surplus', 'Pachet de seară Titan', 12, 36, now() + interval '2 hours', now() + interval '4 hours', 6, 'https://bonapp.eco/p/bag-2', false, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b008', 'glovo', 'g-noloc:PERCENTAGE_DISCOUNT', '00000000-0000-0000-0000-00000000a008', 'discount', '-30% la shaorma', null, null, null, null, null, 'https://glovoapp.com/ro/ro/bucuresti/shaorma', true, null, null, null, null),
  ('00000000-0000-0000-0000-00000000b009', 'bonapp', 'bag-expired', '00000000-0000-0000-0000-00000000a001', 'surplus', 'Pachet expirat', 10, 30, now() - interval '3 hours', now() - interval '1 hour', 1, 'https://bonapp.eco/p/bag-expired', false, null, null, null, null);

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, url, days_of_week, time_start, time_end)
select '00000000-0000-0000-0000-00000000b010', 'citygrill', 'tomorrow-deal', '00000000-0000-0000-0000-00000000a002', 'combo', 'Ziua berii 1+1', 14,
       'https://citygrill.ro/1plus1', array[(extract(isodow from now() at time zone 'Europe/Bucharest')::int % 7) + 1]::smallint[], '17:00', '22:00';

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, original_price_ron, pickup_start, pickup_end, available_count, url, last_seen_at) values
  ('00000000-0000-0000-0000-00000000b011', 'bonapp', 'bag-unseen', '00000000-0000-0000-0000-00000000a001', 'surplus', 'Pachet nevăzut de 7 ore', 9, 30, now() + interval '1 hour', now() + interval '3 hours', 3, 'https://bonapp.eco/p/bag-unseen', now() - interval '7 hours'),
  ('00000000-0000-0000-0000-00000000b012', 'bonapp', 'bag-checked', '00000000-0000-0000-0000-00000000a009', 'surplus', 'Pachet verificat acum 2 ore', 11, 33, now() + interval '1 hour', now() + interval '3 hours', 4, 'https://bonapp.eco/p/bag-checked', now() - interval '2 hours');

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, original_price_ron, pickup_start, pickup_end, available_count, url) values
  ('00000000-0000-0000-0000-00000000b014', 'bonapp', 'bag-tomorrow', '00000000-0000-0000-0000-00000000a001', 'surplus', 'Pachet pentru mâine', 5, 50, date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest' + interval '1 day 9 hours', date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest' + interval '1 day 11 hours', 1, 'https://bonapp.eco/p/bag-tomorrow');

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, url, last_seen_at) values
  ('00000000-0000-0000-0000-00000000b013', 'kfc', 'kfc-unirii:old', '00000000-0000-0000-0000-00000000a004', 'combo', 'Ofertă KFC de acum 4 zile', 25, 'https://kfc.ro/oferte', now() - interval '4 days');

insert into offers (id, source, source_offer_id, venue_id, kind, title, url, delivery_only) values
  ('00000000-0000-0000-0000-00000000b015', 'glovo', 'g-burger:lunch', '00000000-0000-0000-0000-00000000a003', 'daily_menu', 'Prânzul sub 25 lei', 'https://glovoapp.com/ro/ro/bucuresti/burger-rapid', true);

insert into offers (id, source, source_offer_id, venue_id, kind, title, price_ron, original_price_ron, url, delivery_only) values
  ('00000000-0000-0000-0000-00000000b016', 'glovo', 'g-brutarie:item:1', '00000000-0000-0000-0000-00000000a010', 'discount', 'Covrigi cu brânză', 8, 10, 'https://glovoapp.com/ro/ro/bucuresti/brutaria', true);

insert into scrape_runs (source, started_at, finished_at, status, offers_seen)
values ('bonapp', now() - interval '12 minutes', now() - interval '10 minutes', 'ok', 3);
