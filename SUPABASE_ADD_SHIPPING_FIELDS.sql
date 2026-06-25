alter table public.orders
  add column if not exists requested_ship_date date,
  add column if not exists shipping_status text not null default 'not_shipped',
  add column if not exists shipped_at timestamptz,
  add column if not exists shipping_note text;

create index if not exists orders_requested_ship_date_idx on public.orders(requested_ship_date);
create index if not exists orders_shipping_status_idx on public.orders(shipping_status);
