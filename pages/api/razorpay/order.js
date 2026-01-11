import Razorpay from 'razorpay';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount, currency = 'INR', receipt = 'rcptid_1' } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'amount required' });

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const options = {
      amount: Math.round(amount * 100), // rupees to paise
      currency,
      receipt,
      payment_capture: 1,
    };
    const order = await razorpay.orders.create(options);
    return res.status(200).json(order);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'order creation failed' });
  }
}
