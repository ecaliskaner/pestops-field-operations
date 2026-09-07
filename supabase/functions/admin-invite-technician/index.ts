// admin-invite-technician
//
// Lets a signed-in admin create a real login for a new field technician,
// without ever putting the service_role key anywhere near a browser. This is
// the ONLY way to do this correctly: creating an auth.users row (or inviting
// one by email) is an Admin API operation, which requires service_role — the
// anon-key client the web/mobile apps use cannot do it, by design.
//
// Flow:
//   1. Identify the caller from their own JWT (the browser sends it
//      automatically via supabase.functions.invoke()).
//   2. Look up the caller's profile with a service-role client and confirm
//      role = 'admin'. Every other check below inherits this: a technician
//      or client hitting this endpoint directly gets 403, never reaches the
//      invite step.
//   3. Invite the new technician by email (Supabase emails them a
//      set-your-own-password link — the admin never learns or chooses the
//      technician's password).
//   4. handle_new_user (see supabase/migrations) already created a blank
//      profiles row for the new auth user; fill in org_id/role/full_name and
//      create the matching technicians row in the SAME org as the admin.
//
// verify_jwt = true (function config) rejects unauthenticated calls before
// this code even runs; the role check below is what stops an authenticated
// non-admin from calling it.
//
// Deployed via the Supabase MCP deploy_edge_function tool; this file is the
// source of record — redeploy after editing it here.

import { createClient } from 'npm:@supabase/supabase-js@2';

// x-application-name: the web app's Supabase client (src/core/supabase.js)
// tags every request with this header, so the browser's CORS preflight sends
// it here too — without allow-listing it, the preflight is rejected and the
// real request never leaves the browser (this bit exactly once already).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  // Caller-scoped client: only used to resolve *who* is calling, via their
  // own JWT. It never performs a privileged write.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData.user) {
    return json({ error: 'invalid_session' }, 401);
  }

  // Service-role client: the only client in this function allowed to bypass
  // RLS and call the Admin API. Never exposed to the request/response.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('org_id, role, is_active')
    .eq('id', callerData.user.id)
    .single();

  if (profileErr || !callerProfile) return json({ error: 'profile_not_found' }, 403);
  if (callerProfile.role !== 'admin' || !callerProfile.is_active) {
    return json({ error: 'forbidden', message: 'Yalnizca yoneticiler teknisyen davet edebilir.' }, 403);
  }

  let body: { email?: string; full_name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = (body.email || '').trim().toLowerCase();
  const fullName = (body.full_name || '').trim();
  const phone = (body.phone || '').trim() || null;

  if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!fullName) return json({ error: 'full_name_required' }, 400);

  // inviteUserByEmail creates the auth.users row (firing handle_new_user,
  // which inserts a blank profiles row) and emails the technician a link to
  // set their own password. If the email already has an account, this
  // returns a clear error rather than silently doing nothing.
  const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email);
  if (inviteErr || !invited.user) {
    const msg = inviteErr?.message || 'davet gonderilemedi';
    const alreadyExists = /already|exists|registered/i.test(msg);
    return json(
      { error: alreadyExists ? 'email_already_registered' : 'invite_failed', message: msg },
      alreadyExists ? 409 : 500,
    );
  }

  const newUserId = invited.user.id;

  const { error: profileUpdateErr } = await adminClient
    .from('profiles')
    .update({ org_id: callerProfile.org_id, role: 'tech', full_name: fullName, phone })
    .eq('id', newUserId);

  if (profileUpdateErr) {
    return json({ error: 'profile_link_failed', message: profileUpdateErr.message }, 500);
  }

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr'))
    .join('');

  const { data: technician, error: techErr } = await adminClient
    .from('technicians')
    .insert({
      org_id: callerProfile.org_id,
      profile_id: newUserId,
      full_name: fullName,
      phone,
      email,
      initials,
    })
    .select('id, full_name, email, phone, initials, is_active, created_at')
    .single();

  if (techErr) {
    return json({ error: 'technician_row_failed', message: techErr.message }, 500);
  }

  return json({ technician, invited: true }, 201);
});
