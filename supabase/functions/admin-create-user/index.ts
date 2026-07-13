import { handleCors, jsonResponse, requireAdmin } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const auth = await requireAdmin(req);
  if ('error' in auth && auth.error) return auth.error;

  const { adminClient } = auth;
  const body = await req.json();
  const { email, password, name, role, department } = body;

  if (!email || !password || !name) {
    return jsonResponse({ error: 'email, password and name are required' }, 400);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role: role || 'agent',
      department: department || 'support',
    },
  });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  // handle_new_user trigger creates profile; ensure role/department are correct
  if (data.user) {
    await adminClient.from('profiles').update({
      role: role || 'agent',
      department: department || 'support',
      name,
    }).eq('id', data.user.id);
  }

  return jsonResponse({ user: data.user });
});
