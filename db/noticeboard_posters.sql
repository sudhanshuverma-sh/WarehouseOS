-- ---------------------------------------------------------------------
-- Service Admins may post to the noticeboard too.
--
-- A new file rather than an edit to noticeboard.sql: migrations are
-- recorded by filename and applied once, so a change to an applied file
-- never reaches a database that already has it.
-- ---------------------------------------------------------------------

/**
 * Who may post a notice: a Super Admin or a Service Admin.
 *
 * Not fn_is_admin(), which also admits a Warehouse Admin. Posting reaches
 * every POC in the company, and the ask was for the two roles that run
 * services, so this names exactly those two.
 */
create or replace function fn_can_post_notice() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from v_effective_access
     where poc_email = current_user_email()
       and role in ('SUPER_ADMIN', 'SERVICE_ADMIN')
  )
$$;

-- Reading gains one clause: a poster always sees what they posted.
--
-- It is needed, not a nicety. INSERT ... RETURNING checks the new row
-- against the SELECT policy too, so a Service Admin posting a notice to one
-- POC, which they are otherwise not allowed to read, would have had their
-- own post refused as they made it. A Super Admin never hit this, because
-- they can read everything.
drop policy if exists read_notice on notice;
create policy read_notice on notice for select to wos_app
  using (
    is_super_admin()
    or lower(posted_by) = lower(current_user_email())
    or audience = 'ALL'
    or (audience = 'SITE' and site_code in (select fn_visible_sites()))
    or (audience = 'PERSON' and lower(person_email) = lower(current_user_email()))
  );

-- Posting, for either role. Changing a notice stays with whoever posted it,
-- or a Super Admin: one Service Admin cannot rewrite another's notice.
drop policy if exists write_notice on notice;
create policy post_notice on notice for insert to wos_app
  with check (fn_can_post_notice() and posted_by = current_user_email());

create policy change_notice on notice for update to wos_app
  using (is_super_admin() or posted_by = current_user_email())
  with check (is_super_admin() or posted_by = current_user_email());
