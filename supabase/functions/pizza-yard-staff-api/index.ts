import { createClient } from "npm:@supabase/supabase-js@2";
import { compactVerify, createRemoteJWKSet, decodeJwt } from "npm:jose@5.10.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEYS = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const PUBLISHABLE_KEY = PUBLISHABLE_KEYS.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const SECRET_KEY = SECRET_KEYS.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error("Missing Supabase Edge Function server configuration.");
}

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
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

async function identifyStaff(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Missing staff session.");

  let userId: string | null = null;

  // Verify the token signature and the security-critical issuer/audience/expiry
  // claims, but intentionally do NOT let a bad/future `iat` claim block staff
  // access. This project has been returning PGRST303/JWT-issued-at-future even
  // when the client's clock is correct. We therefore decode the claims only
  // after cryptographically verifying the JWT signature, then validate the
  // claims we actually rely on ourselves.
  try {
    const { protectedHeader } = await compactVerify(token, jwks);
    if (!protectedHeader.alg || protectedHeader.alg === "none") {
      throw new Error("Unsupported JWT algorithm.");
    }

    const payload = decodeJwt(token);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300;

    if (payload.iss !== `${SUPABASE_URL}/auth/v1`) {
      throw new Error("Invalid JWT issuer.");
    }

    const aud = payload.aud;
    if (!(aud === "authenticated" || (Array.isArray(aud) && aud.includes("authenticated")))) {
      throw new Error("Invalid JWT audience.");
    }

    if (typeof payload.exp !== "number" || payload.exp <= now - tolerance) {
      throw new Error("Staff session has expired.");
    }

    if (typeof payload.nbf === "number" && payload.nbf > now + tolerance) {
      throw new Error("Staff session is not active yet.");
    }

    userId = typeof payload.sub === "string" ? payload.sub : null;
  } catch (signatureError) {
    // Last-resort verification through Supabase Auth. This is only reached if
    // the signature/claim verification above cannot establish a user identity.
    // It is intentionally not used for the known future-iat failure path.
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (!error) userId = data.user?.id || null;
    } catch {
      // Preserve the clean invalid-session error below.
    }
  }

  if (!userId) throw new Error("Invalid staff session.");

  const { data: staff, error } = await admin
    .from("staff_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Staff authorization check failed: ${error.message}`);
  if (!staff) throw new Error("This account is not authorized as Pizza Yard staff.");

  return userId;
}

function applyQuery(q: any, body: any) {
  for (const f of body.filters || []) {
    if (!f?.column || !["eq", "neq"].includes(f.operator)) continue;
    q = f.operator === "eq" ? q.eq(f.column, f.value) : q.neq(f.column, f.value);
  }

  if (body.or) q = q.or(body.or);

  for (const o of body.orders || []) {
    if (o?.column) q = q.order(o.column, { ascending: o.ascending !== false });
  }

  if (Number.isInteger(body.limit) && body.limit > 0) q = q.limit(Math.min(body.limit, 500));
  return q;
}

async function runTable(body: any) {
  const table = body.table;
  if (!ALLOWED_TABLES.has(table)) throw new Error("Table is not allowed.");

  const op = body.op;
  const select = body.select || "*";

  if (op === "select") {
    let q = admin.from(table).select(select);
    q = applyQuery(q, body);
    if (body.single === "single") q = q.single();
    else if (body.single === "maybeSingle") q = q.maybeSingle();
    const { data, error, count } = await q;
    if (error) throw error;
    return { data, count: count ?? null };
  }

  if (op === "insert") {
    let q = admin.from(table).insert(body.values);
    if (body.select) q = q.select(select);
    if (body.single === "single") q = q.single();
    else if (body.single === "maybeSingle") q = q.maybeSingle();
    const { data, error } = await q;
    if (error) throw error;
    return { data };
  }

  if (op === "update") {
    let q = admin.from(table).update(body.values);
    q = applyQuery(q, body);
    if (body.select) q = q.select(select);
    if (body.single === "single") q = q.single();
    else if (body.single === "maybeSingle") q = q.maybeSingle();
    const { data, error } = await q;
    if (error) throw error;
    return { data };
  }

  if (op === "upsert") {
    const opts = body.conflict ? { onConflict: body.conflict } : undefined;
    let q = admin.from(table).upsert(body.values, opts);
    if (body.select) q = q.select(select);
    if (body.single === "single") q = q.single();
    else if (body.single === "maybeSingle") q = q.maybeSingle();
    const { data, error } = await q;
    if (error) throw error;
    return { data };
  }

  throw new Error("Unsupported database operation.");
}

async function runRpc(body: any) {
  if (!ALLOWED_RPCS.has(body.rpc)) throw new Error("RPC is not allowed.");
  const { data, error } = await admin.rpc(body.rpc, body.args || {});
  if (error) throw error;
  return { data };
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
    const status = /Missing|Invalid|not authorized/i.test(message) ? 401 : 400;
    return reply({ error: { message, code: error?.code || "PIZZA_YARD_EDGE_ERROR" } }, status);
  }
});
