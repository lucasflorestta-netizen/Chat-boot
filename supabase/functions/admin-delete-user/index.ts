import { handleCors, jsonResponse, requireAdmin } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const auth = await requireAdmin(req);
  if ('error' in auth && auth.error) return auth.error;

  const { adminClient, user: caller } = auth;
  const body = await req.json();
  const { userId } = body;

  if (!userId) {
    return jsonResponse({ error: 'userId is required' }, 400);
  }

  if (userId === caller.id) {
    return jsonResponse({ error: 'Cannot delete your own account' }, 400);
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ success: true });
});
