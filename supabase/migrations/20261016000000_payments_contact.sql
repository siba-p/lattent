-- Payments from more than one provider, prepaid (one-time) plans, and contact enquiries.

-- Which payment provider a subscription came from.
alter table public.subscriptions add column provider text not null default 'lemonsqueezy'
  check (provider in ('lemonsqueezy', 'razorpay'));

-- A one-time payment (for example a yearly plan paid by UPI) is stored as status 'prepaid'
-- and is live until ends_at.
create or replace function public.sub_is_live(s public.subscriptions) returns boolean
  language sql stable as $$
  select s.status in ('on_trial', 'active', 'past_due')
      or (s.status in ('cancelled', 'prepaid') and s.ends_at is not null and s.ends_at > now());
$$;

-- Messages from the contact form. Written only by the contact Edge Function (service role);
-- no client can read or write them.
create table public.enquiries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  organisation text check (char_length(organisation) <= 200),
  topic text not null check (topic in ('sales', 'lab', 'support', 'partnership', 'feedback', 'other')),
  message text not null check (char_length(message) between 10 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  emailed boolean not null default false
);
create index enquiries_email_time_idx on public.enquiries (lower(email), created_at desc);
alter table public.enquiries enable row level security;
revoke all on public.enquiries from anon, authenticated;
