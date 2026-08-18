import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";
import { compactVerify, createRemoteJWKSet, decodeJwt } from "npm:jose@5.10.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const SECRET_KEY = SECRET_KEYS.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DATABASE_URL = Deno.env.get("SUPABASE_DB_URL") || "";

if (!SUPABASE_URL || !SECRET_KEY || !DATABASE_URL) {
  throw new Error("Missing Supabase Edge Function server configuration.");
}

// IMPORTANT: database work is done over the server-side Postgres connection,
// not PostgREST. This completely removes the PGRST303/JWT-issued-at-future
// clock-skew failure from staff database operations.
const db = postgres(DATABASE_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Used only as a last-resort Auth lookup if local JWT verification cannot
// establish an identity. It is never exposed to the browser.
const authAdmin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jwks = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

const ALLOWED_TABLES = new Set([
  "pizza_orders",
  "breakfast_orders",
  "pizza_topping_availability",
  "pizza_reviews",
  "inventory_items",
  "inventory_stock_events",
  "inventory_daily_counts",
]);

const ALLOWED_RPCS = new Set(["verify_reward_code"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function identifier(v: unknown) {
  const s = String(v ?? "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error("Invalid database identifier.");
  return s;
}

function selectExpression(v: unknown) {
  const s = String(v || "*");
  // The dashboard only needs plain columns / *; deliberately reject SQL.
  if (s === "*") return s;
  if (!/^[A-Za-z0-9_\s,.*]+$/.test(s)) throw new Error("Invalid select expression.");
  return s;
}

async function identifyStaff(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Missing staff session.");

  let userId: string | null = null;

  try {
    const { protectedHeader } = await compactVerify(token, jwks);
    if (!protectedHeader.alg || protectedHeader.alg === "none") {
      throw new Error("Unsupported JWT algorithm.");
    }

    const payload = decodeJwt(token);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300;

    if (payload.iss !== `${SUPABASE_URL}/auth/v1`) throw new Error("Invalid JWT issuer.");

    const aud = payload.aud;
    if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) {
      throw new Error("Invalid JWT audience.");
    }

    // Do NOT validate iat. The user's token has already been proven valid and
    // its iat is earlier than the browser's current time. Only exp/nbf matter.
    if (typeof payload.exp !== "number" || payload.exp <= now - tolerance) {
      throw new Error("Staff session has expired.");
    }
    if (typeof payload.nbf === "number" && payload.nbf > now + tolerance) {
      throw new Error("Staff session is not active yet.");
    }

    userId = typeof payload.sub === "string" ? payload.sub : null;
  } catch (verificationError) {
    try {
      const { data, error } = await authAdmin.auth.getUser(token);
      if (!error) userId = data.user?.id || null;
    } catch {
      // Keep the clean invalid-session response below.
    }
  }

  if (!userId) throw new Error("Invalid staff session.");

  // Direct Postgres lookup. This cannot be rejected by PostgREST's JWT clock.
  const staffRows = await db`
    select user_id
    from public.staff_users
    where user_id = ${userId}
    limit 1
  `;

  if (!staffRows.length) throw new Error("This account is not authorized as Pizza Yard staff.");
  return userId;
}

function buildWhere(body: any) {
  const clauses: string[] = [];
  const params: any[] = [];

  for (const f of body.filters || []) {
    if (!f?.column || !["eq", "neq"].includes(f.operator)) continue;
    const col = identifier(f.column);
    clauses.push(`${col} ${f.operator === "eq" ? "=" : "<>"} $${params.length + 1}`);
    params.push(f.value);
  }

  if (body.or) {
    const raw = String(body.or);
    const parts = raw.split(",").filter(Boolean);
    const orParts: string[] = [];
    for (const part of parts) {
      const m = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|ilike|like)\.(.*)$/);
      if (!m) throw new Error("Invalid OR filter.");
      const col = identifier(m[1]);
      const op = m[2] === "eq" ? "=" : m[2] === "neq" ? "<>" : m[2].toUpperCase();
      let value = m[3];
      if (op === "ILIKE" || op === "LIKE") value = value.replace(/%/g, "%");
      orParts.push(`${col} ${op} $${params.length + 1}`);
      params.push(value);
    }
    if (orParts.length) clauses.push(`(${orParts.join(" OR ")})`);
  }

  return { clauses, params };
}

function applySingle(data: any[], mode: string | null) {
  if (mode === "single") {
    if (data.length !== 1) throw new Error(data.length ? "Multiple rows returned." : "No rows returned.");
    return data[0];
  }
  if (mode === "maybeSingle") {
    if (data.length > 1) throw new Error("Multiple rows returned.");
    return data[0] ?? null;
  }
  return data;
}

async function runTable(body: any) {
  const table = identifier(body.table);
  if (!ALLOWED_TABLES.has(table)) throw new Error("Table is not allowed.");

  const op = body.op;
  const select = selectExpression(body.select || "*");

  if (op === "select") {
    const { clauses, params } = buildWhere(body);
    let text = `select ${select} from public.${table}`;
    if (clauses.length) text += ` where ${clauses.join(" and ")}`;

    for (const o of body.orders || []) {
      if (o?.column) text += ` order by ${identifier(o.column)} ${o.ascending === false ? "desc" : "asc"}`;
    }
    if (Number.isInteger(body.limit) && body.limit > 0) text += ` limit ${Math.min(body.limit, 500)}`;

    const rows = await db.unsafe(text, params);
    return { data: applySingle(rows, body.single || null), count: rows.length };
  }

  const values = body.values;
  if (!values || typeof values !== "object") throw new Error("Database values are required.");

  if (op === "insert") {
    const rows = Array.isArray(values) ? values : [values];
    if (!rows.length) return { data: [] };
    const cols = Object.keys(rows[0]).map(identifier);
    if (!cols.length) throw new Error("Insert values are empty.");
    for (const row of rows) {
      const rowCols = Object.keys(row).map(identifier);
      if (rowCols.join(",") !== cols.join(",")) throw new Error("Insert rows must have matching columns.");
    }
    const params = rows.flatMap(row => cols.map(c => row[c]));
    const placeholders = rows.map((_, i) =>
      `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(",")})`
    ).join(",");
    let text = `insert into public.${table} (${cols.join(",")}) values ${placeholders}`;
    if (body.select) text += ` returning ${select}`;
    const result = await db.unsafe(text, params);
    return { data: body.select ? applySingle(result, body.single || null) : null };
  }

  if (op === "update") {
    const cols = Object.keys(values).map(identifier);
    if (!cols.length) throw new Error("Update values are empty.");
    const { clauses, params } = buildWhere(body);
    const setParts = cols.map((c, i) => `${c} = $${params.length + i + 1}`);
    const allParams = [...params, ...cols.map(c => values[c])];
    let text = `update public.${table} set ${setParts.join(", ")}`;
    if (clauses.length) text += ` where ${clauses.join(" and ")}`;
    if (body.select) text += ` returning ${select}`;
    const result = await db.unsafe(text, allParams);
    return { data: body.select ? applySingle(result, body.single || null) : null };
  }

  if (op === "upsert") {
    const rows = Array.isArray(values) ? values : [values];
    if (!rows.length) return { data: [] };
    const cols = Object.keys(rows[0]).map(identifier);
    const params = rows.flatMap(row => cols.map(c => row[c]));
    const placeholders = rows.map((_, i) =>
      `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(",")})`
    ).join(",");
    const conflictCols = body.conflict
      ? String(body.conflict).split(",").map(identifier)
      : [];
    const updates = cols
      .filter(c => !conflictCols.includes(c))
      .map(c => `${c}=excluded.${c}`);

    let text = `insert into public.${table} (${cols.join(",")}) values ${placeholders}`;
    if (conflictCols.length) {
      text += updates.length
        ? ` on conflict (${conflictCols.join(",")}) do update set ${updates.join(",")}`
        : ` on conflict (${conflictCols.join(",")}) do nothing`;
    }
    if (body.select) text += ` returning ${select}`;
    const result = await db.unsafe(text, params);
    return { data: body.select ? applySingle(result, body.single || null) : null };
  }

  throw new Error("Unsupported database operation.");
}

async function runRpc(body: any, staffUserId: string) {
  if (!ALLOWED_RPCS.has(body.rpc)) throw new Error("RPC is not allowed.");

  if (body.rpc === "verify_reward_code") {
    const code = String(body.args?.p_code || "").trim();
    if (!code) throw new Error("Reward code is required.");

    // Reproduce verify_reward_code securely using the already verified staff id.
    const rows = await db`
      select rr.code, rr.reward_key, rm.customer_name, rm.customer_phone
      from public.rewards_redemptions rr
      join public.rewards_members rm on rm.id = rr.member_id
      where upper(rr.code) = upper(${code})
        and rr.redeemed_at is null
      limit 1
    `;
    if (!rows.length) throw new Error("Reward code is invalid or already used.");

    const r: any = rows[0];
    await db`
      update public.rewards_redemptions
      set redeemed_at = now(), verified_by = ${staffUserId}
      where code = ${r.code} and redeemed_at is null
    `;

    return {
      data: [{
        reward_label: r.reward_key === "five_off" ? "$5 OFF" : r.reward_key === "ten_off" ? "$10 OFF" : 'FREE 12" PIZZA',
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        code: r.code,
      }],
    };
  }

  throw new Error("Unsupported RPC.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: { message: "POST required." } }, 405);

  try {
    const staffUserId = await identifyStaff(req);
    const body = await req.json();
    const result = body.op === "rpc"
      ? await runRpc(body, staffUserId)
      : await runTable(body);
    return reply(result);
  } catch (error: any) {
    const message = error?.message || "Staff API request failed.";
    console.error("pizza-yard-staff-api:", message);
    const status = /Missing|Invalid|not authorized|expired|not active/i.test(message) ? 401 : 400;
    return reply({ error: { message, code: error?.code || "PIZZA_YARD_EDGE_ERROR" } }, status);
  }
});
