window.supabaseClient = window.supabase.createClient(
  window.HANDOVER_CONFIG.SUPABASE_URL,
  window.HANDOVER_CONFIG.SUPABASE_ANON_KEY
);

async function requireSession() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}
