const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET
const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase()

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.error('PayPal credentials not set')
    return res.status(500).json({ error: 'Server misconfiguration: PayPal credentials not set' })
  }

  // Accept PayPal token or order id params
  const { session_id } = req.query || {}
  const orderId = req.query.token || req.query.paypal_order_id || req.query.order_id || session_id
  if (!orderId) return res.status(400).json({ error: 'Missing order id/token' })

  const base = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

  try {
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

    // Try to capture the order (idempotent if already captured)
    const capResp = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (capResp.ok) {
      const capJson = await capResp.json()
      // Look for any capture with status 'COMPLETED'
      const captures = []
      try {
        (capJson.purchase_units || []).forEach((pu) => {
          const payments = pu.payments || {}
          ;(payments.captures || []).forEach((c) => captures.push(c))
        })
      } catch (e) {
        // ignore
      }
      const paid = captures.some((c) => c.status === 'COMPLETED')
      return res.status(200).json({ paid: !!paid })
    }

    // If capture failed, try to inspect the order
    const orderResp = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!orderResp.ok) {
      const txt = await orderResp.text().catch(() => '')
      console.error('PayPal order fetch error', orderResp.status, txt)
      return res.status(500).json({ error: 'Failed to verify PayPal order' })
    }
    const orderJson = await orderResp.json()
    const paid = orderJson.status === 'COMPLETED'
    return res.status(200).json({ paid: !!paid })
  } catch (err) {
    console.error('Error verifying PayPal order', err)
    return res.status(500).json({ error: 'Failed to verify session' })
  }
}
