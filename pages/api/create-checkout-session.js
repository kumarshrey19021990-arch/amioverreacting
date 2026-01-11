import Razorpay from 'razorpay'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error('Razorpay credentials not set')
    return res.status(500).json({ error: 'Server misconfiguration: Razorpay credentials not set' })
  }

  const { region } = req.body || {}

  // Map region to display currency/amount
  const pricing = {
    europe: { displayCurrency: '€', displayAmount: '1.99', currency: 'EUR', amount: '1.99' },
    uk: { displayCurrency: '£', displayAmount: '1.66', currency: 'GBP', amount: '1.66' },
    india: { displayCurrency: '₹', displayAmount: '99', currency: 'INR', amount: '99' },
    us: { displayCurrency: '$', displayAmount: '1.99', currency: 'USD', amount: '1.99' },
    other: { displayCurrency: '$', displayAmount: '1.99', currency: 'USD', amount: '1.99' },
  }

  const choice = pricing[(region || 'other').toLowerCase()] || pricing.other

  try {
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })

    // Convert to subunits (paise/cents)
    const amountSubunits = Math.round(Number(choice.amount) * 100)

    const orderOptions = {
      amount: amountSubunits,
      currency: choice.currency,
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
    }

    const order = await razorpay.orders.create(orderOptions)

    return res.status(200).json({
      order,
      publicKey: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || RAZORPAY_KEY_ID,
      display: { currency: choice.displayCurrency, amount: choice.displayAmount },
    })
  } catch (err) {
    console.error('Error creating Razorpay order', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
