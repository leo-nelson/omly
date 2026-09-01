// POST /.netlify/functions/create-checkout-session
// body: { organizationId, mode: "subscription" | "payment", priceId, successUrl, cancelUrl }

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { launchDiscount } = require('../../pricing-config');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { organizationId, mode, priceId, successUrl, cancelUrl } = JSON.parse(event.body);

    if (!organizationId || !mode || !priceId) {
      return { statusCode: 400, body: 'Missing organizationId, mode, or priceId' };
    }

    const { data: billing } = await supabase
      .from('organization_billing')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .single();

    let customerId = billing?.stripe_customer_id;

    if (!customerId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();

      const customer = await stripe.customers.create({
        name: org?.name,
        metadata: { organization_id: organizationId }
      });
      customerId = customer.id;

      await supabase
        .from('organization_billing')
        .upsert({ organization_id: organizationId, stripe_customer_id: customerId });
    }

    const sessionParams = {
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { organization_id: organizationId },
      managed_payments: { enabled: false }
    };

    if (mode === 'subscription' && launchDiscount.active && process.env.STRIPE_LAUNCH_COUPON_ID) {
      sessionParams.discounts = [{ coupon: process.env.STRIPE_LAUNCH_COUPON_ID }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
