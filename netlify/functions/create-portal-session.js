// POST /.netlify/functions/create-portal-session
// body: { organizationId, returnUrl }

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { organizationId, returnUrl } = JSON.parse(event.body);

    const { data: billing } = await supabase
      .from('organization_billing')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .single();

    if (!billing?.stripe_customer_id) {
      return { statusCode: 404, body: 'No Stripe customer for this organization' };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: returnUrl
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-portal-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
