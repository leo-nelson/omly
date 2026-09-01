(async () => {
  const session = await requireSession();
  if (!session) return;

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await window.supabaseClient.auth.signOut();
    window.location.href = '/login.html';
  });

  // Find the caller's organization
  const { data: membership, error: memErr } = await window.supabaseClient
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (memErr || !membership) {
    window.location.href = '/complete-signup.html';
    return;
  }
  const orgId = membership.organization_id;

  // Org name + billing + branding, in parallel
  const [{ data: org }, { data: billing }, { data: branding }] = await Promise.all([
    window.supabaseClient.from('organizations').select('name').eq('id', orgId).single(),
    window.supabaseClient.from('organization_billing').select('*').eq('organization_id', orgId).single(),
    window.supabaseClient.from('organization_branding').select('*').eq('organization_id', orgId).single()
  ]);

  document.getElementById('org-name-nav').textContent = org?.name || '';

  const credits = billing?.plan === 'subscription'
    ? (billing.subscription_status === 'active' ? '∞' : '0')
    : (billing?.credits_remaining ?? 0);
  document.getElementById('credits-value').textContent = credits;

  const planLabelText = {
    none: 'No plan yet',
    payg: 'Pay as you go',
    subscription: `Subscription — ${billing?.subscription_status || 'inactive'}`
  }[billing?.plan || 'none'];
  document.getElementById('plan-label').textContent = planLabelText;

  // Link to the actual generator app, carrying the org id so it can check/decrement credits
  document.getElementById('generate-link').href =
    `${window.HANDOVER_CONFIG.GENERATOR_APP_URL}?org=${orgId}`;

  // Show the portal link only once there's a Stripe customer to manage
  const portalLink = document.getElementById('portal-link');
  portalLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await fetch('/.netlify/functions/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: orgId, returnUrl: window.location.href })
    });
    if (res.ok) {
      const { url } = await res.json();
      window.location.href = url;
    }
  });

  // Render billing action cards from the shared pricing data
  const container = document.getElementById('billing-actions');
  const items = [
    ...window.HANDOVER_PRICING.payg.map((p, i) => ({ ...p, mode: 'payment', key: `payg:${i}` })),
    ...window.HANDOVER_PRICING.subscriptions.map((p, i) => ({ ...p, mode: 'subscription', key: `subscriptions:${i}` }))
  ];
  container.innerHTML = items.map(item => `
    <div class="title-block plan">
      <p class="eyebrow">${item.mode === 'subscription' ? 'Subscription' : 'Pay as you go'}</p>
      <h3>${item.label}</h3>
      <div class="price">£${item.priceGBP}${item.mode === 'subscription' ? '<small>/mo</small>' : ''}</div>
      <button class="btn ghost block" data-key="${item.key}" data-mode="${item.mode}" data-price-id="${item.priceId}">
        ${item.mode === 'subscription' ? 'Subscribe' : 'Buy'}
      </button>
    </div>
  `).join('');

  container.querySelectorAll('button[data-price-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Redirecting...';
      const res = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          mode: btn.dataset.mode,
          priceId: btn.dataset.priceId,
          successUrl: window.location.href,
          cancelUrl: window.location.href
        })
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        btn.disabled = false;
        btn.textContent = 'Try again';
      }
    });
  });

  // Branding form
  document.getElementById('display-name').value = branding?.company_display_name || '';
  document.getElementById('logo-url').value = branding?.logo_url || '';
  document.getElementById('primary-color').value = branding?.primary_color || '#111111';
  document.getElementById('accent-color').value = branding?.accent_color || '#4f46e5';
