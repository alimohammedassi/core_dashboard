-- ============================================================================
-- user_activity_read_state_migration.sql
-- Security hardening for Production audit HIGH findings F1 + F2.
--
-- F1: public.get_user_activity(p_target uuid, ...) was SECURITY DEFINER with
--     authenticated EXECUTE and no ownership check, exposing any user's
--     activity data for an arbitrary p_target.
-- F2: public.mark_all_notifications_read / mark_notification_read /
--     mark_conversation_read / unread_count were SECURITY DEFINER with
--     PUBLIC + anon EXECUTE and no ownership check, letting any caller
--     operate on arbitrary user/conversation ids.
--
-- Only the 5 functions below are (re)defined. Business logic, return types,
-- volatility, SECURITY DEFINER and search_path intent are preserved; only
-- in-function authorization guards and least-privilege grants are added.
-- service_role bypasses the in-function checks because server routes verify
-- ownership before calling (same convention as Migration #7).
--
-- Idempotent: safe to run multiple times (CREATE OR REPLACE + unconditional
-- REVOKE/GRANT).
-- Run in the Supabase SQL Editor against the target project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F1) get_user_activity — was LANGUAGE sql with no guard. Rewritten in
-- plpgsql (STABLE preserved) so direct JWT callers are authorized first:
-- own activity (p_target = auth.uid()), or a coach reading one of their
-- ACTIVE subscribers (same predicate as public.is_my_active_client:
-- subscriptions.coach_id → coaches.id → coaches.user_id = auth.uid()).
-- The underlying SELECT is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.get_user_activity(p_target uuid, p_days integer default 30) returns table(summary_date date, calories_consumed numeric, calorie_goal integer, water_ml numeric, water_goal integer, steps integer, steps_goal integer, workout_done boolean, day_score integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Ownership (F1 fix): service_role skips — server routes pre-verify.
  if auth.role() <> 'service_role' then
    if p_target is null
      or (p_target <> auth.uid()
        and not exists (
          select 1 from subscriptions s
          join coaches c on c.id = s.coach_id
          where c.user_id = auth.uid()
            and s.client_id = p_target
            and s.status = 'active'
        )) then
      raise exception 'Not authorized';
    end if;
  end if;

  return query
  select
    ds.summary_date,
    coalesce(ds.calories_consumed, 0),
    coalesce(g.daily_calories, 2000),
    coalesce(ds.water_ml, 0),
    coalesce(g.daily_water_ml, 2500),
    coalesce(ds.steps, 0),
    coalesce(g.daily_steps, 8000),
    coalesce(ds.workout_done, false),
    round(public.day_commitment_score(
      ds.calories_consumed, g.daily_calories, ds.water_ml, g.daily_water_ml) * 100)::int
  from daily_summary ds
  left join user_goals g on g.user_id = ds.user_id
  where ds.user_id = p_target
    and ds.summary_date >= current_date - (p_days - 1)
  order by ds.summary_date;
end;
$$;

-- ----------------------------------------------------------------------------
-- F2a) mark_all_notifications_read — self-only for JWT callers
-- (p_user_id = auth.uid()). service_role bypass preserved for server routes.
-- ----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read(p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ownership (F2 fix): direct JWT callers may only clear their own
  -- notifications. service_role calls skip this — server routes pre-verify.
  if auth.role() <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      raise exception 'Not authorized';
    end if;
  end if;

  UPDATE notifications SET is_read = true WHERE user_id = p_user_id AND is_read = false;
end;
$$;

-- ----------------------------------------------------------------------------
-- F2b) mark_notification_read — verifies BOTH the supplied user id (must be
-- the caller) AND that the notification row belongs to the caller, so one
-- user can never flip another user's notification. service_role bypass
-- preserved for server routes.
-- ----------------------------------------------------------------------------
create or replace function public.mark_notification_read(p_notification_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ownership (F2 fix): fail closed on unknown ids or cross-user ids.
  if auth.role() <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      raise exception 'Not authorized';
    end if;
    if not exists (
      select 1 from notifications
      where id = p_notification_id and user_id = auth.uid()
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  UPDATE notifications SET is_read = true WHERE id = p_notification_id AND user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- F2c) mark_conversation_read — the caller must be the supplied user AND a
-- participant of the conversation (conversations.coach_id = auth.uid() OR
-- conversations.client_id = auth.uid(), the same relationship the RLS
-- policies enforce). Unknown or foreign conversation ids fail closed.
-- service_role bypass preserved for server routes.
-- ----------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ownership (F2 fix): identity + participant check before touching
  -- messages or unread counters.
  if auth.role() <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      raise exception 'Not authorized';
    end if;
    if not exists (
      select 1 from conversations
      where id = p_conversation_id
        and (coach_id = auth.uid() or client_id = auth.uid())
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  -- Mark individual messages as read
  UPDATE messages
  SET is_read = true
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND is_read = false;

  -- Reset the caller's unread counter on the conversation
  UPDATE conversations
  SET
    client_unread = CASE WHEN client_id = p_user_id THEN 0 ELSE client_unread END,
    coach_unread  = CASE WHEN coach_id  = p_user_id THEN 0 ELSE coach_unread END
  WHERE id = p_conversation_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- F2d) unread_count — was LANGUAGE sql with no guard. Rewritten in plpgsql
-- (VOLATILE preserved to match Production) so JWT callers may only read
-- their own unread total. The aggregation is unchanged. service_role bypass
-- preserved.
-- ----------------------------------------------------------------------------
create or replace function public.unread_count(p_user_id uuid) returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  -- Ownership (F2 fix): direct JWT callers may only read their own total.
  if auth.role() <> 'service_role' then
    if p_user_id is null or p_user_id <> auth.uid() then
      raise exception 'Not authorized';
    end if;
  end if;

  SELECT COALESCE(
    SUM(
      CASE
        WHEN c.client_id = p_user_id THEN c.client_unread
        WHEN c.coach_id  = p_user_id THEN c.coach_unread
        ELSE 0
      END
    ), 0
  )
  INTO v_count
  FROM conversations c
  WHERE c.client_id = p_user_id OR c.coach_id = p_user_id;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Least privilege: these SECURITY DEFINER functions must not be callable by
-- anon/public. Direct JWT callers are limited to authenticated users AND
-- each body re-verifies ownership (service_role bypasses the in-function
-- check after route-level verification).
-- get_user_activity already denies public/anon; restated here so the file
-- is self-contained and idempotent.
-- Idempotent: safe to re-run on an already-migrated database.
-- ----------------------------------------------------------------------------
revoke all on function public.get_user_activity(uuid, integer) from public, anon;
grant execute on function public.get_user_activity(uuid, integer) to authenticated, service_role;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated, service_role;
revoke all on function public.mark_notification_read(uuid, uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid, uuid) to authenticated, service_role;
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated, service_role;
revoke all on function public.unread_count(uuid) from public, anon;
grant execute on function public.unread_count(uuid) to authenticated, service_role;
