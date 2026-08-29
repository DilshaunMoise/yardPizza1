import { compactVerify, createRemoteJWKSet, decodeJwt } from "npm:jose@5.10.0";
import postgres from "npm:postgres@3.4.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const SUPABASE_SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SECRET_KEY = SUPABASE_SECRET_KEYS.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_DB_URL) throw new Error("Missing Supabase Edge Function database configuration.");

// IMPORTANT: all staff database work goes directly to Postgres. This avoids the
// Supabase REST/PostgREST JWT validation path that is currently rejecting valid
// sessions with "JWT issued at future" because of project clock skew.
const sql = postgres(SUPABASE_DB_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

const ALLOWED_TABLES = new Set([
  "pizza_orders", "breakfast_orders", "pizza_topping_availability", "pizza_reviews",
  "inventory_items", "inventory_stock_events", "inventory_daily_counts", "back_in_stock_requests", "menu_items",
]);
const ALLOWED_RPCS = new Set(["verify_reward_code"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: cors }); }
function bearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function ident(v: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) throw new Error("Invalid database identifier.");
  return `"${v}"`;
}
function selectSql(v: string) {
  if (v === "*") return "*";
  return v.split(",").map(x => ident(x.trim())).join(", ");
}
function oneOrNull(rows: any[], mode: string | null) {
  if (mode === "single" && rows.length !== 1) throw new Error(rows.length ? "Multiple rows returned." : "No rows returned.");
  return mode ? (rows[0] || null) : rows;
}

async function identifyStaff(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Missing staff session.");
  let userId: string | null = null;

  try {
    const { protectedHeader } = await compactVerify(token, jwks);
    if (!protectedHeader.alg || protectedHeader.alg === "none") throw new Error("Unsupported JWT algorithm.");
    const payload = decodeJwt(token);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300;
    if (payload.iss !== `${SUPABASE_URL}/auth/v1`) throw new Error("Invalid JWT issuer.");
    const aud = payload.aud;
    if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) throw new Error("Invalid JWT audience.");
    if (typeof payload.exp !== "number" || payload.exp <= now - tolerance) throw new Error("Staff session has expired.");
    if (typeof payload.nbf === "number" && payload.nbf > now + tolerance) throw new Error("Staff session is not active yet.");
    userId = typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Do not call Auth.getUser here: that endpoint also validates JWT time claims.
    // The signature above is enough to establish the authenticated user ID.
  }

  if (!userId) throw new Error("Invalid staff session.");

  const staff = await sql`select user_id from public.staff_users where user_id = ${userId} limit 1`;
  if (!staff.length) throw new Error("This account is not authorized as Pizza Yard staff.");
  return userId;
}

function addFilters(parts: string[], params: any[], body: any) {
  for (const f of body.filters || []) {
    if (!f?.column || !["eq", "neq"].includes(f.operator)) continue;
    parts.push(`${ident(String(f.column))} ${f.operator === "eq" ? "=" : "<>"} $${params.length + 1}`);
    params.push(f.value);
  }
  if (body.or) {
    // Supports the PostgREST OR form used by this project, e.g.
    // customer_name.ilike.%term%,customer_phone.ilike.%term%
    const pieces = String(body.or).split(",").map((x: string) => x.trim()).filter(Boolean);
    const clauses: string[] = [];
    for (const piece of pieces) {
      const m = piece.match(/^([A-Za-z_][A-Za-z0-9_]*)\.ilike\.(.*)$/);
      if (!m) throw new Error("Unsupported OR filter.");
      let value = m[2];
      if (value.startsWith("%") && value.endsWith("%")) value = value.slice(1, -1);
      clauses.push(`${ident(m[1])} ILIKE $${params.length + 1}`);
      params.push(`%${value}%`);
    }
    if (clauses.length) parts.push(`(${clauses.join(" OR ")})`);
  }
}
function addOrder(parts: string[], body: any) {
  for (const o of body.orders || []) if (o?.column) parts.push(`ORDER BY ${ident(String(o.column))} ${o.ascending === false ? "ASC" : "ASC"}`);
  // Rebuild descending correctly without trusting arbitrary SQL.
  const orders = (body.orders || []).filter((o: any) => o?.column).map((o: any) => `${ident(String(o.column))} ${o.ascending === false ? "DESC" : "ASC"}`);
  if (orders.length) parts.push(`ORDER BY ${orders.join(", ")}`);
}

async function runTable(body: any) {
  const table = String(body.table || "");
  if (!ALLOWED_TABLES.has(table)) throw new Error("Table is not allowed.");
  const op = body.op;
  const select = selectSql(body.select || "*");
  const params: any[] = [];

  if (op === "select") {
    const where: string[] = [];
    addFilters(where, params, body);
    const tail: string[] = [];
    if (where.length) tail.push(`WHERE ${where.join(" AND ")}`);
    const orders = (body.orders || []).filter((o: any) => o?.column).map((o: any) => `${ident(String(o.column))} ${o.ascending === false ? "DESC" : "ASC"}`);
    if (orders.length) tail.push(`ORDER BY ${orders.join(", ")}`);
    if (Number.isInteger(body.limit) && body.limit > 0) { params.push(Math.min(body.limit, 5000)); tail.push(`LIMIT $${params.length}`); }
    let rows = await sql.unsafe(`SELECT ${select} FROM public.${ident(table)} ${tail.join(" ")}`, params);
    return { data: oneOrNull(rows, body.single || null), count: null };
  }

  if (op === "insert" || op === "update" || op === "upsert") {
    const values = body.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Invalid values.");
    let text = "";
    if (op === "insert") {
      const cols = Object.keys(values);
      if (!cols.length) throw new Error("No values supplied.");
      const ph = cols.map((c, i) => { params.push(values[c]); return `$${params.length}`; });
      text = `INSERT INTO public.${ident(table)} (${cols.map(ident).join(", ")}) VALUES (${ph.join(", ")})`;
    } else {
      const sets = Object.keys(values).map(c => { params.push(values[c]); return `${ident(c)} = $${params.length}`; });
      text = `UPDATE public.${ident(table)} SET ${sets.join(", ")}`;
      const where: string[] = [];
      addFilters(where, params, body);
      if (where.length) text += ` WHERE ${where.join(" AND ")}`;
    }
    if (op === "upsert") {
      const cols = Object.keys(values);
      const ph = params.splice(0, params.length).map((_: any, i: number) => `$${i + 1}`);
      for (const c of cols) params.push(values[c]);
      let conflict = String(body.conflict || "").split(",").map(x => x.trim()).filter(Boolean);
      // pizza_topping_availability is keyed by topping name. Keep a safe server-side
      // default so older dashboard clients cannot send a broken upsert request.
      if (!conflict.length && table === "pizza_topping_availability") conflict = ["name"];
      if (!conflict.length) throw new Error("Upsert conflict columns are required.");
      const updates = cols.filter(c => !conflict.includes(c)).map(c => `${ident(c)} = EXCLUDED.${ident(c)}`);
      text = `INSERT INTO public.${ident(table)} (${cols.map(ident).join(", ")}) VALUES (${ph.join(", ")}) ON CONFLICT (${conflict.map(ident).join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`;
    }
    if (body.select) text += ` RETURNING ${select}`;
    const rows = body.select ? await sql.unsafe(text, params) : await sql.unsafe(`${text} RETURNING ${select}`, params);
    return { data: oneOrNull(rows, body.single || null) };
  }
  throw new Error("Unsupported database operation.");
}

async function runRpc(body: any) {
  if (!ALLOWED_RPCS.has(body.rpc)) throw new Error("RPC is not allowed.");
  const code = body.args?.p_code;
  const rows = await sql`select * from public.verify_reward_code(${code})`;
  return { data: rows.length === 1 ? rows[0] : rows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: { message: "POST required." } }, 405);
  try {
    await identifyStaff(req);
    const body = await req.json();
    const result = body.op === "rpc" ? await runRpc(body) : await runTable(body);
    return reply(result);
  } catch (error: any) {
    const message = error?.message || "Staff API request failed.";
    console.error("pizza-yard-staff-api:", message);
    const status = /Missing|Invalid|not authorized|expired/i.test(message) ? 401 : 400;
    return reply({ error: { message, code: error?.code || "PIZZA_YARD_EDGE_ERROR" } }, status);
  }
});
