-- Benchfit cloud: accounts, subscriptions (written only by the payment webhook),
-- cloud projects with quotas, and Lab teams. Every table has row-level security;
-- browsers use the public anon key and can only reach rows the policies allow.


-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------- subscriptions
-- One row per Lemon Squeezy subscription. Only the service role (webhook) writes.
create table public.subscriptions (
  id text primary key,                         -- Lemon Squeezy subscription id
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  plan text not null check (plan in ('pro', 'lab')),
  status text not null,                        -- on_trial, active, past_due, paused, unpaid, cancelled, expired, refunded
  variant_id text,
  customer_id text,
  order_id text,
  renews_at timestamptz,
  ends_at timestamptz,
  portal_url text,
  update_payment_url text,
  test_mode boolean not null default false,
  ls_updated_at timestamptz,                   -- guards against out-of-order webhooks
  updated_at timestamptz not null default now()
);
create index subscriptions_email_idx on public.subscriptions (lower(email));
create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_order_idx on public.subscriptions (order_id);
alter table public.subscriptions enable row level security;
create policy subscriptions_read_own on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Audit log and idempotency for webhook deliveries. No client access at all.
create table public.webhook_events (
  id text primary key,
  event_name text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
alter table public.webhook_events enable row level security;

-- ---------------------------------------------------------------- teams (Lab plan)
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade,
  subscription_id text references public.subscriptions (id) on delete set null,
  name text not null default 'My lab' check (char_length(name) <= 120),
  seats int not null default 10 check (seats between 1 and 500),
  created_at timestamptz not null default now()
);
create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table public.team_invites (
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_at timestamptz not null default now(),
  primary key (team_id, email)
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

create function public.is_team_member(t uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid());
$$;

revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

create policy teams_read on public.teams for select to authenticated using (owner = auth.uid() or public.is_team_member(id));
create policy members_read on public.team_members for select to authenticated using (public.is_team_member(team_id));
create policy invites_read on public.team_invites for select to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid()));

-- ---------------------------------------------------------------- entitlements
create function public.sub_is_live(s public.subscriptions) returns boolean
  language sql stable as $$
  select s.status in ('on_trial', 'active', 'past_due')
      or (s.status = 'cancelled' and s.ends_at is not null and s.ends_at > now());
$$;

-- 'lab' | 'pro' | 'lab-member' | 'free' for a user; internal, not callable by clients.
create function public.entitlement_for(uid uuid) returns text
  language plpgsql stable security definer set search_path = public as $$
declare
  em text;
  best text := 'free';
begin
  select lower(email) into em from auth.users where id = uid;
  if exists (select 1 from public.subscriptions s
             where (s.user_id = uid or lower(s.email) = em) and s.plan = 'lab' and public.sub_is_live(s)) then
    return 'lab';
  end if;
  if exists (select 1 from public.subscriptions s
             where (s.user_id = uid or lower(s.email) = em) and s.plan = 'pro' and public.sub_is_live(s)) then
    best := 'pro';
  end if;
  if best = 'free' and exists (
      select 1 from public.team_members m
      join public.teams t on t.id = m.team_id
      join public.subscriptions s on s.id = t.subscription_id
      where m.user_id = uid and s.plan = 'lab' and public.sub_is_live(s)) then
    best := 'lab-member';
  end if;
  return best;
end $$;
revoke all on function public.entitlement_for(uuid) from public, anon, authenticated;

create function public.my_entitlement() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ent text;
  used bigint;
  cnt int;
begin
  if uid is null then return jsonb_build_object('plan', 'anonymous'); end if;
  ent := public.entitlement_for(uid);
  select coalesce(sum(bytes), 0), count(*) into used, cnt from public.projects where owner = uid;
  return jsonb_build_object(
    'plan', ent,
    'pro', ent <> 'free',
    'quota_bytes', public.quota_bytes(ent),
    'quota_projects', public.quota_projects(ent),
    'used_bytes', used,
    'projects', cnt,
    'checked_at', now());
end $$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;

create function public.quota_bytes(ent text) returns bigint language sql immutable as $$
  select case ent when 'free' then 5 * 1024 * 1024 when 'pro' then 250 * 1024 * 1024 else 1024 * 1024 * 1024 end::bigint;
$$;
create function public.quota_projects(ent text) returns int language sql immutable as $$
  select case ent when 'free' then 3 else 2000 end;
$$;

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  bytes int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_size check (bytes <= 5 * 1024 * 1024)
);
create index projects_owner_idx on public.projects (owner, updated_at desc);
create index projects_team_idx on public.projects (team_id) where team_id is not null;
alter table public.projects enable row level security;

create policy projects_read on public.projects for select to authenticated
  using (owner = auth.uid() or (team_id is not null and public.is_team_member(team_id)));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner = auth.uid() and (team_id is null or public.is_team_member(team_id)));
create policy projects_update on public.projects for update to authenticated
  using (owner = auth.uid() or (team_id is not null and public.is_team_member(team_id)))
  with check (team_id is null or public.is_team_member(team_id));
create policy projects_delete on public.projects for delete to authenticated using (owner = auth.uid());

revoke all on public.projects from anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert (name, data, team_id) on public.projects to authenticated;
grant update (name, data, team_id) on public.projects to authenticated;

-- size, version, timestamps and quotas are enforced server-side
create function public.projects_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ent text;
  used bigint;
  cnt int;
begin
  new.bytes := octet_length(new.data::text);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    new.owner := old.owner;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  if new.bytes > 5 * 1024 * 1024 then
    raise exception 'Project is larger than 5 MB' using errcode = 'check_violation';
  end if;
  ent := public.entitlement_for(new.owner);
  select coalesce(sum(bytes), 0), count(*) into used, cnt
    from public.projects where owner = new.owner and id <> new.id;
  if tg_op = 'INSERT' and cnt >= public.quota_projects(ent) then
    raise exception 'quota: project limit reached for the % plan', ent using errcode = 'P0001';
  end if;
  if used + new.bytes > public.quota_bytes(ent) then
    raise exception 'quota: storage limit reached for the % plan', ent using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects
  for each row execute function public.projects_guard();

-- ---------------------------------------------------------------- team management RPCs
create function public.invite_member(member_email text) returns text
  language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
  used int;
  target uuid;
begin
  select * into t from public.teams where owner = auth.uid();
  if t.id is null or public.entitlement_for(auth.uid()) <> 'lab' then
    raise exception 'Only the owner of an active Lab plan can invite members';
  end if;
  member_email := lower(trim(member_email));
  if member_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email address'; end if;
  select (select count(*) from public.team_members where team_id = t.id)
       + (select count(*) from public.team_invites where team_id = t.id) into used;
  if used >= t.seats then raise exception 'All % seats are in use', t.seats; end if;
  select id into target from auth.users where lower(email) = member_email;
  if target is not null then
    insert into public.team_members (team_id, user_id) values (t.id, target) on conflict do nothing;
    return 'added';
  end if;
  insert into public.team_invites (team_id, email) values (t.id, member_email) on conflict do nothing;
  return 'invited';
end $$;

create function public.remove_member(member uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if member = auth.uid() then raise exception 'Use leave_team, or cancel the plan'; end if;
  delete from public.team_members m using public.teams t
   where m.team_id = t.id and t.owner = auth.uid() and m.user_id = member;
end $$;

create function public.cancel_invite(member_email text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_invites i using public.teams t
   where i.team_id = t.id and t.owner = auth.uid() and i.email = lower(trim(member_email));
end $$;

create function public.leave_team() returns void
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_members m using public.teams t
   where m.team_id = t.id and t.owner <> auth.uid() and m.user_id = auth.uid();
end $$;

create function public.rename_team(new_name text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.teams set name = left(trim(new_name), 120) where owner = auth.uid();
end $$;

revoke all on function public.invite_member(text), public.remove_member(uuid), public.cancel_invite(text),
  public.leave_team(), public.rename_team(text) from public, anon;
grant execute on function public.invite_member(text), public.remove_member(uuid), public.cancel_invite(text),
  public.leave_team(), public.rename_team(text) to authenticated;


-- Members of the caller's team (owner and members see the roster; only the owner sees invites).
create function public.team_roster() returns table (user_id uuid, email text, role text, since timestamptz, pending boolean)
  language sql stable security definer set search_path = public as $$
  select m.user_id, p.email, m.role, m.added_at, false
    from public.team_members m
    join public.teams t on t.id = m.team_id
    join public.profiles p on p.id = m.user_id
   where t.owner = auth.uid() or public.is_team_member(t.id)
  union all
  select null, i.email, 'invited', i.invited_at, true
    from public.team_invites i join public.teams t on t.id = i.team_id
   where t.owner = auth.uid();
$$;
revoke all on function public.team_roster() from public, anon;
grant execute on function public.team_roster() to authenticated;

-- Called by the webhook (service role) when a Lab subscription is live and linked to a user.
create function public.ensure_lab_team(sub_id text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  s public.subscriptions;
  tid uuid;
begin
  select * into s from public.subscriptions where id = sub_id;
  if s.id is null or s.plan <> 'lab' or s.user_id is null then return null; end if;
  insert into public.teams (owner, subscription_id) values (s.user_id, s.id)
    on conflict (owner) do update set subscription_id = excluded.subscription_id
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, s.user_id, 'owner') on conflict do nothing;
  return tid;
end $$;
revoke all on function public.ensure_lab_team(text) from public, anon, authenticated;
grant execute on function public.ensure_lab_team(text) to service_role;

-- ---------------------------------------------------------------- new users
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  update public.subscriptions set user_id = new.id
   where user_id is null and lower(email) = lower(new.email);
  for s in select id from public.subscriptions where user_id = new.id and plan = 'lab' loop
    perform public.ensure_lab_team(s.id);
  end loop;
  insert into public.team_members (team_id, user_id)
    select team_id, new.id from public.team_invites where email = lower(new.email)
    on conflict do nothing;
  delete from public.team_invites where email = lower(new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- privileges
revoke all on public.profiles, public.subscriptions, public.webhook_events, public.teams,
  public.team_members, public.team_invites from anon, authenticated;
grant select on public.profiles, public.subscriptions, public.teams, public.team_members, public.team_invites to authenticated;
