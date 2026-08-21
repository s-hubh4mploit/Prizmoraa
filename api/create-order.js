import Razorpay from 'razorpay';
import { getProductsByIds } from './_lib/product-prices.js';
import settingsStore from './_lib/settings-store.js';
import pendingOrderStore from './_lib/pending-order-store.js';
import { getUserIdFromRequest } from './auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items } = req.body; // [{ id, qty }] — prices are never trusted from the client
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }
    const cleanItems = items
      .map(i => ({ id: String(i.id || ''), qty: Math.max(1, Math.floor(Number(i.qty) || 1)) }))
      .filter(i => i.id);
    if (cleanItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const productMap = await getProductsByIds(cleanItems.map(i => i.id));
    const lineItems = [];
    let subtotal = 0;
    for (const { id, qty } of cleanItems) {
      const product = productMap.get(id);
      if (!product) return res.status(400).json({ error: `One of the items in your cart is no longer available.` });
      const listPrice = Number(product.price) || 0;
      const itemDiscountPercent = Math.min(100, Math.max(0, Number(product.discountPercent) || 0));
      // The per-piece sale price the customer actually saw on the product
      // page/card — folded into the subtotal here rather than shown as a
      // separate breakdown line, since it was already visible before checkout.
      const price = itemDiscountPercent > 0 ? Math.round(listPrice * (1 - itemDiscountPercent / 100)) : listPrice;
      subtotal += price * qty;
      lineItems.push({ id, name: product.name, price, qty, image: product.image });
    }

    const { shippingCharge, discountPercent } = await settingsStore.get();
    const discountAmount = Math.round(subtotal * (discountPercent / 100));
    const total = Math.max(0, subtotal - discountAmount + shippingCharge);
    const amountPaise = Math.round(total * 100);
    if (amountPaise < 100) return res.status(400).json({ error: 'Order total is too small to process.' });

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `priz_${Date.now()}`,
    });

    const userId = getUserIdFromRequest(req);
    await pendingOrderStore.save(order.id, {
      userId: userId || null,
      items: lineItems,
      subtotal,
      shippingCharge,
      discountPercent,
      discountAmount,
      total,
    });

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key, safe to expose
      subtotal,
      shippingCharge,
      discountAmount,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
}
