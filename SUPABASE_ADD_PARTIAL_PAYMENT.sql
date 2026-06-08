alter table public.orders
  add column if not exists partial_paid_amount numeric default 0,
  add column if not exists balance_due_amount numeric default 0,
  add column if not exists balance_due_date date,
  add column if not exists partial_payment_note text;
