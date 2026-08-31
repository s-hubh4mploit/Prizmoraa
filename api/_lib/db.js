// Shared Turso (libSQL) client + tagged-template SQL helper used by every
// api/_lib/*-store.js module. Turso replaced Neon here because Neon's free
// tier ran out of its 5GB/month network transfer allowance; Turso's free
// tier (9GB storage, ~1B monthly row reads, no comparable small egress cap)
// is far less likely to hit the same wall under this site's traffic.
import { createClient } from '@libsql/client';

const URL = process.env.TURSO_DATABASE_URL;
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const client = URL ? createClient({ url: URL, authToken: AUTH_TOKEN }) : null;

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

// Mirrors the subset of @neondatabase/serverless's tagged-template `sql` API
// this codebase relies on: sql`... ${value} ...` runs a parameterized query
// and resolves to an array of plain row objects. An array value expands into
// a parenthesized placeholder group (for `WHERE id IN ${ids}`) instead of a
// single placeholder.
export async function sql(strings, ...values) {
  if (!client) throw new Error('Database not configured');
  let text = strings[0];
  const args = [];
  values.forEach((value, i) => {
    if (Array.isArray(value)) {
      text += `(${value.map(() => '?').join(', ')})`;
      args.push(...value);
    } else {
      text += '?';
      args.push(value === undefined ? null : value);
    }
    text += strings[i + 1];
  });
  const result = await client.execute({ sql: text, args });
  return result.rows.map(row => rowToObject(row, result.columns));
}

export const hasDb = !!client;

export function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
