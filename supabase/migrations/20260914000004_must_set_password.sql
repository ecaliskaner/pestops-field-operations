-- A real signal for "this account has never had its own password", instead
-- of guessing from which GoTrue auth event fires or what the redirect URL's
-- hash happened to contain.
--
-- The first version of the invite flow listened for the PASSWORD_RECOVERY
-- event to show the "Şifrenizi Belirleyin" screen, on the documented claim
-- that Supabase fires it for both a password-reset link and an invite link.
-- Verified against a real invite just now: it does not. An invite link signs
-- the browser straight into a live, fully-authenticated session under the
-- plain SIGNED_IN event, with no signal in the client event stream that the
-- account has no password yet. Sniffing the redirect URL's `type=` parameter
-- instead would depend on GoTrue's exact flow implementation (implicit vs
-- PKCE, hash vs query) staying the way it is today — this column does not.

alter table profiles
  add column if not exists must_set_password boolean not null default false;

comment on column profiles.must_set_password is
  'True for an account created via inviteUserByEmail() that has not yet '
  'completed completePasswordSetup(). Checked at every sign-in path '
  '(restoreSession, and defensively in signIn) so the app can force the '
  'password-setup screen without depending on which auth event GoTrue '
  'happens to emit for the link that got them there.';

-- Only clears the caller's own flag: an authenticated user has no write
-- policy on profiles at all (profiles_admin_write is admin-only), so this is
-- the same narrow-RPC pattern update_own_profile() already uses.
create or replace function clear_must_set_password()
returns void
language sql security definer set search_path = public as $fn$
  update profiles set must_set_password = false where id = auth.uid();
$fn$;

revoke all on function clear_must_set_password() from public, anon;
grant execute on function clear_must_set_password() to authenticated;
