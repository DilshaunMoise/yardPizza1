/* Pizza Yard Firebase backend adapter.
   Keeps the existing Pizza Yard front-end API shape while replacing Supabase.
*/
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCb4laQWINQKItsCZVkwBYW-51pK_YwQeg",
    authDomain: "yardpizza-60872.firebaseapp.com",
    projectId: "yardpizza-60872",
    storageBucket: "yardpizza-60872.firebasestorage.app",
    messagingSenderId: "974313862603",
    appId: "1:974313862603:web:92851330ed331c46bcf24e",
    measurementId: "G-41T7C8QW3H"
  };

  if (!window.firebase) {
    console.error("Firebase SDK did not load.");
    return;
  }

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

  const nowIso = () => new Date().toISOString();
  const makeId = () => db.collection("_ids").doc().id;
  const orderNumber = () => String(Date.now()).slice(-6);
  const publicTrackingRef = (token) => db.collection("public_tracking").doc(String(token));

  function plain(value) {
    if (value instanceof firebase.firestore.Timestamp) return value.toDate().toISOString();
    if (value instanceof firebase.firestore.GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
    return value;
  }

  function normalizeDoc(snap) {
    return { id: snap.id, ...plain(snap.data() || {}) };
  }

  function matchesFilter(row, field, op, value) {
    const actual = row[field];
    if (op === "eq") return actual === value;
    if (op === "neq") return actual !== value;
    return true;
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.orFilter = null;
      this.orders = [];
      this.limitCount = null;
      this.selected = null;
      this.action = "select";
      this.payload = null;
      this.options = {};
    }

    select(fields = "*") { this.selected = fields; return this; }
    eq(field, value) { this.filters.push([field, "eq", value]); return this; }
    neq(field, value) { this.filters.push([field, "neq", value]); return this; }
    or(expression) { this.orFilter = expression; return this; }
    order(field, opts = {}) { this.orders.push([field, opts.ascending !== false]); return this; }
    limit(n) { this.limitCount = Number(n); return this; }
    single() { this.options.single = true; return this; }
    maybeSingle() { this.options.maybeSingle = true; return this; }

    insert(payload) { this.action = "insert"; this.payload = payload; return this; }
    update(payload) { this.action = "update"; this.payload = payload; return this; }
    upsert(payload, options = {}) { this.action = "upsert"; this.payload = payload; this.options.upsert = options; return this; }

    async execute() {
      try {
        if (this.action === "insert") return await this.doInsert();
        if (this.action === "update") return await this.doUpdate();
        if (this.action === "upsert") return await this.doUpsert();
        return await this.doSelect();
      } catch (error) {
        console.error(`Firebase ${this.action} ${this.table} failed:`, error);
        return { data: null, error: { message: error.message || String(error), code: error.code || "firebase_error" } };
      }
    }

    then(resolve, reject) { return this.execute().then(resolve, reject); }

    applyClientFilters(rows) {
      let out = rows.filter(row => this.filters.every(([f, op, v]) => matchesFilter(row, f, op, v)));
      if (this.orFilter) {
        const parts = this.orFilter.split(",").map(x => x.trim()).filter(Boolean);
        out = out.filter(row => parts.some(part => {
          const m = part.match(/^([\w]+)\.ilike\.%(.+)%$/);
          if (m) return String(row[m[1]] ?? "").toLowerCase().includes(m[2].toLowerCase());
          return true;
        }));
      }
      for (const [field, asc] of [...this.orders].reverse()) {
        out.sort((a, b) => {
          const av = a[field] instanceof Date ? a[field].getTime() : a[field];
          const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
          if (av == null && bv == null) return 0;
          if (av == null) return asc ? -1 : 1;
          if (bv == null) return asc ? 1 : -1;
          return (av > bv ? 1 : av < bv ? -1 : 0) * (asc ? 1 : -1);
        });
      }
      if (this.limitCount != null) out = out.slice(0, this.limitCount);
      return out;
    }

    async doSelect() {
      const snap = await db.collection(this.table).get();
      let rows = snap.docs.map(normalizeDoc);
      rows = this.applyClientFilters(rows);
      if (this.options.single || this.options.maybeSingle) {
        if (!rows.length) {
          return this.options.maybeSingle ? { data: null, error: null } : { data: null, error: { message: "No rows returned", code: "PGRST116" } };
        }
        if (this.options.single && rows.length > 1) return { data: null, error: { message: "Multiple rows returned", code: "PGRST116" } };
        return { data: rows[0], error: null };
      }
      return { data: rows, error: null };
    }

    async doInsert() {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = [];
      for (const raw of input) {
        const data = { ...raw };
        if (!data.created_at) data.created_at = firebase.firestore.FieldValue.serverTimestamp();
        if (this.table === "pizza_orders" && !data.order_number) data.order_number = orderNumber();
        const ref = db.collection(this.table).doc();
        await ref.set(data);
        const saved = { id: ref.id, ...plain({ ...raw, created_at: nowIso(), ...(this.table === "pizza_orders" && !raw.order_number ? { order_number: data.order_number } : {}) }) };
        created.push(saved);
        if (this.table === "pizza_orders" && data.tracking_token) await writePublicTracking(data.tracking_token, saved);
      }
      let data = Array.isArray(this.payload) ? created : created[0];
      if (this.options.single) data = created[0];
      return { data, error: null };
    }

    async doUpdate() {
      const snap = await db.collection(this.table).get();
      const rows = this.applyClientFilters(snap.docs.map(normalizeDoc));
      for (const row of rows) {
        await db.collection(this.table).doc(row.id).update({ ...this.payload, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
        if (this.table === "pizza_orders" && this.payload.status && row.tracking_token) {
          await db.collection("public_tracking").doc(String(row.tracking_token)).set({ status: this.payload.status, customer_name: row.customer_name || "", order_id: row.id, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          if (this.payload.status === "completed") await addRewardPoints(row);
        }
      }
      return { data: rows.map(r => ({ ...r, ...this.payload })), error: null };
    }

    async doUpsert() {
      const data = { ...this.payload };
      let ref;
      if (this.table === "pizza_topping_availability" && data.name) ref = db.collection(this.table).doc(String(data.name));
      else if (this.options.upsert?.onConflict) {
        const fields = String(this.options.upsert.onConflict).split(",").map(s => s.trim());
        const snap = await db.collection(this.table).get();
        const found = snap.docs.find(d => fields.every(f => d.data()[f] === data[f]));
        ref = found ? found.ref : db.collection(this.table).doc();
      } else ref = db.collection(this.table).doc();
      if (!data.created_at) data.created_at = firebase.firestore.FieldValue.serverTimestamp();
      await ref.set(data, { merge: true });
      return { data: { id: ref.id, ...plain(data) }, error: null };
    }
  }

  async function writePublicTracking(token, order) {
    await publicTrackingRef(token).set({
      status: order.status || "new",
      customer_name: order.customer_name || "",
      order_id: order.id,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function addRewardPoints(order) {
    const phone = String(order.customer_phone || "").replace(/\D/g, "");
    if (!phone) return;
    const ref = db.collection("rewards").doc(phone);
    const snap = await ref.get();
    if (!snap.exists) return;
    const points = Number(snap.data().points || 0) + Math.max(0, Math.floor(Number(order.total || 0)));
    await ref.set({ points, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async function findReward(name, phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    if (!clean) return null;
    const snap = await db.collection("rewards").doc(clean).get();
    if (!snap.exists) return null;
    const r = snap.data();
    if (name && r.name && String(r.name).trim().toLowerCase() !== String(name).trim().toLowerCase()) return null;
    return { id: snap.id, ...plain(r) };
  }

  async function rpc(name, params = {}) {
    try {
      if (name === "get_pizza_order_status") {
        const snap = await publicTrackingRef(params.p_tracking_token).get();
        return { data: snap.exists ? [{ id: snap.id, ...plain(snap.data()) }] : [], error: null };
      }
      if (name === "ensure_rewards_member") {
        const phone = String(params.p_phone || "").replace(/\D/g, "");
        if (!phone) return { data: [], error: null };
        await db.collection("rewards").doc(phone).set({ name: params.p_name || "Customer", phone, email: params.p_email || null, points: 0, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return { data: [{ phone }], error: null };
      }
      if (name === "get_rewards_summary") {
        const r = await findReward(params.p_name, params.p_phone);
        if (!r) return { data: [], error: null };
        const points = Number(r.points || 0);
        const levels = [{ n: 300, label: "a FREE 12-inch Pizza", reward: "FREE 12\" PIZZA" }, { n: 200, label: "$10 OFF", reward: "$10 OFF" }, { n: 100, label: "$5 OFF", reward: "$5 OFF" }];
        const next = levels.slice().reverse().find(x => points < x.n);
        return { data: [{ points, next_reward_points: next?.n || 0, next_reward_label: next?.label || "your next reward", available_reward: points >= 300 ? "FREE 12\" PIZZA" : points >= 200 ? "$10 OFF" : points >= 100 ? "$5 OFF" : "Keep earning points" }], error: null };
      }
      if (name === "redeem_rewards") {
        const r = await findReward(params.p_name, params.p_phone);
        if (!r) return { data: [], error: { message: "Rewards account not found" } };
        const costs = { five_off: [100, "$5 OFF"], ten_off: [200, "$10 OFF"], free_pizza: [300, "FREE 12\" PIZZA"] };
        const [cost, label] = costs[params.p_reward_key] || [];
        if (!cost || Number(r.points || 0) < cost) return { data: [], error: { message: "Not enough points" } };
        const code = `PY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await db.collection("reward_codes").doc(code).set({ code, reward_key: params.p_reward_key, reward_label: label, phone: r.phone, used: false, created_at: firebase.firestore.FieldValue.serverTimestamp() });
        await db.collection("rewards").doc(r.id).set({ points: Number(r.points || 0) - cost, updated_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return { data: [{ code, reward_label: label }], error: null };
      }
      if (name === "verify_reward_code") {
        const code = String(params.p_code || "").trim().toUpperCase();
        const ref = db.collection("reward_codes").doc(code);
        const snap = await ref.get();
        if (!snap.exists) return { data: [], error: { message: "Reward code not found" } };
        const r = snap.data();
        if (r.used) return { data: [], error: { message: "Reward code has already been used" } };
        await ref.update({ used: true, redeemed_at: firebase.firestore.FieldValue.serverTimestamp() });
        return { data: [{ code, reward_label: r.reward_label, phone: r.phone }], error: null };
      }
      return { data: null, error: { message: `Firebase RPC '${name}' is not implemented.` } };
    } catch (error) {
      return { data: null, error: { message: error.message || String(error), code: error.code || "firebase_error" } };
    }
  }

  function channel(name) {
    const handlers = [];
    let unsubscribe = null;
    let started = false;
    const api = {
      on(_event, filter, callback) { handlers.push({ filter, callback }); return api; },
      subscribe(callback) {
        const tables = [...new Set(handlers.map(h => h.filter?.table).filter(Boolean))];
        if (!tables.length) { callback?.("SUBSCRIBED"); return api; }
        const initialByTable = new Set(tables);
        const unsubs = tables.map(table => db.collection(table).onSnapshot(snapshot => {
          if (initialByTable.has(table)) { initialByTable.delete(table); return; }
          snapshot.docChanges().forEach(change => {
            const event = change.type === "added" ? "INSERT" : change.type === "modified" ? "UPDATE" : "DELETE";
            handlers.filter(h => !h.filter?.table || h.filter.table === table).forEach(h => h.callback?.({ eventType: event, new: event === "DELETE" ? null : normalizeDoc(change.doc), old: event === "DELETE" ? normalizeDoc(change.doc) : null }));
          });
        }, error => { console.warn("Firebase realtime error", error); callback?.("CHANNEL_ERROR"); }));
        unsubscribe = () => unsubs.forEach(fn => fn());
        started = true;
        callback?.("SUBSCRIBED");
        return api;
      },
      unsubscribe() { unsubscribe?.(); }
    };
    return api;
  }

  const client = {
    from(table) { return new QueryBuilder(table); },
    rpc,
    channel,
    removeChannel(ch) { ch?.unsubscribe?.(); return Promise.resolve(); },
    auth: {
      async signInWithPassword({ email, password }) {
        try { const credential = await auth.signInWithEmailAndPassword(email, password); return { data: { user: credential.user }, error: null }; }
        catch (error) { return { data: { user: null }, error: { message: error.message, code: error.code } }; }
      },
      async signOut() { try { await auth.signOut(); return { error: null }; } catch (error) { return { error }; } },
      async getSession() {
        return new Promise(resolve => {
          const unsub = auth.onAuthStateChanged(async user => { unsub(); resolve({ data: { session: user ? { user, access_token: await user.getIdToken() } : null }, error: null }); });
        });
      },
      async refreshSession() { const user = auth.currentUser; return { data: { session: user ? { user, access_token: await user.getIdToken(true) } : null }, error: null }; },
      async getUser() { return { data: { user: auth.currentUser }, error: null }; },
      onAuthStateChange(callback) { return { data: { subscription: { unsubscribe: auth.onAuthStateChanged(user => callback("SIGNED_IN", user ? { user, access_token: null } : null)) } } }; }
    }
  };

  window.pizzaYardFirebase = { app, auth, db };
  window.pizzaYardSupabase = client;
  window.supabase = { createClient: () => client };
})();
