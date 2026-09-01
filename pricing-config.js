module.exports = {
  payg: [
    { label: 'Single Manual', credits: 1, priceGBP: 19, priceId: 'price_1UAAicHUcXfGAKW2aQl4Zcby' },
    { label: '5 Manual Pack', credits: 5, priceGBP: 75, priceId: 'price_1UAAk0HUcXfGAKW29jh8SoSc' },
    { label: '20 Manual Pack', credits: 20, priceGBP: 240, priceId: 'price_1UAAkqHUcXfGAKW2VxYNtFtz' },
  ],
  subscriptions: [
    { label: 'Solo', priceGBP: 34, monthlyCredits: 8, priceId: 'price_1UAAllHUcXfGAKW2iewgedbK' },
    { label: 'Growth', priceGBP: 89, monthlyCredits: 25, priceId: 'price_1UAAmOHUcXfGAKW2U0I0TQj4' },
    { label: 'Agency', priceGBP: 199, monthlyCredits: null, priceId: 'price_1UAAn1HUcXfGAKW2Wdo6d2Lk' },
  ],
  launchDiscount: {
    percentOff: 50,
    durationMonths: 3,
    active: true
  }
};
