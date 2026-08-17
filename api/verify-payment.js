import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.RAZORPAY_KEY_SECRET) {
    res.statusCode = 500;
    return res.json({ verified: false, error: 'Payments are not configured yet.' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: 'Missing fields' });
  }

  try {
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    res.status(200).json({ verified: expected === razorpay_signature });
  } catch (err) {
    console.error(err);
    res.status(500).json({ verified: false, error: 'Could not verify payment.' });
  }
}