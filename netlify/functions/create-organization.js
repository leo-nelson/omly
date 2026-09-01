// POST /.netlify/functions/create-organization
// Called right after a user signs up via Supabase Auth (client-side).
// body: { organizationName, slug }
// header: Authorization: Bearer <supabase access_token>

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const authHeader = event.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { statusCode: 401, body: 'Missing Authorization header' };
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, body: 'Invalid or expired token' };
    }
    const userId = userData.user.id;

    const { organizationName, slug } = JSON.parse(event.body || '{}');
    if (!organizationName || !slug) {
      return { statusCode: 400, body: 'Missing organizationName or slug' };
    }
    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (cleanSlug.length < 3) {
      return { statusCode: 400, body: 'Slug must be at least 3 characters' };
    }

    const { data: existingMembership } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMembership) {
      return { statusCode: 409, body: 'This account already belongs to an organization' };
    }

    const { data: slugTaken } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', cleanSlug)
      .maybeSingle();

    if (slugTaken) {
      return { statusCode: 409, body: 'That slug is already in use' };
    }

    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name: organizationName, slug: cleanSlug })
      .select()
      .single();

    if (orgErr) throw orgErr;

    const { error: branchErr } = await supabaseAdmin
      .from('organization_branding')
      .insert({ organization_id: org.id, company_display_name: organizationName });
    if (branchErr) throw branchErr;

    const { error: billingErr } = await supabaseAdmin
      .from('organization_billing')
      .insert({
        organization_id: org.id,
        plan: 'payg',
        subscription_status: 'inactive',
        credits_remaining: 1
      });
    if (billingErr) throw billingErr;

    const { error: memberErr } = await supabaseAdmin
      .from('organization_members')
      .insert({ organization_id: org.id, user_id: userId, role: 'owner' });
    if (memberErr) throw memberErr;

    return {
      statusCode: 200,
      body: JSON.stringify({ organizationId: org.id, slug: org.slug })
    };
  } catch (err) {
    console.error('create-organization error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
