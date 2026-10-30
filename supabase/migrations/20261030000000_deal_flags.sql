-- Conditions a deal carries on top of its channel (core's DEAL_FLAGS): "Pentru studenți",
-- "Cu aplicația" and so on. text[] rather than an enum array: postgres.js returns arrays of
-- unknown types as a string. The app keeps the list free of repeats.
alter table deals
  add column flags text[] not null default '{}' check (
    flags <@ array['student', 'in_app', 'first_order', 'loyalty_card', 'takeaway', 'limited_stock', 'vegetarian']::text[]
  );

grant select (flags) on deals to anon, authenticated;
