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
    CONFIG.supabasePublishableKey
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
  pizzaMode: "whole",
  leftToppings: [],
  rightToppings: [],
  toppingAvailability: {}
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

function calculateOrder() {
  const toppingCount = uniqueToppings().length;
  const unitPrice = calculatePizzaUnitPrice(toppingCount);
  const includedToppings = Math.min(toppingCount, CONFIG.pizza.includedToppings);
  const extraToppings = Math.max(0, toppingCount - CONFIG.pizza.includedToppings);
  const extraToppingCost = extraToppings * CONFIG.pizza.extraToppingPrice;
  const pizzasSubtotal = unitPrice * state.quantity;
  const deliveryFee = state.orderType === "delivery" && state.quantity >= CONFIG.delivery.minimumBoxes
    ? CONFIG.delivery.fee : 0;
  return { toppingCount, unitPrice, includedToppings, extraToppings, extraToppingCost,
    pizzasSubtotal, deliveryFee, total: pizzasSubtotal + deliveryFee };
}

function toppingButton(topping, selected, clickHandler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "topping-option";
  const available = state.toppingAvailability[topping] !== false;
  button.disabled = !available;
  button.classList.toggle("sold-out", !available);
  button.setAttribute("aria-pressed", String(selected));
  button.innerHTML = `<span class="topping-visual" aria-hidden="true">${TOPPING_ICONS[topping] || "🍕"}</span><span>${escapeHtml(topping)}</span>${available ? "" : "<small>SOLD OUT</small>"}<span class="topping-check" aria-hidden="true">✓</span>`;
  if (selected) button.classList.add("selected");
  if (available) button.addEventListener("click", clickHandler);
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
  const eligible = state.quantity >= CONFIG.delivery.minimumBoxes;

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

function updateUI() {
  const order = calculateOrder();

  elements.selectedCount.textContent = order.toppingCount;
  elements.summaryToppingCount.textContent =
    `${order.toppingCount} topping${order.toppingCount === 1 ? "" : "s"}`;

  if (order.toppingCount === 0) {
    elements.summaryToppingsList.innerHTML = '<span class="summary-chip">Cheese Pizza</span>';
  } else if (state.pizzaMode === "half") {
    elements.summaryToppingsList.innerHTML = `<span class="summary-chip">Left: ${state.leftToppings.length ? state.leftToppings.map(escapeHtml).join(", ") : "Cheese"}</span><span class="summary-chip">Right: ${state.rightToppings.length ? state.rightToppings.map(escapeHtml).join(", ") : "Cheese"}</span>`;
  } else {
    elements.summaryToppingsList.innerHTML = state.selectedToppings.map(t => `<span class="summary-chip">${escapeHtml(t)}</span>`).join("");
  }

  elements.summaryBase.textContent = money(order.unitPrice);
  elements.summaryIncluded.textContent = order.includedToppings;
  elements.summaryExtraCount.textContent = order.extraToppings;
  elements.summaryExtraCost.textContent = money(order.extraToppingCost);
  elements.summaryQuantity.textContent = state.quantity;
  elements.summaryDelivery.textContent = money(order.deliveryFee);
  elements.summaryTotal.textContent = money(order.total);

  if (state.orderType === "delivery" && state.quantity >= CONFIG.delivery.minimumBoxes) {
    elements.deliverySummary.textContent = `Delivery selected — ${money(CONFIG.delivery.fee)} fee included.`;
  } else if (state.orderType === "delivery") {
    elements.deliverySummary.textContent =
      `Delivery requires ${CONFIG.delivery.minimumBoxes} boxes or more.`;
  } else {
    elements.deliverySummary.textContent = "Pickup selected — no delivery fee.";
  }

  elements.qtyMinus.disabled = state.quantity <= 1;
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

  const fullName = elements.name.value.trim();
  if (!fullName) {
    $("#name-error").textContent = "Please enter your full name.";
    valid = false;
  }

  if (!isValidPhone(elements.phone.value)) {
    $("#phone-error").textContent = "Enter a valid Saint Lucia phone number, e.g. 7121777.";
    valid = false;
  }

  if (!isValidEmail(elements.email.value)) {
    $("#email-error").textContent = "Please enter a valid email address.";
    valid = false;
  }

  if (state.pizzaMode === "half" && (!state.leftToppings.length || !state.rightToppings.length)) {
    elements.toppingsError.textContent = "Choose at least one topping on each half, or switch back to Whole Pizza.";
    valid = false;
  }

  if (state.orderType === "delivery") {
    if (state.quantity < CONFIG.delivery.minimumBoxes) {
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
    ...order
  };
}

function buildEmailBody(details) {
  const toppingLines = state.pizzaMode === "half"
    ? [`Left half: ${state.leftToppings.join(", ") || "Cheese"}`, `Right half: ${state.rightToppings.join(", ") || "Cheese"}`].join("\n")
    : state.selectedToppings.map((topping) => `- ${topping}`).join("\n");

  return [
    "NEW PIZZA ORDER 🍕",
    "",
    "BUSINESS",
    `Business: ${CONFIG.businessName}`,
    `Location: ${CONFIG.location}`,
    "",
    "CUSTOMER",
    `Name: ${details.customerName}`,
    `Phone: ${details.customerPhone}`,
    `Email: ${details.customerEmail}`,
    "",
    "ORDER",
    `Pizza: ${CONFIG.pizza.size}`,
    "Toppings:",
    toppingLines,
    `Number of toppings: ${details.toppingCount}`,
    `Base price: ${money(details.unitPrice)}`,
    `Included toppings: ${details.includedToppings}`,
    `Extra toppings: ${details.extraToppings}`,
    `Extra topping cost: ${money(details.extraToppingCost)}`,
    `Quantity: ${state.quantity}`,
    `Order type: ${state.orderType === "delivery" ? "Delivery" : "Pickup"}`,
    `Delivery fee: ${money(details.deliveryFee)}`,
    ...(state.orderType === "delivery" ? [`Delivery address: ${details.address}`] : []),
    `Special instructions: ${details.instructions || "None"}`,
    "",
    `TOTAL: ${money(details.total)}`
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
  if (!window.pizzaYardSupabase) {
    throw new Error("Supabase is not configured.");
  }

  state.trackingToken = createTrackingToken();

  const payload = {
    customer_name: details.customerName,
    customer_phone: details.customerPhone,
    customer_email: details.customerEmail,
    order_type: details.orderType,
    delivery_address: details.address || null,
    pizza_size: CONFIG.pizza.size,
    toppings: state.pizzaMode === "half"
      ? { mode: "half_and_half", left: [...state.leftToppings], right: [...state.rightToppings] }
      : [...state.selectedToppings],
    order_source: "online",
    topping_count: details.toppingCount,
    unit_price: details.unitPrice,
    included_toppings: details.includedToppings,
    extra_toppings: details.extraToppings,
    extra_topping_cost: details.extraToppingCost,
    quantity: state.quantity,
    delivery_fee: details.deliveryFee,
    special_instructions: details.instructions || null,
    total: details.total,
    status: "new",
    tracking_token: state.trackingToken
  };

  const { error } = await window.pizzaYardSupabase
    .from("pizza_orders")
    .insert(payload);

  if (error) {
    console.error("Supabase order save failed:", error);
    throw new Error("We couldn't receive your order right now. Please try again.");
  }

  localStorage.setItem("pizzaYardTrackingToken", state.trackingToken);
  return state.trackingToken;
}

async function sendFormspreeBackup(details) {
  if (!CONFIG.formspreeEndpoint ||
      CONFIG.formspreeEndpoint === "YOUR_EMAIL_SERVICE_ENDPOINT") {
    console.warn("Formspree endpoint is not configured.");
    return false;
  }

  const body = buildEmailBody(details);
  const formData = new FormData();
  formData.append("_subject", `New Pizza Yard Order — ${details.customerName}`);
  formData.append("customer_name", details.customerName);
  formData.append("customer_phone", details.customerPhone);
  formData.append("customer_email", details.customerEmail);
  formData.append("order_type", details.orderType);
  formData.append("delivery_address", details.address || "N/A");
  formData.append("pizza_size", CONFIG.pizza.size);
  formData.append("toppings", state.pizzaMode === "half"
    ? `Left: ${state.leftToppings.join(", ") || "Cheese"} | Right: ${state.rightToppings.join(", ") || "Cheese"}`
    : state.selectedToppings.join(", "));
  formData.append("number_of_toppings", String(details.toppingCount));
  formData.append("base_price", money(details.unitPrice));
  formData.append("included_toppings", String(details.includedToppings));
  formData.append("extra_toppings", String(details.extraToppings));
  formData.append("extra_topping_cost", money(details.extraToppingCost));
  formData.append("quantity", String(state.quantity));
  formData.append("delivery_fee", money(details.deliveryFee));
  formData.append("special_instructions", details.instructions || "None");
  formData.append("total", money(details.total));
  formData.append("order_details", body);

  const response = await fetch(CONFIG.formspreeEndpoint, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error("Formspree backup failed.");
  return true;
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
    renderTracker(order.status, order.customer_name);
  }
}

function startOrderTracking() {
  if (!state.trackingToken || !window.pizzaYardSupabase) return;
  renderTracker("new");
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

async function loadToppingAvailability() {
  if (!window.pizzaYardSupabase) return;
  try {
    const { data, error } = await window.pizzaYardSupabase.from("pizza_topping_availability").select("name,available");
    if (error || !data) return;
    state.toppingAvailability = Object.fromEntries(data.map(row => [row.name, row.available !== false]));
    renderToppings(); updateUI();
  } catch (error) { console.warn("Topping availability could not be loaded:", error); }
}

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
  $$(".pizza-mode-btn").forEach(btn => btn.addEventListener("click", () => { state.pizzaMode = btn.dataset.mode; renderToppings(); updateUI(); }));
  loadToppingAvailability();

  elements.anotherOrder.addEventListener("click", () => {
    closeSuccessModal();
    resetOrder();
    document.querySelector("#builder").scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
