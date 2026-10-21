-- Meetbound AI database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. Safe to run more than once.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free','p199','p299','p399')),
  subscription_id text unique,
  subscription_status text,
  period_end timestamptz,
  used_this_period int not null default 0,
  free_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  credit_source text not null,
  created_at timestamptz not null default now()
);
create index if not exists generations_user_idx on public.generations(user_id, created_at desc);

-- Only the server (service role) touches these tables. Browsers get no direct access.
alter table public.profiles enable row level security;
alter table public.generations enable row level security;

create or replace function public.plan_limit(p text) returns int
language sql immutable as $$
  select case p when 'p199' then 50 when 'p299' then 150 when 'p399' then 400 else 0 end
$$;

create or replace function public.account_status(p_uid uuid, p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare r public.profiles; v_active boolean; v_limit int;
begin
  insert into public.profiles(id, email) values (p_uid, p_email) on conflict (id) do nothing;
  select * into r from public.profiles where id = p_uid;
  v_active := r.plan <> 'free' and r.period_end is not null and r.period_end > now();
  v_limit := case when v_active then public.plan_limit(r.plan) else 0 end;
  return json_build_object(
    'plan', case when v_active then r.plan else 'free' end,
    'active', v_active,
    'renewing', v_active and coalesce(r.subscription_status, '') in ('active', 'authenticated'),
    'subscription_status', r.subscription_status,
    'subscription_id', r.subscription_id,
    'period_end', r.period_end,
    'limit', v_limit,
    'used', case when v_active then r.used_this_period else 0 end,
    'plan_left', greatest(0, v_limit - case when v_active then r.used_this_period else 0 end),
    'free_left', greatest(0, 3 - r.free_used),
    'remaining', greatest(0, v_limit - case when v_active then r.used_this_period else 0 end) + greatest(0, 3 - r.free_used)
  );
end $$;

create or replace function public.consume_credit(p_uid uuid, p_email text, p_tool text) returns json
language plpgsql security definer set search_path = public as $$
declare r public.profiles; v_source text;
begin
  insert into public.profiles(id, email) values (p_uid, p_email) on conflict (id) do nothing;
  select * into r from public.profiles where id = p_uid for update;
  if r.plan <> 'free' and r.period_end > now() and r.used_this_period < public.plan_limit(r.plan) then
    update public.profiles set used_this_period = used_this_period + 1, updated_at = now() where id = p_uid;
    v_source := 'plan';
  elsif r.free_used < 3 then
    update public.profiles set free_used = free_used + 1, updated_at = now() where id = p_uid;
    v_source := 'free';
  else
    return json_build_object('ok', false, 'status', public.account_status(p_uid, p_email));
  end if;
  insert into public.generations(user_id, tool, credit_source) values (p_uid, left(p_tool, 40), v_source);
  return json_build_object('ok', true, 'source', v_source);
end $$;

create or replace function public.refund_credit(p_uid uuid, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_source = 'plan' then
    update public.profiles set used_this_period = greatest(0, used_this_period - 1), updated_at = now() where id = p_uid;
  else
    update public.profiles set free_used = greatest(0, free_used - 1), updated_at = now() where id = p_uid;
  end if;
  delete from public.generations where id = (select id from public.generations where user_id = p_uid order by created_at desc limit 1);
end $$;

-- Switches a paid plan on, or renews it. A later period end starts a fresh month of uses.
create or replace function public.activate_plan(p_uid uuid, p_email text, p_plan text, p_sub_id text, p_status text, p_period_end timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if p_plan not in ('p199','p299','p399') then raise exception 'bad plan %', p_plan; end if;
  insert into public.profiles(id, email) values (p_uid, nullif(p_email, '')) on conflict (id) do nothing;
  select * into r from public.profiles where id = p_uid for update;
  update public.profiles set
    plan = p_plan,
    subscription_id = p_sub_id,
    subscription_status = coalesce(p_status, 'active'),
    used_this_period = case
      when r.subscription_id is distinct from p_sub_id then 0
      when r.period_end is null or p_period_end > r.period_end + interval '1 hour' then 0
      else r.used_this_period end,
    period_end = greatest(coalesce(r.period_end, p_period_end), p_period_end),
    updated_at = now()
  where id = p_uid;
end $$;

create or replace function public.set_subscription_status(p_sub_id text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set subscription_status = p_status, updated_at = now() where subscription_id = p_sub_id;
end $$;

-- Lock the functions down so only the server can call them.
revoke all on function public.account_status(uuid, text) from public, anon, authenticated;
revoke all on function public.consume_credit(uuid, text, text) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.activate_plan(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.set_subscription_status(text, text) from public, anon, authenticated;
grant execute on function public.account_status(uuid, text) to service_role;
grant execute on function public.consume_credit(uuid, text, text) to service_role;
grant execute on function public.refund_credit(uuid, text) to service_role;
grant execute on function public.activate_plan(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.set_subscription_status(text, text) to service_role;
