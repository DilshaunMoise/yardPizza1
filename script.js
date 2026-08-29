// ============================================================
// PIZZA YARD — EASY CONFIGURATION
// ============================================================
// This file contains the browser-safe Supabase configuration and the existing Formspree endpoint.
// Do not replace the Supabase values with a secret/service-role key.
//
// Do NOT put email passwords, SMTP passwords, private API secrets,
// or private authentication tokens in this public JavaScript.
// ============================================================

const CONFIG = {
  businessName: "Pizza Yard",

  phones: [
    "7121777",
    "4603191",
    "5187562"
  ],

  location: "Ti Rocher, Castries, Saint Lucia",

  pizza: {
    size: '12"',
    cheesePizzaPrice: 20,
    oneToppingPrice: 20,
    twoToppingPrice: 25,
    includedToppings: 2,
    extraToppingPrice: 3
  },

  delivery: {
    minimumBoxes: 3,
    fee: 5
  },

  toppings: [
    "Corn",
    "Pepperoni",
    "Mushroom",
    "Tuna",
    "Bacon",
    "Ham",
    "Bell Peppers",
    "Sausage",
    "Veg"
  ],

  formspreeEndpoint: "https://formspree.io/f/xdenabwa",

  // Browser-safe Supabase configuration.
  supabaseUrl: "https://dsjskpqdofuhkzkylxqt.supabase.co",
  supabasePublishableKey: "sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk"
};

// Initialize the browser-safe Supabase client. Never use a service-role key here.
if (
  window.supabase &&
  CONFIG.supabaseUrl &&
  CONFIG.supabasePublishableKey
) {
  window.pizzaYardSupabase = window.supabase.createClient(
    CONFIG.supabaseUrl,
    CONFIG.supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

const TOPPING_ICONS = {
  "Corn": "🌽",
  "Pepperoni": "🔴",
  "Mushroom": "🍄",
  "Tuna": "🐟",
  "Bacon": "🥓",
  "Ham": "🍖",
  "Bell Peppers": "🫑",
  "Sausage": "🌭"
};

const state = {
  selectedToppings: [],
  quantity: 1,
  orderType: "pickup",
  submitting: false,
  trackingToken: null,
  trackingChannel: null,
  trackingPoll: null,
  lastTrackedStatus: null,
  notificationPermission: null,
  pizzaMode: "whole",
  leftToppings: [],
  rightToppings: [],
  toppingAvailability: {},
  cart: [],
  extras: {},
  birthday: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  form: $("#order-form"),
  toppingGrid: $("#topping-grid"),
  cheesePizza: $("#cheese-pizza"),
  selectedCount: $("#selected-count"),
  qtyMinus: $("#qty-minus"),
  qtyPlus: $("#qty-plus"),
  quantityOutput: $("#quantity-output"),
  orderTypeInputs: $$('input[name="orderType"]'),
  deliveryWarning: $("#delivery-warning"),
  addressWrap: $("#address-wrap"),
  address: $("#delivery-address"),
  toppingsError: $("#toppings-error"),
  addressError: $("#address-error"),
  name: $("#full-name"),
  phone: $("#phone"),
  email: $("#email"),
  instructions: $("#instructions"),
  submissionError: $("#submission-error"),
  placeOrder: $("#place-order"),
  summaryToppingCount: $("#summary-topping-count"),
  summaryToppingsList: $("#summary-toppings-list"),
  summaryBase: $("#summary-base"),
  summaryIncluded: $("#summary-included"),
  summaryExtraCount: $("#summary-extra-count"),
  summaryExtraCost: $("#summary-extra-cost"),
  summaryQuantity: $("#summary-quantity"),
  summaryDelivery: $("#summary-delivery"),
  summaryExtras: $("#summary-extras"),
  birthday: $("#birthday"),
  summaryTotal: $("#summary-total"),
  deliverySummary: $("#delivery-summary"),
  successModal: $("#success-modal"),
  successTotal: $("#success-total"),
  anotherOrder: $("#another-order"),
  modalClose: $("#modal-close"),
  year: $("#year"),
  navToggle: $(".nav-toggle"),
  navMenu: $("#nav-menu"),
  wholeBuilder: $("#whole-builder"),
  halfBuilder: $("#half-builder"),
  cartList: $("#pizza-cart-list"),
  addAnotherPizza: $("#add-another-pizza"),
  cartCount: $("#pizza-cart-count"),
  leftToppingGrid: $("#left-topping-grid"),
  rightToppingGrid: $("#right-topping-grid")
};

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function uniqueToppings() {
  return [...new Set(state.pizzaMode === "whole"
    ? state.selectedToppings
    : [...state.leftToppings, ...state.rightToppings])];
}

function calculatePizzaUnitPrice(toppingCount) {
  if (toppingCount === 0) return CONFIG.pizza.cheesePizzaPrice;
  if (toppingCount === 1) return CONFIG.pizza.oneToppingPrice;
  return CONFIG.pizza.twoToppingPrice +
    Math.max(0, toppingCount - CONFIG.pizza.includedToppings) * CONFIG.pizza.extraToppingPrice;
}

function currentPizzaSnapshot() {
  const toppingCount = uniqueToppings().length;
  const unitPrice = calculatePizzaUnitPrice(toppingCount);
  const includedToppings = Math.min(toppingCount, CONFIG.pizza.includedToppings);
  const extraToppings = Math.max(0, toppingCount - CONFIG.pizza.includedToppings);
  const extraToppingCost = extraToppings * CONFIG.pizza.extraToppingPrice;
  return {
    mode: state.pizzaMode,
    toppings: [...state.selectedToppings],
    left: [...state.leftToppings],
    right: [...state.rightToppings],
    quantity: state.quantity,
    toppingCount, unitPrice, includedToppings, extraToppings, extraToppingCost
  };
}

function pizzaLabel(pizza, index) {
  if (pizza.mode === "half") {
    return `Pizza ${index + 1}: Left — ${pizza.left.length ? pizza.left.join(", ") : "Cheese"} | Right — ${pizza.right.length ? pizza.right.join(", ") : "Cheese"}`;
  }
  return `Pizza ${index + 1}: ${pizza.toppings.length ? pizza.toppings.join(", ") : "Cheese Pizza"}`;
}

function cartBoxes() {
  return state.cart.reduce((sum, p) => sum + Number(p.quantity || 1), 0) + Number(state.quantity || 1);
}

function calculateOrder() {
  const current = currentPizzaSnapshot();
  const pizzas = [...state.cart, current];
  const pizzasSubtotal = pizzas.reduce((sum, p) => sum + Number(p.unitPrice) * Number(p.quantity || 1), 0);
  const totalToppingCount = pizzas.reduce((sum, p) => sum + Number(p.toppingCount || 0) * Number(p.quantity || 1), 0);
  const includedToppings = pizzas.reduce((sum, p) => sum + Number(p.includedToppings || 0) * Number(p.quantity || 1), 0);
  const extraToppings = pizzas.reduce((sum, p) => sum + Number(p.extraToppings || 0) * Number(p.quantity || 1), 0);
  const extraToppingCost = pizzas.reduce((sum, p) => sum + Number(p.extraToppingCost || 0) * Number(p.quantity || 1), 0);
  const boxes = pizzas.reduce((sum, p) => sum + Number(p.quantity || 1), 0);
  const extras = {};
  const extrasTotal = 0;
  const deliveryFee = state.orderType === "delivery" && boxes >= CONFIG.delivery.minimumBoxes ? CONFIG.delivery.fee : 0;
  return { toppingCount: totalToppingCount, unitPrice: current.unitPrice, includedToppings, extraToppings, extraToppingCost, pizzasSubtotal, extras, extrasTotal, deliveryFee, total: pizzasSubtotal + extrasTotal + deliveryFee, boxes, pizzas };
}

function toppingButton(topping, selected, clickHandler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "topping-option";
  const available = state.toppingAvailability[topping] !== false;
  button.disabled = false;
  button.classList.toggle("sold-out", !available);
  button.setAttribute("aria-pressed", String(selected));
  button.innerHTML = `<span class="topping-visual" aria-hidden="true">${TOPPING_ICONS[topping] || "🍕"}</span><span>${escapeHtml(topping)}</span>${available ? "" : "<small>SOLD OUT • NOTIFY ME</small>"}<span class="topping-check" aria-hidden="true">✓</span>`;
  if (selected) button.classList.add("selected");
  if (available) button.addEventListener("click", clickHandler);
  else button.addEventListener("click",()=>requestBackInStock(topping));
  return button;
}

function renderToppingGrid(grid, selected, clickHandler, includeCheese = false) {
  grid.innerHTML = "";
  if (includeCheese) {
    const cheese = document.createElement("button");
    cheese.type = "button"; cheese.className = "topping-option cheese-option";
    cheese.setAttribute("aria-pressed", String(selected.length === 0));
    cheese.innerHTML = `<span class="topping-visual" aria-hidden="true">🧀</span><span>Cheese Pizza</span><small>12\" • ${money(CONFIG.pizza.cheesePizzaPrice)}</small><span class="topping-check" aria-hidden="true">✓</span>`;
    if (selected.length === 0) cheese.classList.add("selected");
    cheese.addEventListener("click", clickHandler);
    grid.appendChild(cheese);
  }
  CONFIG.toppings.forEach(t => grid.appendChild(toppingButton(t, selected.includes(t), () => clickHandler(t))));
}

function renderToppings() {
  renderToppingGrid(elements.toppingGrid, state.selectedToppings, (topping) => {
    if (typeof topping !== "string") state.selectedToppings = [];
    else state.selectedToppings = state.selectedToppings.includes(topping)
      ? state.selectedToppings.filter(x => x !== topping) : [...state.selectedToppings, topping];
    elements.toppingsError.textContent = ""; renderToppings(); updateUI();
  }, true);
  renderToppingGrid(elements.leftToppingGrid, state.leftToppings, (topping) => {
    if (typeof topping !== "string") state.leftToppings = [];
    else state.leftToppings = state.leftToppings.includes(topping)
      ? state.leftToppings.filter(x => x !== topping) : [...state.leftToppings, topping];
    elements.toppingsError.textContent = ""; renderToppings(); updateUI();
  });
  renderToppingGrid(elements.rightToppingGrid, state.rightToppings, (topping) => {
    if (typeof topping !== "string") state.rightToppings = [];
    else state.rightToppings = state.rightToppings.includes(topping)
      ? state.rightToppings.filter(x => x !== topping) : [...state.rightToppings, topping];
    elements.toppingsError.textContent = ""; renderToppings(); updateUI();
  });
  elements.wholeBuilder.classList.toggle("hidden", state.pizzaMode !== "whole");
  elements.halfBuilder.classList.toggle("hidden", state.pizzaMode !== "half");
  $$(".pizza-mode-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === state.pizzaMode));
}

function toggleTopping(topping) {
  state.selectedToppings = state.selectedToppings.includes(topping)
    ? state.selectedToppings.filter((item) => item !== topping) : [...state.selectedToppings, topping];
  elements.toppingsError.textContent = ""; renderToppings(); updateUI();
}

function updateQuantity(nextQuantity) {
  state.quantity = Math.max(1, Number(nextQuantity) || 1);
  elements.quantityOutput.value = state.quantity;
  elements.quantityOutput.textContent = state.quantity;
  updateDeliveryUI();
  updateUI();
}

function updateOrderType() {
  const selected = elements.orderTypeInputs.find((input) => input.checked);
  state.orderType = selected ? selected.value : "pickup";
  updateDeliveryUI();
  updateUI();
}

function updateDeliveryUI() {
  const isDelivery = state.orderType === "delivery";
  const eligible = cartBoxes() >= CONFIG.delivery.minimumBoxes;

  $$(".type-option").forEach((label) => {
    const input = label.querySelector("input");
    label.classList.toggle("selected", input.checked);
  });

  elements.addressWrap.classList.toggle("hidden", !isDelivery);
  elements.address.required = isDelivery;

  const showWarning = isDelivery && !eligible;
  elements.deliveryWarning.classList.toggle("visible", showWarning);

  if (showWarning) {
    elements.deliveryWarning.textContent =
      `Delivery is available for orders of ${CONFIG.delivery.minimumBoxes} boxes and up.`;
  }

  if (!isDelivery) {
    elements.addressError.textContent = "";
  }
}

function renderPizzaCart() {
  if (!elements.cartList) return;
  const items = state.cart;
  elements.cartList.innerHTML = items.length ? items.map((p, i) => {
    const label = pizzaLabel(p, i);
    return `<div class="pizza-cart-item"><div><strong>🍕 ${escapeHtml(label)}</strong><small>${p.quantity} box${p.quantity === 1 ? "" : "es"} • ${money(p.unitPrice * p.quantity)}</small></div><button type="button" class="cart-remove" data-cart-index="${i}" aria-label="Remove pizza ${i + 1}">Remove</button></div>`;
  }).join("") : '<p class="muted">No additional pizzas yet. Build your first pizza above.</p>';
  elements.cartCount.textContent = String(items.length);
  elements.cartList.querySelectorAll(".cart-remove").forEach(btn => btn.addEventListener("click", () => {
    state.cart.splice(Number(btn.dataset.cartIndex), 1);
    renderPizzaCart(); updateDeliveryUI(); updateUI();
  }));
}

function updateUI() {
  const order = calculateOrder();
  elements.selectedCount.textContent = uniqueToppings().length;
  elements.summaryToppingCount.textContent = `${order.toppingCount} topping${order.toppingCount === 1 ? "" : "s"} across ${order.boxes} box${order.boxes === 1 ? "" : "es"}`;
  if (order.pizzas.length > 1) {
    elements.summaryToppingsList.innerHTML = order.pizzas.map((p, i) => `<span class="summary-chip">${escapeHtml(pizzaLabel(p, i))}${p.quantity > 1 ? ` ×${p.quantity}` : ""}</span>`).join("");
  } else if (state.pizzaMode === "half") {
    elements.summaryToppingsList.innerHTML = `<span class="summary-chip">Left: ${state.leftToppings.length ? state.leftToppings.map(escapeHtml).join(", ") : "Cheese"}</span><span class="summary-chip">Right: ${state.rightToppings.length ? state.rightToppings.map(escapeHtml).join(", ") : "Cheese"}</span>`;
  } else {
    elements.summaryToppingsList.innerHTML = state.selectedToppings.length ? state.selectedToppings.map(t => `<span class="summary-chip">${escapeHtml(t)}</span>`).join("") : '<span class="summary-chip">Cheese Pizza</span>';
  }
  elements.summaryBase.textContent = money(order.pizzasSubtotal);
  elements.summaryIncluded.textContent = order.includedToppings;
  elements.summaryExtraCount.textContent = order.extraToppings;
  elements.summaryExtraCost.textContent = money(order.extraToppingCost);
  elements.summaryQuantity.textContent = order.boxes;
  elements.summaryDelivery.textContent = money(order.deliveryFee);
  elements.summaryTotal.textContent = money(order.total);
  elements.deliverySummary.textContent = state.orderType === "delivery" ? (order.boxes >= CONFIG.delivery.minimumBoxes ? `Delivery fee: ${money(order.deliveryFee)}.` : `Delivery requires ${CONFIG.delivery.minimumBoxes} boxes. You currently have ${order.boxes}.`) : "Pickup selected — no delivery fee.";
  renderPizzaCart();
}

function addCurrentPizza() {
  if (state.pizzaMode === "half" && (!state.leftToppings.length || !state.rightToppings.length)) {
    elements.toppingsError.textContent = "Choose at least one topping on each half, or switch back to Whole Pizza.";
    return;
  }
  state.cart.push(currentPizzaSnapshot());
  state.selectedToppings = []; state.leftToppings = []; state.rightToppings = []; state.pizzaMode = "whole"; state.quantity = 1;
  elements.quantityOutput.value = 1; elements.quantityOutput.textContent = 1; elements.toppingsError.textContent = "";
  renderToppings(); updateDeliveryUI(); updateUI();
  document.querySelector("#builder")?.scrollIntoView({behavior:"smooth", block:"start"});
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSaintLuciaPhone(value) {
  return String(value).replace(/[\s()-]/g, "");
}

function isValidPhone(value) {
  const normalized = normalizeSaintLuciaPhone(value);
  return /^\d{7}$/.test(normalized);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function clearErrors() {
  elements.toppingsError.textContent = "";
  elements.addressError.textContent = "";
  elements.submissionError.textContent = "";
  $("#name-error").textContent = "";
  $("#phone-error").textContent = "";
  $("#email-error").textContent = "";
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!elements.name.value.trim()) {
    $("#name-error").textContent = "Full name is required.";
    valid = false;
  }

  if (!elements.phone.value.trim()) {
    $("#phone-error").textContent = "Phone number is required.";
    valid = false;
  } else if (!isValidPhone(elements.phone.value)) {
    $("#phone-error").textContent = "Enter a valid 7-digit Saint Lucia phone number.";
    valid = false;
  }

  if (elements.email.value.trim() && !isValidEmail(elements.email.value)) {
    $("#email-error").textContent = "Enter a valid email address, or leave it blank.";
    valid = false;
  }

  if (state.pizzaMode === "half" && (!state.leftToppings.length || !state.rightToppings.length)) {
    elements.toppingsError.textContent = "Choose at least one topping on each half, or switch back to Whole Pizza.";
    valid = false;
  }

  if (state.orderType === "delivery") {
    if (cartBoxes() < CONFIG.delivery.minimumBoxes) {
      elements.deliveryWarning.classList.add("visible");
      valid = false;
    }

    if (!elements.address.value.trim()) {
      elements.addressError.textContent = "Delivery address is required.";
      valid = false;
    }
  }

  return valid;
}

function buildOrderDetails() {
  const order = calculateOrder();
  const customerName = elements.name.value.trim();
  const customerPhone = normalizeSaintLuciaPhone(elements.phone.value);
  const customerEmail = elements.email.value.trim();
  const address = elements.address.value.trim();
  const instructions = elements.instructions.value.trim();

  return {
    customerName,
    customerPhone,
    customerEmail,
    orderType: state.orderType,
    address,
    instructions,
    birthday: elements.birthday?.value || "",
    ...order,
    pizzas: order.pizzas
  };
}

function buildEmailBody(details) {
  const pizzaLines = details.pizzas.map((pizza, i) => `Pizza ${i + 1} (${pizza.quantity} box${pizza.quantity === 1 ? "" : "es"}): ${pizza.mode === "half" ? `Left: ${pizza.left.join(", ") || "Cheese"} | Right: ${pizza.right.join(", ") || "Cheese"}` : (pizza.toppings.join(", ") || "Cheese Pizza")} — ${money(pizza.unitPrice * pizza.quantity)}`).join("\n");
  return [
    "NEW PIZZA ORDER 🍕", "", "BUSINESS", `Business: ${CONFIG.businessName}`, `Location: ${CONFIG.location}`, "",
    "CUSTOMER", `Name: ${details.customerName}`, `Phone: ${details.customerPhone}`, `Email: ${details.customerEmail}`, "",
    "ORDER", `Total pizzas/boxes: ${details.boxes}`, pizzaLines, `Order type: ${state.orderType === "delivery" ? "Delivery" : "Pickup"}`, `Delivery fee: ${money(details.deliveryFee)}`, ...(state.orderType === "delivery" ? [`Delivery address: ${details.address}`] : []), `Special instructions: ${details.instructions || "None"}`, "", `TOTAL: ${money(details.total)}`
  ].join("\n");
}

function setSubmitting(isSubmitting) {
  state.submitting = isSubmitting;
  elements.form.classList.toggle("is-submitting", isSubmitting);
  elements.placeOrder.disabled = isSubmitting;
}

function createTrackingToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function saveOrderToSupabase(details) {
  if (!window.pizzaYardSupabase) throw new Error("Supabase is not configured.");
  state.trackingToken = createTrackingToken();
  const toppingsSummary = details.pizzas.map((p, i) => pizzaLabel(p, i));
  const payload = {
    customer_name: details.customerName, customer_phone: details.customerPhone, customer_email: details.customerEmail,
    order_type: details.orderType, delivery_address: details.address || null, pizza_size: CONFIG.pizza.size,
    toppings: toppingsSummary, order_source: "online", topping_count: details.toppingCount,
    unit_price: details.pizzasSubtotal / Math.max(1, details.boxes), included_toppings: details.includedToppings,
    extra_toppings: details.extraToppings, extra_topping_cost: details.extraToppingCost, quantity: details.boxes,
    delivery_fee: details.deliveryFee, special_instructions: details.instructions || null, total: details.total, status: "new", tracking_token: state.trackingToken,
    order_details: JSON.stringify({pizzas: details.pizzas, extras: details.extras, birthday: details.birthday || null}), extras: details.extras || {}
  };
  const { error } = await window.pizzaYardSupabase.from("pizza_orders").insert(payload);
  if (error) { console.error("Supabase order save failed:", error); throw new Error("We couldn't receive your order right now. Please try again."); }
  localStorage.setItem("pizzaYardTrackingToken", state.trackingToken);
  return state.trackingToken;
}

async function sendFormspreeBackup(details) {
  if (!CONFIG.formspreeEndpoint || CONFIG.formspreeEndpoint === "YOUR_EMAIL_SERVICE_ENDPOINT") return false;
  const body = buildEmailBody(details); const formData = new FormData();
  formData.append("_subject", `New Pizza Yard Order — ${details.customerName}`);
  formData.append("customer_name", details.customerName); formData.append("customer_phone", details.customerPhone); formData.append("customer_email", details.customerEmail);
  formData.append("order_type", details.orderType); formData.append("delivery_address", details.address || "N/A"); formData.append("pizza_size", CONFIG.pizza.size);
  formData.append("toppings", details.pizzas.map((p,i)=>pizzaLabel(p,i)).join("\n")); formData.append("number_of_toppings", String(details.toppingCount));
  formData.append("quantity", String(details.boxes)); formData.append("delivery_fee", money(details.deliveryFee)); formData.append("special_instructions", details.instructions || "None");
  formData.append("total", money(details.total)); formData.append("order_details", body);
  const response = await fetch(CONFIG.formspreeEndpoint, { method: "POST", body: formData, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Formspree backup failed."); return true;
}

async function submitOrder(details) {
  if (!window.pizzaYardSupabase ||
      !CONFIG.supabaseUrl ||
      !CONFIG.supabasePublishableKey) {
    throw new Error("Supabase is not configured.");
  }

  // Supabase is the source of truth. Formspree is a backup notification.
  // If Formspree fails after the DB insert, do not make the customer resubmit.
  const savedOrder = await saveOrderToSupabase(details);

  try {
    await sendFormspreeBackup(details);
  } catch (error) {
    console.warn("Order saved to Supabase, but Formspree backup failed:", error);
  }

  return savedOrder;
}


const TRACKING_STEPS = [
  { key: "new", label: "Order Received", icon: "✓", message: "We've received your order." },
  { key: "preparing", label: "Preparing", icon: "👨‍🍳", message: "Our kitchen is preparing your pizza." },
  { key: "in_oven", label: "In the Oven", icon: "🔥", message: "Your pizza is cooking now." },
  { key: "ready", label: "Ready", icon: "📦", message: "Your pizza is ready for pickup or delivery." },
  { key: "completed", label: "Completed", icon: "🎉", message: "Enjoy your Pizza Yard order!" }
];

const ORDER_NOTIFICATION_MESSAGES = {
  new: { title: "Order Received 🍕", body: "We've received your Pizza Yard order." },
  preparing: { title: "Your order is being prepared 👨‍🍳", body: "The Pizza Yard kitchen is preparing your order now." },
  in_oven: { title: "Your pizza is in the oven 🔥", body: "Your Pizza Yard order is cooking now." },
  ready: { title: "Your order is ready! ✅", body: "Your Pizza Yard order is ready for pickup or delivery." },
  completed: { title: "Order completed 🎉", body: "Enjoy your Pizza Yard order!" },
  cancelled: { title: "Order cancelled", body: "Your Pizza Yard order was cancelled. Please contact us if you need help." }
};

function updateNotificationUI() {
  const btn = $("#enable-notifications");
  const status = $("#notification-status");
  if (!btn || !status) return;
  if (!("Notification" in window)) {
    btn.disabled = true;
    btn.textContent = "NOT SUPPORTED";
    status.textContent = "Your browser does not support notifications.";
    return;
  }
  state.notificationPermission = Notification.permission;
  if (Notification.permission === "granted") {
    btn.textContent = "🔔 NOTIFICATIONS ON";
    btn.disabled = true;
    status.textContent = "You'll be notified when your order status changes.";
  } else if (Notification.permission === "denied") {
    btn.textContent = "NOTIFICATIONS BLOCKED";
    btn.disabled = true;
    status.textContent = "Notifications are blocked in your browser settings.";
  } else {
    btn.disabled = false;
    btn.textContent = "TURN ON NOTIFICATIONS";
    status.textContent = "Get a browser notification when your order changes.";
  }
}

async function enableOrderNotifications() {
  if (!("Notification" in window)) { updateNotificationUI(); return; }
  try {
    const permission = await Notification.requestPermission();
    state.notificationPermission = permission;
    updateNotificationUI();
    if (permission === "granted") {
      const notification = new Notification("Pizza Yard notifications are on 🔔", {
        body: "We'll let you know when your order status changes.",
        tag: "pizza-yard-notification-enabled"
      });
      notification.onclick = () => window.focus();
    }
  } catch (error) {
    console.warn("Notification permission request failed:", error);
  }
}

function notifyOrderStatus(status) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const message = ORDER_NOTIFICATION_MESSAGES[status];
  if (!message) return;
  try {
    const notification = new Notification(`Pizza Yard • ${message.title}`, {
      body: message.body,
      tag: `pizza-yard-order-${state.trackingToken}-${status}`,
      renotify: true
    });
    notification.onclick = () => { window.focus(); notification.close(); };
  } catch (error) {
    console.warn("Could not show order notification:", error);
  }
}

function trackerStepIndex(status) {
  if (status === "cancelled") return -1;
  const i = TRACKING_STEPS.findIndex((step) => step.key === status);
  return i < 0 ? 0 : i;
}

function renderTracker(status, customerName = "") {
  const wrap = $("#order-tracker");
  if (!wrap) return;

  if (status === "cancelled") {
    wrap.innerHTML = `
      <div class="tracker-cancelled">
        <strong>Order cancelled</strong>
        <span>Please contact Pizza Yard if you need help with this order.</span>
      </div>`;
    return;
  }

  const current = trackerStepIndex(status);
  const step = TRACKING_STEPS[current];
  const percent = (current / (TRACKING_STEPS.length - 1)) * 100;

  wrap.innerHTML = `
    <div class="tracker-heading">
      <div>
        <span class="eyebrow">LIVE ORDER STATUS</span>
        <strong>${step.label}</strong>
      </div>
      <span class="tracker-current">${step.icon}</span>
    </div>
    <div class="tracker-bar" aria-label="Order progress">
      <span style="width:${percent}%"></span>
    </div>
    <div class="tracker-steps">
      ${TRACKING_STEPS.map((item, i) => `
        <div class="tracker-step ${i <= current ? "done" : ""} ${i === current ? "current" : ""}">
          <span>${i <= current ? "✓" : i + 1}</span>
          <small>${item.label}</small>
        </div>`).join("")}
    </div>
    <p class="tracker-message">${step.message}${customerName ? ` ${escapeHtml(customerName.split(" ")[0])}.` : ""}</p>
  `;
}

async function fetchTrackedOrder() {
  if (!state.trackingToken || !window.pizzaYardSupabase) return;
  const { data, error } = await window.pizzaYardSupabase
    .rpc("get_pizza_order_status", { p_tracking_token: state.trackingToken });

  if (!error && data && data.length) {
    const order = data[0];
    const nextStatus = order.status;
    if (state.lastTrackedStatus === null) {
      state.lastTrackedStatus = nextStatus;
    } else if (nextStatus !== state.lastTrackedStatus) {
      state.lastTrackedStatus = nextStatus;
      notifyOrderStatus(nextStatus);
    }
    renderTracker(nextStatus, order.customer_name);
  }
}

function startOrderTracking() {
  if (!state.trackingToken || !window.pizzaYardSupabase) return;
  state.lastTrackedStatus = null;
  renderTracker("new");
  updateNotificationUI();
  fetchTrackedOrder();
  clearInterval(state.trackingPoll);
  state.trackingPoll = setInterval(fetchTrackedOrder, 5000);
}

function stopOrderTracking() {
  clearInterval(state.trackingPoll);
  state.trackingPoll = null;
}

function openSuccessModal(total) {
  elements.successTotal.textContent = money(total);
  const code = state.trackingToken ? state.trackingToken.slice(0, 8).toUpperCase() : "";
  const codeEl = $("#tracking-code");
  if (codeEl) codeEl.textContent = code;
  renderTracker("new", elements.name.value.trim());
  elements.successModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  startOrderTracking();
  elements.modalClose.focus();
}

function closeSuccessModal() {
  elements.successModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  stopOrderTracking();
}

function resetOrder() {
  state.selectedToppings = [];
  state.leftToppings = [];
  state.rightToppings = [];
  state.pizzaMode = "whole";
  state.quantity = 1;
  state.orderType = "pickup";
  state.cart = [];
  state.extras = {};
  state.birthday = "";
  elements.form.reset();
  elements.orderTypeInputs[0].checked = true;
  elements.address.required = false;
  elements.submissionError.textContent = "";
  clearErrors();
  renderToppings();
  updateDeliveryUI();
  updateUI();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;

  if (!validateForm()) {
    const firstError = $(".field-error:not(:empty), .submission-error:not(:empty)");
    if (firstError) {
      const associated = firstError.previousElementSibling;
      if (associated && typeof associated.focus === "function") associated.focus();
    }
    return;
  }

  const details = buildOrderDetails();

  setSubmitting(true);
  elements.submissionError.textContent = "";

  try {
    await submitOrder(details);
    openSuccessModal(details.total);
  } catch (error) {
    console.error("Pizza Yard order submission failed:", error);
    elements.submissionError.textContent =
      error.message === "Formspree endpoint is not configured."
        ? "Online ordering is not configured yet. Please try again after adding the Formspree endpoint."
        : "We couldn't send your order right now. Please try again.";
  } finally {
    setSubmitting(false);
  }
}

async function requestBackInStock(topping){
  const email=prompt(`Notify me when ${topping} is back in stock. Enter your email (or Cancel):`);
  if(email===null)return;
  const clean=String(email).trim();
  if(clean&&!isValidEmail(clean)){alert('Please enter a valid email address.');return;}
  const phone=prompt('Optional: enter your 7-digit Saint Lucia phone number, or leave blank.');
  if(phone&& !isValidPhone(phone)){alert('Please enter a valid 7-digit phone number.');return;}
  if(window.pizzaYardSupabase){
    const {error}=await window.pizzaYardSupabase.from('back_in_stock_requests').insert({topping_name:topping,customer_name:elements.name?.value.trim()||null,customer_phone:phone?normalizeSaintLuciaPhone(phone):null,customer_email:clean||null});
    if(error){console.warn('Back-in-stock request failed:',error);showGrowthMessage('We could not save that request right now.');return;}
  }
  showGrowthMessage(`We'll keep your request for ${topping}. 🔔`);
}

async function loadToppingAvailability() {
  if (!window.pizzaYardSupabase) return;
  try {
    const { data, error } = await window.pizzaYardSupabase.from("pizza_topping_availability").select("name,available");
    if (error || !data) return;
    state.toppingAvailability = Object.fromEntries(data.map(row => [row.name, row.available !== false]));
    renderToppings(); updateUI();
  } catch (error) { console.warn("Topping availability could not be loaded:", error); }
}

async function loadPublicReviews(){const el=$("#reviews-list");if(!el||!window.pizzaYardSupabase)return;const{data,error}=await window.pizzaYardSupabase.from("pizza_reviews").select("id,display_name,rating,comment,created_at").eq("approved",true).order("created_at",{ascending:false}).limit(20);if(error){console.error("Public reviews error",error);el.innerHTML='<p class="muted">Reviews are temporarily unavailable.</p>';return}if(!data?.length){el.innerHTML='<p class="muted">Be the first to leave a review. ⭐</p>';return}el.innerHTML=data.map(r=>{const comment=String(r.comment||"").trim();return `<article class="review-card"><div class="review-card-top"><strong>${esc(r.display_name||"Customer")}</strong><span class="review-stars">${"★".repeat(Number(r.rating))}${"☆".repeat(5-Number(r.rating))}</span></div><p class="review-comment">${esc(comment)}</p><small class="muted">${new Date(r.created_at).toLocaleDateString()}</small></article>`}).join("")}
async function submitReview(e){e.preventDefault();const msg=$("#review-form-message");msg.textContent="";const rating=Number($("#review-rating").value),name=$("#review-name").value.trim()||"Customer",comment=$("#review-comment").value.trim();if(!comment)return msg.textContent="Please write a review.";const{error}=await window.pizzaYardSupabase.from("pizza_reviews").insert({display_name:name,rating,comment,approved:false});if(error){msg.textContent="We couldn't submit your review right now. Please try again.";return}$("#review-form").reset();$("#review-rating").value="5";msg.textContent="Thanks! Your review was submitted for approval. ⭐"}
function setupNavigation() {
  elements.navToggle.addEventListener("click", () => {
    const open = elements.navMenu.classList.toggle("open");
    elements.navToggle.setAttribute("aria-expanded", String(open));
    elements.navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  });

  $$("#nav-menu a").forEach((link) => {
    link.addEventListener("click", () => {
      elements.navMenu.classList.remove("open");
      elements.navToggle.setAttribute("aria-expanded", "false");
      elements.navToggle.setAttribute("aria-label", "Open navigation");
    });
  });
}

function init() {
  elements.year.textContent = new Date().getFullYear();

  renderToppings();
  updateDeliveryUI();
  updateUI();

  elements.qtyMinus.addEventListener("click", () => updateQuantity(state.quantity - 1));
  elements.qtyPlus.addEventListener("click", () => updateQuantity(state.quantity + 1));
  elements.orderTypeInputs.forEach((input) => input.addEventListener("change", updateOrderType));
  elements.form.addEventListener("submit", handleSubmit);
  $$(".pizza-mode-btn").forEach(btn => btn.addEventListener("click", (event) => {
    event.preventDefault();
    const mode = btn.dataset.mode;
    if (mode !== "whole" && mode !== "half") return;
    state.pizzaMode = mode;
    elements.toppingsError.textContent = "";
    renderToppings();
    updateUI();
  }));
  loadToppingAvailability();
  loadPublicReviews();
  $("#review-form")?.addEventListener("submit",submitReview);$("#post-order-review")?.addEventListener("click",()=>{document.querySelector("#reviews")?.scrollIntoView({behavior:"smooth"});document.querySelector("#review-comment")?.focus()});

  elements.addAnotherPizza?.addEventListener("click", addCurrentPizza);

  elements.anotherOrder.addEventListener("click", () => {
    closeSuccessModal();
    resetOrder();
    document.querySelector("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#enable-notifications")?.addEventListener("click", enableOrderNotifications);
  updateNotificationUI();

  elements.modalClose.addEventListener("click", closeSuccessModal);
  elements.successModal.addEventListener("click", (event) => {
    if (event.target === elements.successModal) closeSuccessModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.successModal.classList.contains("hidden")) {
      closeSuccessModal();
    }
  });

  setupNavigation();
}

init();

// ============================================================
// Pizza Yard Rewards
// ============================================================
async function ensureRewardsMemberFromOrder() {
  const join = document.querySelector('#join-rewards');
  if (!join?.checked || !window.pizzaYardSupabase) return;
  try {
    await window.pizzaYardSupabase.rpc('ensure_rewards_member', {
      p_name: elements.name.value.trim() || 'Walk-in Customer', p_phone: normalizeSaintLuciaPhone(elements.phone.value), p_email: elements.email.value.trim(), p_birthday: elements.birthday?.value || null
    });
  } catch (error) { console.warn('Rewards signup could not be saved:', error); }
}

async function checkRewards(e) {
  e.preventDefault();
  const msg = $('#rewards-message'), result = $('#rewards-result');
  msg.textContent = ''; result.classList.add('hidden');
  const name = $('#rewards-name').value.trim(), phone = normalizeSaintLuciaPhone($('#rewards-phone').value);
  if (!name || !isValidPhone(phone)) { msg.textContent = 'Enter your name and a valid 7-digit Saint Lucia phone number.'; return; }
  if (!window.pizzaYardSupabase) { msg.textContent = 'Rewards are temporarily unavailable.'; return; }
  const { data, error } = await window.pizzaYardSupabase.rpc('get_rewards_summary', { p_name:name, p_phone:phone });
  if (error || !data?.length) { msg.textContent = 'We could not find a rewards account yet. Join Rewards when placing your next order, then check again after it is completed.'; return; }
  const r=data[0], points=Number(r.points||0), next=Number(r.next_reward_points||0), pct=next?Math.min(100,Math.round((points/next)*100)):100;
  result.innerHTML = `<div class="rewards-points">${points} points</div><strong>${escapeHtml(r.available_reward||'Keep earning points')}</strong>${next?`<div class="rewards-progress"><span style="width:${pct}%"></span></div><p>${Math.max(0,next-points)} more points to ${escapeHtml(r.next_reward_label)}</p>`:'<p>🎉 You have reached every current reward level.</p>'}<div class="rewards-actions"><button type="button" data-reward="five_off" ${points<100?'disabled':''}>Redeem $5 OFF</button><button type="button" data-reward="ten_off" ${points<200?'disabled':''}>Redeem $10 OFF</button><button type="button" data-reward="free_pizza" ${points<300?'disabled':''}>Redeem Free Pizza</button></div><small class="muted">${Number(r.completed_orders||0)} completed orders • ${Number(r.streak_weeks||0)}-week streak. Birthday bonus: 50 points on your birthday.</small><small class="muted">Redeemed rewards give you a one-time code to show Pizza Yard staff.</small>`;
  result.classList.remove('hidden');
  result.querySelectorAll('[data-reward]').forEach(btn=>btn.addEventListener('click',()=>redeemReward(name,phone,btn.dataset.reward,btn,result)));
}
async function redeemReward(name,phone,key,btn,result){
  btn.disabled=true;
  const {data,error}=await window.pizzaYardSupabase.rpc('redeem_rewards',{p_name:name,p_phone:phone,p_reward_key:key});
  if(error||!data?.length){ alert(error?.message||'Unable to redeem this reward.'); btn.disabled=false; return; }
  const r=data[0]; result.insertAdjacentHTML('afterbegin',`<div class="reward-code"><strong>🎁 ${escapeHtml(r.reward_label)}</strong><div style="font-size:28px;font-weight:900;letter-spacing:.12em;margin:6px 0">${escapeHtml(r.code)}</div><small>Show this code to Pizza Yard staff. It can only be used once.</small></div>`);
  document.querySelector('#rewards-message').textContent='Reward redeemed successfully!';
}

// Hook into the existing successful order flow without changing the order submission.
const originalOpenSuccessModal = openSuccessModal;
openSuccessModal = function(total){ ensureRewardsMemberFromOrder(); return originalOpenSuccessModal(total); };

document.addEventListener('DOMContentLoaded',()=>{
  $('#rewards-form')?.addEventListener('submit',checkRewards);
});


// ============================================================
// Pizza Yard Customer Growth Features — favorites, reorder,
// combos, specials, secret menu, mystery rewards and back-in-stock.
// These are additive and use the existing ordering flow.
// ============================================================
function renderExtras(){
}
const PY_GROWTH_KEY='pizzaYardFavoritesV1';
const PY_LAST_ORDER_KEY='pizzaYardLastOrderV1';
const PY_COMBOS=[
  {id:'family',name:'Family Yard Combo',tag:'BEST VALUE',desc:'Two classic two-topping 12" pizzas, built for sharing.',pizzas:[{mode:'whole',toppings:['Pepperoni','Mushroom'],quantity:1},{mode:'whole',toppings:['Ham','Bell Peppers'],quantity:1}]},
  {id:'lunch',name:'Yard Lunch Combo',tag:'POPULAR',desc:'A two-topping 12" pizza made for a quick, satisfying lunch.',pizzas:[{mode:'whole',toppings:['Pepperoni','Corn'],quantity:1}]},
  {id:'veg',name:'Veggie Yard Combo',tag:'FRESH',desc:'A fresh two-topping Veg pizza with Bell Peppers.',pizzas:[{mode:'whole',toppings:['Veg','Bell Peppers'],quantity:1}]}
];
function getSavedFavorites(){try{return JSON.parse(localStorage.getItem(PY_GROWTH_KEY)||'[]')}catch{return[]}}
function saveFavorite(pizza){const list=getSavedFavorites();const key=JSON.stringify(pizza);if(!list.some(x=>JSON.stringify(x)===key)){list.unshift(pizza);localStorage.setItem(PY_GROWTH_KEY,JSON.stringify(list.slice(0,8)));}renderGrowthHub();}
function favoriteCurrent(){saveFavorite(currentPizzaSnapshot());showGrowthMessage('Saved to your favorites ⭐');}
function showGrowthMessage(text){let e=document.querySelector('#growth-message');if(!e){e=document.createElement('div');e.id='growth-message';e.className='growth-message';document.querySelector('#growth-cards')?.before(e);}e.textContent=text;clearTimeout(window.__pyGrowthMsg);window.__pyGrowthMsg=setTimeout(()=>e.remove(),2800)}
function applyPizzaPreset(pizzas,extras={}){resetOrder();const first=pizzas[0];state.pizzaMode=first.mode==='half'?'half':'whole';state.selectedToppings=[...(first.toppings||[])];state.leftToppings=[...(first.left||[])];state.rightToppings=[...(first.right||[])];state.quantity=Number(first.quantity||1);state.extras={};for(let i=1;i<pizzas.length;i++){state.cart.push({...pizzas[i],unitPrice:calculatePizzaUnitPrice(new Set([...(pizzas[i].toppings||[]),...(pizzas[i].left||[]),...(pizzas[i].right||[])]).size),toppingCount:new Set([...(pizzas[i].toppings||[]),...(pizzas[i].left||[]),...(pizzas[i].right||[])]).size,includedToppings:Math.min(2,new Set([...(pizzas[i].toppings||[]),...(pizzas[i].left||[]),...(pizzas[i].right||[])]).size),extraToppings:Math.max(0,new Set([...(pizzas[i].toppings||[]),...(pizzas[i].left||[]),...(pizzas[i].right||[])]).size-2),extraToppingCost:Math.max(0,new Set([...(pizzas[i].toppings||[]),...(pizzas[i].left||[]),...(pizzas[i].right||[])]).size-2)*3});}renderToppings();updateDeliveryUI();updateUI();document.querySelector('#builder')?.scrollIntoView({behavior:'smooth'});}
function comboCard(c){return `<article class="growth-card"><span class="growth-tag">${escapeHtml(c.tag)}</span><div class="growth-icon">🍕</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.desc)}</p><button type="button" class="btn btn-primary growth-action" data-combo="${c.id}">ORDER COMBO →</button></article>`}
function renderGrowthHub(){const wrap=document.querySelector('#growth-cards');if(!wrap)return;const fav=getSavedFavorites();wrap.innerHTML=`<article class="growth-card featured-growth"><span class="growth-tag">🔥 CUSTOMER FAVORITE</span><div class="growth-icon">🍕</div><h3>Two-Topping Classic</h3><p>Pepperoni + Mushroom — our easy crowd-pleaser.</p><button type="button" class="btn btn-primary" data-growth-preset="classic">ORDER FAVORITE →</button></article>${PY_COMBOS.map(comboCard).join('')}<article class="growth-card"><span class="growth-tag">📅 DAILY SPECIAL</span><div class="growth-icon">⭐</div><h3>Yard Daily Special</h3><p>Ask the team what today's special is — specials can change without notice.</p><button type="button" class="btn btn-secondary" data-daily>ASK TODAY'S SPECIAL</button></article><article class="growth-card"><span class="growth-tag">🎁 MYSTERY REWARD</span><div class="growth-icon">🎁</div><h3>Mystery Reward</h3><p>Rewards members can watch for surprise bonuses tied to milestones.</p><button type="button" class="btn btn-secondary" data-mystery>REVEAL INFO</button></article><article class="growth-card"><span class="growth-tag">🎁 SECRET MENU</span><div class="growth-icon">🤫</div><h3>Mystery Yard Box</h3><p>Ask staff for today's off-menu surprise. Mystery rewards are announced at the counter.</p><button type="button" class="btn btn-secondary" data-mystery>SHOW SECRET</button></article>`;wrap.querySelectorAll('[data-growth-preset]').forEach(b=>b.addEventListener('click',()=>applyPizzaPreset([{mode:'whole',toppings:['Pepperoni','Mushroom'],quantity:1}])));wrap.querySelectorAll('[data-combo]').forEach(b=>b.addEventListener('click',()=>{const c=PY_COMBOS.find(x=>x.id===b.dataset.combo);if(c)applyPizzaPreset(c.pizzas,c.extras)}));wrap.querySelectorAll('[data-mystery]').forEach(b=>b.addEventListener('click',()=>showGrowthMessage('🎁 Mystery rewards are surprise bonuses for active Rewards members. Ask staff if a mystery reward is available today.')));wrap.querySelector('[data-daily]')?.addEventListener('click',()=>showGrowthMessage('⭐ Today’s special changes daily — ask Pizza Yard staff for the current special.'));
const saved=document.querySelector('#saved-orders');if(saved){saved.innerHTML=fav.length?`<div class="saved-heading"><div><span class="eyebrow">YOUR SAVED PICKS</span><h3>Favorites & Order Again</h3></div><button type="button" class="text-button" data-clear-favs>Clear</button></div><div class="saved-grid">${fav.map((p,i)=>`<button type="button" class="saved-pick" data-fav="${i}"><strong>⭐ Favorite ${i+1}</strong><span>${escapeHtml(pizzaLabel(p,i))}</span></button>`).join('')}</div>`:'';saved.querySelectorAll('[data-fav]').forEach(b=>b.addEventListener('click',()=>{const x=fav[Number(b.dataset.fav)];applyPizzaPreset([x])}));saved.querySelector('[data-clear-favs]')?.addEventListener('click',()=>{localStorage.removeItem(PY_GROWTH_KEY);renderGrowthHub()});}}
function saveLastOrderForGrowth(){try{const details=buildOrderDetails();localStorage.setItem(PY_LAST_ORDER_KEY,JSON.stringify(details));}catch{}}
const pyOriginalSubmitOrder=submitOrder; submitOrder=async function(details){const result=await pyOriginalSubmitOrder(details);try{localStorage.setItem(PY_LAST_ORDER_KEY,JSON.stringify(details));if(details.pizzas?.[0])saveFavorite(details.pizzas[0]);}catch{}return result;};
function setupGrowth(){renderGrowthHub();const last=(()=>{try{return JSON.parse(localStorage.getItem(PY_LAST_ORDER_KEY)||'null')}catch{return null}})();if(last?.pizzas?.length){const saved=document.querySelector('#saved-orders');if(saved&&!saved.innerHTML) saved.innerHTML=`<div class="saved-heading"><div><span class="eyebrow">ORDER AGAIN</span><h3>Your last order is ready</h3></div></div><button type="button" class="saved-pick last-order" id="order-again"><strong>🔄 ORDER AGAIN</strong><span>${escapeHtml(last.pizzas.map((p,i)=>pizzaLabel(p,i)).join(' • '))}</span></button>`;document.querySelector('#order-again')?.addEventListener('click',()=>applyPizzaPreset(last.pizzas,last.extras||{}));}
const form=document.querySelector('#order-form');if(form&&!document.querySelector('#save-favorite-btn')){const b=document.createElement('button');b.type='button';b.id='save-favorite-btn';b.className='btn btn-secondary';b.textContent='⭐ Save This Pizza';b.addEventListener('click',favoriteCurrent);elements.placeOrder?.before(b);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupGrowth);else setupGrowth();
