alter table public.orders
  add column if not exists shipping_method text,
  add column if not exists tracking_number text;
