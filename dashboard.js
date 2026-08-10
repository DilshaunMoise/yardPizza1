const SUPABASE_URL = "https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";

const supabaseClient =
  window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      )
    : null;

const state = {
  orders: [],
  selectedId: null,
  filter: "active",
  search: "",
  soundOn: true,
  channel: null,
  alertTimeout: null,
  audioContext: null,
  toastTimeout: null
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const orderNumber = (id) =>
  `#${String(id).replaceAll("-", "").slice(0, 6).toUpperCase()}`;

const statusLabel = (s) =>
  String(s || "").replace("_", " ").toUpperCase();

const formatTime = (v) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(v));

const formatDateTime = (v) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(v));

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const isActive = (s) =>
  ["new", "preparing", "in_oven", "ready"].includes(s);

function setConnection(live) {
  const el = $("#connection-status");

  if (!el) return;

  el.textContent = live
    ? "● Live"
    : "● Reconnecting…";

  el.classList.toggle("live", live);
  el.classList.toggle("reconnecting", !live);
}

function showToast(message) {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(state.toastTimeout);

  state.toastTimeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

function playNotification() {
  if (!state.soundOn) return;

  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) return;

    state.audioContext ||= new AudioContext();

    const context = state.audioContext;

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    const now = context.currentTime;

    [0, 0.14].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value =
        index ? 880 : 660;

      oscillator.type = "sine";

      gain.gain.setValueAtTime(
        0.0001,
        now + offset
      );

      gain.gain.exponentialRampToValueAtTime(
        0.12,
        now + offset + 0.015
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + offset + 0.12
      );

      oscillator
        .connect(gain)
        .connect(context.destination);

      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.13);
    });
  } catch (_) {}
}

function showNewOrderAlert(order) {
  const alert = $("#new-order-alert");
  const text = $("#new-order-alert-text");

  if (!alert || !text) return;

  text.textContent =
    `${orderNumber(order.id)} • ${order.customer_name} • ${money(order.total)}`;

  alert.classList.remove("hidden");

  clearTimeout(state.alertTimeout);

  state.alertTimeout = setTimeout(() => {
    alert.classList.add("hidden");
  }, 7000);

  playNotification();
}

function filteredOrders() {
  const query = state.search
    .trim()
    .toLowerCase();

  return [...state.orders]
    .filter((order) => {
      if (state.filter === "active") {
        return isActive(order.status);
      }

      if (state.filter === "all") {
        return true;
      }

      return order.status === state.filter;
    })
    .filter((order) => {
      if (!query) return true;

      return [
        order.customer_name,
        order.customer_phone,
        order.customer_email,
        orderNumber(order.id)
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(query)
      );
    })
    .sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at)
    );
}

function updateStats() {
  const newOrders = state.orders.filter(
    (order) => order.status === "new"
  ).length;

  const preparing = state.orders.filter(
    (order) =>
      order.status === "preparing" ||
      order.status === "in_oven"
  ).length;

  const ready = state.orders.filter(
    (order) => order.status === "ready"
  ).length;

  const todayOrders = state.orders.filter(
    (order) =>
      new Date(order.created_at) >=
      new Date(todayStart())
  );

  const todaySales = todayOrders
    .filter(
      (order) => order.status !== "cancelled"
    )
    .reduce(
      (sum, order) =>
        sum + Number(order.total || 0),
      0
    );

  if ($("#stat-new"))
    $("#stat-new").textContent = newOrders;

  if ($("#stat-preparing"))
    $("#stat-preparing").textContent =
      preparing;

  if ($("#stat-ready"))
    $("#stat-ready").textContent = ready;

  if ($("#stat-today"))
    $("#stat-today").textContent =
      todayOrders.length;

  if ($("#stat-sales"))
    $("#stat-sales").textContent =
      money(todaySales);
}

function renderOrders() {
  const list = $("#orders-list");

  if (!list) return;

  const orders = filteredOrders();

  if (!orders.length) {
    list.innerHTML =
      '<div class="empty-state">No orders in this view.</div>';

    return;
  }

  list.innerHTML = orders
    .map((order) => {
      const toppings = Array.isArray(
        order.toppings
      )
        ? order.toppings
        : [];

      return `
        <article
          class="order-card ${
            String(state.selectedId) ===
            String(order.id)
              ? "selected "
              : ""
          }${
            order.status === "new"
              ? "is-new"
              : ""
          }"
          data-id="${esc(order.id)}"
        >
          <div class="order-card-top">
            <div>
              <div class="order-number">
                ${orderNumber(order.id)}
              </div>

              <div class="customer">
                ${esc(order.customer_name)}
              </div>
            </div>

            <div>
              <span
                class="status-pill status-${esc(
                  order.status
                )}"
              >
                ${statusLabel(order.status)}
              </span>

              <div class="time">
                ${formatTime(order.created_at)}
              </div>
            </div>
          </div>

          <div class="meta">
            <span>
              ${
                order.order_type === "delivery"
                  ? "🛵 Delivery"
                  : "🏪 Pickup"
              }
            </span>

            <span>
              🍕 ${esc(order.quantity)} pizza${
                Number(order.quantity) === 1
                  ? ""
                  : "s"
              }
            </span>

            <span>
              ${esc(order.pizza_size || '12"')}
            </span>
          </div>

          <div class="card-bottom">
            <div class="toppings-preview">
              ${
                toppings.length
                  ? toppings.map(esc).join(", ")
                  : "Cheese Pizza"
              }
            </div>

            <div class="total">
              ${money(order.total)}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  $$(".order-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectOrder(card.dataset.id);
    });
  });
}

function selectOrder(id) {
  state.selectedId = id;

  renderOrders();
  renderDetails();
}

function renderDetails() {
  const panel = $("#details-panel");

  if (!panel) return;

  const order = state.orders.find(
    (item) =>
      String(item.id) ===
      String(state.selectedId)
  );

  if (!order) {
    panel.innerHTML = `
      <div class="details-empty">
        <span>🍕</span>
        <h2>Select an order</h2>
        <p>
          New orders will appear here automatically.
        </p>
      </div>
    `;

    return;
  }

  const toppings = Array.isArray(
    order.toppings
  )
    ? order.toppings
    : [];

  panel.innerHTML = `
    <div class="details-content">

      <div class="details-header">
        <div>
          <div class="eyebrow">
            ORDER ${orderNumber(order.id)}
          </div>

          <h2>
            ${esc(order.customer_name)}
          </h2>

          <div class="details-sub">
            Received
            ${formatDateTime(order.created_at)}
          </div>
        </div>

        <span
          class="status-pill status-${esc(
            order.status
          )}"
        >
          ${statusLabel(order.status)}
        </span>
      </div>

      <div class="detail-section">
        <h3>Customer</h3>

        <div class="detail-row">
          <span>Name</span>
          <strong>
            ${esc(order.customer_name)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Phone</span>
          <strong>
            ${esc(order.customer_phone)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Email</span>
          <strong>
            ${esc(order.customer_email)}
          </strong>
        </div>
      </div>

      <div class="detail-section">
        <h3>Pizza</h3>

        <div class="detail-row">
          <span>Size</span>
          <strong>
            ${esc(order.pizza_size || '12"')}
          </strong>
        </div>

        <div class="detail-row">
          <span>Quantity</span>
          <strong>
            ${esc(order.quantity)}
          </strong>
        </div>

        <div class="detail-toppings">
          ${
            toppings.length
              ? toppings
                  .map(
                    (item) =>
                      `<span class="detail-chip">${esc(
                        item
                      )}</span>`
                  )
                  .join("")
              : '<span class="muted">Cheese Pizza</span>'
          }
        </div>
      </div>

      <div class="detail-section">
        <h3>Order Type</h3>

        <div class="detail-row">
          <span>Type</span>

          <strong>
            ${
              order.order_type === "delivery"
                ? "Delivery"
                : "Pickup"
            }
          </strong>
        </div>

        ${
          order.order_type === "delivery"
            ? `
              <div class="instructions">
                ${esc(
                  order.delivery_address ||
                    "No address supplied"
                )}
              </div>
            `
            : ""
        }
      </div>

      <div class="detail-section">
        <h3>Pricing</h3>

        <div class="detail-row">
          <span>Base / unit price</span>
          <strong>
            ${money(order.unit_price)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Included toppings</span>
          <strong>
            ${esc(order.included_toppings)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Extra toppings</span>
          <strong>
            ${esc(order.extra_toppings)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Extra topping cost</span>
          <strong>
            ${money(order.extra_topping_cost)}
          </strong>
        </div>

        <div class="detail-row">
          <span>Delivery fee</span>
          <strong>
            ${money(order.delivery_fee)}
          </strong>
        </div>

        <div class="detail-total">
          <span>Final total</span>
          <strong>
            ${money(order.total)}
          </strong>
        </div>
      </div>

      ${
        order.special_instructions
          ? `
            <div class="detail-section">
              <h3>Special Instructions</h3>

              <div class="instructions">
                ${esc(
                  order.special_instructions
                )}
              </div>
            </div>
          `
          : ""
      }

      <div class="detail-section">
        <h3>Update Status</h3>

        <div class="status-actions">

          ${[
            "new",
            "preparing",
            "in_oven",
            "ready",
            "completed",
            "cancelled"
          ]
            .map(
              (status) => `
                <button
                  class="status-btn ${
                    order.status === status
                      ? "active"
                      : ""
                  }"
                  data-status="${status}"
                  type="button"
                >
                  ${
                    status === "in_oven"
                      ? "IN OVEN"
                      : statusLabel(status)
                  }
                </button>
              `
            )
            .join("")}

        </div>
      </div>

    </div>
  `;

  $$(".status-btn").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          updateStatus(
            order.id,
            button.dataset.status
          );
        }
      );
    }
  );
}


/* =========================================
   FIXED STATUS UPDATE
   ========================================= */

async function updateStatus(id, status) {
  if (!supabaseClient) return;

  const { data, error } =
    await supabaseClient
      .from("pizza_orders")
      .update({
        status: status
      })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();

  if (error) {
    console.error(
      "Supabase status update failed:",
      error
    );

    showToast(
      "Could not update the order status."
    );

    return;
  }

  /*
    If no row was returned, do NOT throw an error.

    This prevents the PGRST116 / 406 problem.
    We simply reload the orders and see whether
    the update succeeded.
  */

  if (!data) {
    await loadOrders();

    const refreshed = state.orders.find(
      (order) =>
        String(order.id) === String(id)
    );

    if (
      refreshed &&
      refreshed.status === status
    ) {
      showToast(
        `Order ${orderNumber(
          id
        )} marked ${statusLabel(status)}.`
      );

      return;
    }

    showToast(
      "The order could not be updated. Check staff permissions."
    );

    return;
  }

  /*
    Update the local dashboard immediately.
  */

  const existing =
    state.orders.find(
      (order) =>
        String(order.id) ===
        String(id)
    );

  if (existing) {
    upsertOrder(
      {
        ...existing,
        status: status
      },
      false
    );
  } else {
    await loadOrders();
  }

  showToast(
    `Order ${orderNumber(
      id
    )} marked ${statusLabel(status)}.`
  );
}


/* =========================================
   LOAD ORDERS
   ========================================= */

async function loadOrders() {
  if (!supabaseClient) {
    $("#orders-list").innerHTML =
      '<div class="empty-state">Supabase is not configured.</div>';

    setConnection(false);

    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("pizza_orders")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(
      "Supabase order loading failed:",
      error
    );

    $("#orders-list").innerHTML =
      '<div class="empty-state">Unable to load orders. Check Supabase configuration and staff permissions.</div>';

    return;
  }

  state.orders = data || [];

  updateStats();
  renderOrders();
  renderDetails();
}


/* =========================================
   REALTIME
   ========================================= */

function upsertOrder(
  order,
  isNew = false
) {
  const index =
    state.orders.findIndex(
      (item) =>
        String(item.id) ===
        String(order.id)
    );

  if (index === -1) {
    state.orders.push(order);
  } else {
    state.orders[index] = order;
  }

  updateStats();

  if (isNew) {
    state.selectedId = order.id;
  }

  renderOrders();
  renderDetails();

  if (isNew) {
    showNewOrderAlert(order);
  }
}

function subscribeToOrders() {
  if (!supabaseClient) return;

  if (state.channel) {
    supabaseClient.removeChannel(
      state.channel
    );
  }

  state.channel =
    supabaseClient
      .channel("pizza-orders-live")

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pizza_orders"
        },
        (payload) => {
          upsertOrder(
            payload.new,
            true
          );
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pizza_orders"
        },
        (payload) => {
          upsertOrder(
            payload.new,
            false
          );
        }
      )

      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection(true);
        }

        if (
          [
            "CHANNEL_ERROR",
            "TIMED_OUT",
            "CLOSED"
          ].includes(status)
        ) {
          setConnection(false);

          setTimeout(
            () => subscribeToOrders(),
            2500
          );
        }
      });
}


/* =========================================
   FILTERS
   ========================================= */

function setupFilters() {
  $$("#filters .filter").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          state.filter =
            button.dataset.filter;

          $$("#filters .filter").forEach(
            (item) => {
              item.classList.toggle(
                "active",
                item === button
              );
            }
          );

          renderOrders();
        }
      );
    }
  );

  $("#order-search")?.addEventListener(
    "input",
    (event) => {
      state.search =
        event.target.value;

      renderOrders();
    }
  );
}


/* =========================================
   SOUND
   ========================================= */

function setupSound() {
  const button =
    $("#sound-toggle");

  if (!button) return;

  button.addEventListener(
    "click",
    () => {
      state.soundOn =
        !state.soundOn;

      button.textContent =
        state.soundOn
          ? "🔔 Sound On"
          : "🔕 Sound Off";

      button.setAttribute(
        "aria-pressed",
        String(state.soundOn)
      );

      if (state.soundOn) {
        playNotification();
      }
    }
  );
}


/* =========================================
   LOGIN
   ========================================= */

async function handleLogin(
  event
) {
  event.preventDefault();

  if (!supabaseClient) {
    $("#login-error").textContent =
      "Supabase is not configured.";

    return;
  }

  const email =
    $("#login-email").value.trim();

  const password =
    $("#login-password").value;

  const button =
    $("#login-button");

  button.disabled = true;
  button.textContent =
    "Signing in…";

  $("#login-error").textContent =
    "";

  const { error } =
    await supabaseClient.auth.signInWithPassword(
      {
        email,
        password
      }
    );

  if (error) {
    $("#login-error").textContent =
      error.message;
  }

  button.disabled = false;
  button.textContent =
    "Sign In";
}

async function handleLogout() {
  await supabaseClient?.auth.signOut();
}


/* =========================================
   DASHBOARD
   ========================================= */

function showDashboard(session) {
  $("#login-view").classList.toggle(
    "hidden",
    Boolean(session)
  );

  $("#dashboard-view").classList.toggle(
    "hidden",
    !session
  );

  if (session) {
    subscribeToOrders();
    loadOrders();
  } else if (
    state.channel &&
    supabaseClient
  ) {
    supabaseClient.removeChannel(
      state.channel
    );

    state.channel = null;
  }
}


/* =========================================
   INIT
   ========================================= */

async function init() {
  $("#login-form").addEventListener(
    "submit",
    handleLogin
  );

  $("#logout-button").addEventListener(
    "click",
    handleLogout
  );

  setupFilters();
  setupSound();

  if (!supabaseClient) return;

  const {
    data: { session }
  } =
    await supabaseClient.auth.getSession();

  showDashboard(session);

  supabaseClient.auth.onAuthStateChange(
    (_event, session) => {
      showDashboard(session);
    }
  );
}

init();
