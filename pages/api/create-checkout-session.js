const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET
const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase()

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set')
    return res.status(500).json({ error: 'Server misconfiguration: PayPal credentials not set' })
  }

  const { region } = req.body || {}

  // Map region to display currency/amount and PayPal settlement (use USD for PayPal calls to avoid unsupported currencies)
  const pricing = {
    europe: { displayCurrency: '€', displayAmount: '1.99', paypalCurrency: 'EUR', paypalAmount: '1.99' },
    uk: { displayCurrency: '£', displayAmount: '1.66', paypalCurrency: 'GBP', paypalAmount: '1.66' },
    // PayPal doesn't support INR in many accounts/sandboxes; display ₹99 but charge USD $1.00
    india: { displayCurrency: '$', displayAmount: '1', paypalCurrency: 'USD', paypalAmount: '1.00' },
    us: { displayCurrency: '$', displayAmount: '1.99', paypalCurrency: 'USD', paypalAmount: '1.99' },
    other: { displayCurrency: '$', displayAmount: '1.99', paypalCurrency: 'USD', paypalAmount: '1.99' },
  }

  const choice = pricing[(region || 'other').toLowerCase()] || pricing.other
  const base = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

  try {
    const origin = req.headers.origin || `http://localhost:3000`

    // Get access token
    const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')
    const tokenResp = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!tokenResp.ok) {
      const txt = await tokenResp.text().catch(() => '')
      console.error('PayPal token error', tokenResp.status, txt)
      return res.status(500).json({ error: 'Failed to authenticate with PayPal' })
    }
    const tokenJson = await tokenResp.json()
    const accessToken = tokenJson.access_token

    // Create order (use PayPal-supported settlement currency)
    const orderResp = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: choice.paypalCurrency, value: choice.paypalAmount },
            description: 'One-time neutral analysis and guidance',
          },
        ],
        application_context: {
          return_url: `${origin}/`,
          cancel_url: `${origin}/`,
        },
      }),
    })

    if (!orderResp.ok) {
      const txt = await orderResp.text().catch(() => '')
      console.error('PayPal order create error', orderResp.status, txt)
      return res.status(500).json({ error: 'Failed to create PayPal order' })
    }

    const orderJson = await orderResp.json()
    const approve = (orderJson.links || []).find((l) => l.rel === 'approve')
    if (!approve || !approve.href) {
      console.error('No approve link in PayPal order', orderJson)
      return res.status(500).json({ error: 'PayPal did not return approval URL' })
    }

    return res.status(200).json({ url: approve.href })
  } catch (err) {
    console.error('Error creating PayPal order', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
