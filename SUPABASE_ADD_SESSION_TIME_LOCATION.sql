alter table public.orders
  add column if not exists session_time text,
  add column if not exists session_location text,
  add column if not exists student_notice text;
