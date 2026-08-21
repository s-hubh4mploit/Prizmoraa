// Looks up each customer's most recent delivery address from their order
// history — used by the admin Customers view, since address lives on
// orders (it can change between orders), not on the user's account.
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING;

const sql = CONNECTION_STRING ? neon(CONNECTION_STRING) : null;

const DATA_DIR = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'prizmoraa_orders.json');

// Returns Map<userId, {address, pincode}> for each user's latest order.
export async function getLatestAddressesByUserId() {
  const map = new Map();

  if (sql) {
    try {
      const rows = await sql`
        SELECT DISTINCT ON (user_id) user_id, address, pincode
        FROM orders
        WHERE user_id IS NOT NULL
        ORDER BY user_id, created_at DESC
      `;
      for (const r of rows) map.set(r.user_id, { address: r.address, pincode: r.pincode });
    } catch (err) {
      // orders table may not exist yet (no orders placed) — fine, just empty.
    }
    return map;
  }

  try {
    const orders = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(orders)) {
      // File store's orders are newest-first (unshift on create), so the
      // first match per userId is already the latest.
      for (const o of orders) {
        if (o.userId && !map.has(o.userId)) {
          map.set(o.userId, { address: o.address, pincode: o.pincode });
        }
      }
    }
  } catch (err) {
    // No orders file yet — fine, just empty.
  }
  return map;
}
