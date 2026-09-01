// POST /.netlify/functions/check-and-consume-credit
// Call this from the O&M generator app right before it produces a manual.

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGIN = process.env.GENERATOR_APP_ORIGIN || '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };
  }

  try {
    const { organizationId } = JSON.parse(event.body || '{}');
    if (!organizationId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: 'Missing organizationId' };
    }

    const { data: billing, error } = await supabaseAdmin
      .from('organization_billing')
      .select('plan, subscription_status, credits_remaining')
      .eq('organization_id', organizationId)
      .single();

    if (error || !billing) {
      return { statusCode: 404, headers: CORS_HEADERS, body: 'Unknown organization' };
    }

    if (billing.plan === 'subscription' && billing.subscription_status === 'active') {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ allowed: true, unlimited: true }) };
    }

    if (billing.credits_remaining > 0) {
      const { error: decErr } = await supabaseAdmin
        .from('organization_billing')
        .update({ credits_remaining: billing.credits_remaining - 1 })
        .eq('organization_id', organizationId)
        .eq('credits_remaining', billing.credits_remaining);

      if (decErr) throw decErr;

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ allowed: true, creditsRemaining: billing.credits_remaining - 1 })
      };
    }

    return {
      statusCode: 402,
      headers: CORS_HEADERS,
      body: JSON.stringify({ allowed: false, reason: 'No credits remaining and no active subscription' })
    };
  } catch (err) {
    console.error('check-and-consume-credit error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
