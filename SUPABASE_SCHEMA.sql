create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  status text not null default 'pending_payment',
  order_type text,
  student_name text,
  student_email text,
  phone text,
  line_id text,
  city text,
  class_city text,
  items_text text,
  items jsonb default '[]'::jsonb,
  total numeric default 0,
  payment text,
  partial_paid_amount numeric default 0,
  balance_due_amount numeric default 0,
  balance_due_date date,
  partial_payment_note text,
  note text,
  student_notice text,
  course_title text,
  session_label text,
  session_date date,
  session_time text,
  session_location text,
  requested_ship_date date,
  shipping_status text not null default 'not_shipped',
  shipped_at timestamptz,
  shipping_note text,
  paid_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_session_date_idx on public.orders(session_date);
create index if not exists orders_requested_ship_date_idx on public.orders(requested_ship_date);
create index if not exists orders_shipping_status_idx on public.orders(shipping_status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
