// POST /.netlify/functions/stripe-webhook
// Configure this exact URL in the Stripe Dashboard > Webhooks.
// This is the ONLY place organization_billing should ever be written from.

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const { data: seen } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', stripeEvent.id)
    .single();

  if (seen) {
    return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const organizationId = session.metadata?.organization_id;
        if (!organizationId) break;

        if (session.mode === 'subscription') {
          await supabase.from('organization_billing').update({
            plan: 'subscription',
            subscription_status: 'active',
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString()
          }).eq('organization_id', organizationId);
        } else if (session.mode === 'payment') {
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          const priceId = lineItems.data[0]?.price?.id;
          const creditsForPrice = CREDIT_PACK_MAP[priceId] || 0;

          const { data: current } = await supabase
            .from('organization_billing')
            .select('credits_remaining')
            .eq('organization_id', organizationId)
            .single();

          await supabase.from('organization_billing').update({
            plan: 'payg',
            credits_remaining: (current?.credits_remaining || 0) + creditsForPrice,
            updated_at: new Date().toISOString()
          }).eq('organization_id', organizationId);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = stripeEvent.data.object;
        await supabase.from('organization_billing').update({
          subscription_status: 'active',
          current_period_end: new Date(invoice.lines.data[0]?.period?.end * 1000).toISOString(),
          updated_at: new Date().toISOString()
        }).eq('stripe_customer_id', invoice.customer);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        await supabase.from('organization_billing').update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString()
        }).eq('stripe_customer_id', invoice.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;
        await supabase.from('organization_billing').update({
          plan: 'none',
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        }).eq('stripe_subscription_id', sub.id);
        break;
      }

      default:
        break;
    }

    await supabase.from('stripe_events').insert({ id: stripeEvent.id, type: stripeEvent.type });

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('stripe-webhook processing error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

const { payg } = require('../../pricing-config');
const CREDIT_PACK_MAP = Object.fromEntries(payg.map(p => [p.priceId, p.credits]));
