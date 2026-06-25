-- Enable Row Level Security for the orders table.
-- The Vercel backend uses SUPABASE_SERVICE_ROLE_KEY, so admin/order APIs can still read and write orders.
alter table public.orders enable row level security;

-- Keep direct browser/anon access blocked. No public policies are created intentionally.
