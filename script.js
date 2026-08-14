// ============================================================
// PIZZA YARD — COMPLETE SCRIPT
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

  supabaseUrl: "https://pqzfmbqmkeythyajkiti.supabase.co",

  supabasePublishableKey:
    "sb_publishable_p1ugtwfPHsKFmZ8KOQ_fBQ_YCAPYWxn"
};


// ============================================================
// SUPABASE
// ============================================================

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


// ============================================================
// TOPPING ICONS
// ============================================================

const TOPPING_ICONS = {
  "Corn": "🌽",
  "Pepperoni": "🔴",
  "Mushroom": "🍄",
  "Tuna": "🐟",
  "Bacon": "🥓",
  "Ham": "🍖",
  "Bell Peppers": "🫑",
  "Sausage": "🌭",
  "Veg": "🥦"
};


// ============================================================
// STATE
// ============================================================

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

  cart: []
};


// ============================================================
// HELPERS
// ============================================================

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [...document.querySelectorAll(selector)];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function esc(value) {
  return escapeHtml(value);
}

function normalizeSaintLuciaPhone(value) {
  return String(value || "").replace(/[\s()-]/g, "");
}

function isValidPhone(value) {
  const normalized = normalizeSaintLuciaPhone(value);
  return /^\d{7}$/.test(normalized);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );
}


// ============================================================
// ELEMENTS
// ============================================================

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

  cartList: $("#pizza-cart-list"),
  addAnotherPizza: $("#add-another-pizza"),
  cartCount: $("#pizza-cart-count"),

  leftToppingGrid: $("#left-topping-grid"),
  rightToppingGrid: $("#right-topping-grid")
};


// ============================================================
// PIZZA CALCULATIONS
// ============================================================

function uniqueToppings() {
  return [
    ...new Set(
      state.pizzaMode === "whole"
        ? state.selectedToppings
        : [...state.leftToppings, ...state.rightToppings]
    )
  ];
}

function calculatePizzaUnitPrice(toppingCount) {
  if (toppingCount === 0) {
    return CONFIG.pizza.cheesePizzaPrice;
  }

  if (toppingCount === 1) {
    return CONFIG.pizza.oneToppingPrice;
  }

  return (
    CONFIG.pizza.twoToppingPrice +
    Math.max(
      0,
      toppingCount - CONFIG.pizza.includedToppings
    ) *
      CONFIG.pizza.extraToppingPrice
  );
}

function currentPizzaSnapshot() {
  const toppingCount = uniqueToppings().length;

  const unitPrice =
    calculatePizzaUnitPrice(toppingCount);

  const includedToppings = Math.min(
    toppingCount,
    CONFIG.pizza.includedToppings
  );

  const extraToppings = Math.max(
    0,
    toppingCount - CONFIG.pizza.includedToppings
  );

  const extraToppingCost =
    extraToppings * CONFIG.pizza.extraToppingPrice;

  return {
    mode: state.pizzaMode,

    toppings: [...state.selectedToppings],

    left: [...state.leftToppings],

    right: [...state.rightToppings],

    quantity: state.quantity,

    toppingCount,

    unitPrice,

    includedToppings,

    extraToppings,

    extraToppingCost
  };
}

function pizzaLabel(pizza, index) {
  if (pizza.mode === "half") {
    return (
      `Pizza ${index + 1}: ` +
      `Left — ${
        pizza.left.length
          ? pizza.left.join(", ")
          : "Cheese"
      } | ` +
      `Right — ${
        pizza.right.length
          ? pizza.right.join(", ")
          : "Cheese"
      }`
    );
  }

  return (
    `Pizza ${index + 1}: ` +
    `${
      pizza.toppings.length
        ? pizza.toppings.join(", ")
        : "Cheese Pizza"
    }`
  );
}

function cartBoxes() {
  return (
    state.cart.reduce(
      (sum, pizza) =>
        sum + Number(pizza.quantity || 1),
      0
    ) +
    Number(state.quantity || 1)
  );
}

function calculateOrder() {
  const current = currentPizzaSnapshot();

  const pizzas = [
    ...state.cart,
    current
  ];

  const pizzasSubtotal = pizzas.reduce(
    (sum, pizza) =>
      sum +
      Number(pizza.unitPrice || 0) *
        Number(pizza.quantity || 1),
    0
  );

  const totalToppingCount = pizzas.reduce(
    (sum, pizza) =>
      sum +
      Number(pizza.toppingCount || 0) *
        Number(pizza.quantity || 1),
    0
  );

  const includedToppings = pizzas.reduce(
    (sum, pizza) =>
      sum +
      Number(pizza.includedToppings || 0) *
        Number(pizza.quantity || 1),
    0
  );

  const extraToppings = pizzas.reduce(
    (sum, pizza) =>
      sum +
      Number(pizza.extraToppings || 0) *
        Number(pizza.quantity || 1),
    0
  );

  const extraToppingCost = pizzas.reduce(
    (sum, pizza) =>
      sum +
      Number(pizza.extraToppingCost || 0) *
        Number(pizza.quantity || 1),
    0
  );

  const boxes = pizzas.reduce(
    (sum, pizza) =>
      sum + Number(pizza.quantity || 1),
    0
  );

  const deliveryFee =
    state.orderType === "delivery" &&
    boxes >= CONFIG.delivery.minimumBoxes
      ? CONFIG.delivery.fee
      : 0;

  return {
    toppingCount: totalToppingCount,

    unitPrice: current.unitPrice,

    includedToppings,

    extraToppings,

    extraToppingCost,

    pizzasSubtotal,

    deliveryFee,

    total:
      pizzasSubtotal + deliveryFee,

    boxes,

    pizzas
  };
}


// ============================================================
// TOPPING UI
// ============================================================

function toppingButton(
  topping,
  selected,
  clickHandler
) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className =
    "topping-option";

  const available =
    state.toppingAvailability[topping] !== false;

  button.disabled = !available;

  button.classList.toggle(
    "sold-out",
    !available
  );

  button.setAttribute(
    "aria-pressed",
    String(selected)
  );

  button.innerHTML =
    `<span class="topping-visual" aria-hidden="true">` +
    `${TOPPING_ICONS[topping] || "🍕"}` +
    `</span>` +
    `<span>${escapeHtml(topping)}</span>` +
    `${
      available
        ? ""
        : "<small>SOLD OUT</small>"
    }` +
    `<span class="topping-check" aria-hidden="true">✓</span>`;

  if (selected) {
    button.classList.add("selected");
  }

  if (available) {
    button.addEventListener(
      "click",
      clickHandler
    );
  }

  return button;
}

function renderToppingGrid(
  grid,
  selected,
  clickHandler,
  includeCheese = false
) {
  if (!grid) return;

  grid.innerHTML = "";

  if (includeCheese) {
    const cheese =
      document.createElement("button");

    cheese.type = "button";

    cheese.className =
      "topping-option cheese-option";

    cheese.setAttribute(
      "aria-pressed",
      String(selected.length === 0)
    );

    cheese.innerHTML =
      `<span class="topping-visual" aria-hidden="true">🧀</span>` +
      `<span>Cheese Pizza</span>` +
      `<small>12" • ${money(
        CONFIG.pizza.cheesePizzaPrice
      )}</small>` +
      `<span class="topping-check" aria-hidden="true">✓</span>`;

    if (selected.length === 0) {
      cheese.classList.add("selected");
    }

    cheese.addEventListener(
      "click",
      clickHandler
    );

    grid.appendChild(cheese);
  }

  CONFIG.toppings.forEach((topping) => {
    grid.appendChild(
      toppingButton(
        topping,
        selected.includes(topping),
        () => clickHandler(topping)
      )
    );
  });
}

function renderToppings() {
  renderToppingGrid(
    elements.toppingGrid,
    state.selectedToppings,
    (topping) => {
      if (typeof topping !== "string") {
        state.selectedToppings = [];
      } else {
        state.selectedToppings =
          state.selectedToppings.includes(
            topping
          )
            ? state.selectedToppings.filter(
                (item) => item !== topping
              )
            : [
                ...state.selectedToppings,
                topping
              ];
      }

      if (elements.toppingsError) {
        elements.toppingsError.textContent =
          "";
      }

      renderToppings();
      updateUI();
    },
    true
  );

  renderToppingGrid(
    elements.leftToppingGrid,
    state.leftToppings,
    (topping) => {
      if (typeof topping !== "string") {
        state.leftToppings = [];
      } else {
        state.leftToppings =
          state.leftToppings.includes(topping)
            ? state.leftToppings.filter(
                (item) => item !== topping
              )
            : [
                ...state.leftToppings,
                topping
              ];
      }

      if (elements.toppingsError) {
        elements.toppingsError.textContent =
          "";
      }

      renderToppings();
      updateUI();
    }
  );

  renderToppingGrid(
    elements.rightToppingGrid,
    state.rightToppings,
    (topping) => {
      if (typeof topping !== "string") {
        state.rightToppings = [];
      } else {
        state.rightToppings =
          state.rightToppings.includes(topping)
            ? state.rightToppings.filter(
                (item) => item !== topping
              )
            : [
                ...state.rightToppings,
                topping
              ];
      }

      if (elements.toppingsError) {
        elements.toppingsError.textContent =
          "";
      }

      renderToppings();
      updateUI();
    }
  );

  if (elements.wholeBuilder) {
    elements.wholeBuilder.classList.toggle(
      "hidden",
      state.pizzaMode !== "whole"
    );
  }

  if (elements.halfBuilder) {
    elements.halfBuilder.classList.toggle(
      "hidden",
      state.pizzaMode !== "half"
    );
  }

  $$(".pizza-mode-btn").forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.mode ===
          state.pizzaMode
      );
    }
  );
}

function toggleTopping(topping) {
  state.selectedToppings =
    state.selectedToppings.includes(topping)
      ? state.selectedToppings.filter(
          (item) => item !== topping
        )
      : [
          ...state.selectedToppings,
          topping
        ];

  if (elements.toppingsError) {
    elements.toppingsError.textContent =
      "";
  }

  renderToppings();
  updateUI();
}


// ============================================================
// QUANTITY / ORDER TYPE
// ============================================================

function updateQuantity(nextQuantity) {
  state.quantity = Math.max(
    1,
    Number(nextQuantity) || 1
  );

  if (elements.quantityOutput) {
    elements.quantityOutput.value =
      state.quantity;

    elements.quantityOutput.textContent =
      state.quantity;
  }

  updateDeliveryUI();
  updateUI();
}

function updateOrderType() {
  const selected =
    elements.orderTypeInputs.find(
      (input) => input.checked
    );

  state.orderType =
    selected
      ? selected.value
      : "pickup";

  updateDeliveryUI();
  updateUI();
}

function updateDeliveryUI() {
  const isDelivery =
    state.orderType === "delivery";

  const eligible =
    cartBoxes() >=
    CONFIG.delivery.minimumBoxes;

  $$(".type-option").forEach(
    (label) => {
      const input =
        label.querySelector("input");

      if (input) {
        label.classList.toggle(
          "selected",
          input.checked
        );
      }
    }
  );

  if (elements.addressWrap) {
    elements.addressWrap.classList.toggle(
      "hidden",
      !isDelivery
    );
  }

  if (elements.address) {
    elements.address.required =
      isDelivery;
  }

  const showWarning =
    isDelivery && !eligible;

  if (elements.deliveryWarning) {
    elements.deliveryWarning.classList.toggle(
      "visible",
      showWarning
    );

    if (showWarning) {
      elements.deliveryWarning.textContent =
        `Delivery is available for orders of ${CONFIG.delivery.minimumBoxes} boxes and up.`;
    }
  }

  if (!isDelivery && elements.addressError) {
    elements.addressError.textContent =
      "";
  }
}


// ============================================================
// CART
// ============================================================

function renderPizzaCart() {
  if (!elements.cartList) {
    return;
  }

  const items = state.cart;

  elements.cartList.innerHTML =
    items.length
      ? items
          .map((pizza, index) => {
            const label =
              pizzaLabel(
                pizza,
                index
              );

            return `
              <div class="pizza-cart-item">
                <div>
                  <strong>🍕 ${escapeHtml(label)}</strong>
                  <small>
                    ${pizza.quantity}
                    box${pizza.quantity === 1 ? "" : "es"}
                    •
                    ${money(
                      pizza.unitPrice *
                        pizza.quantity
                    )}
                  </small>
                </div>

                <button
                  type="button"
                  class="cart-remove"
                  data-cart-index="${index}"
                  aria-label="Remove pizza ${index + 1}"
                >
                  Remove
                </button>
              </div>
            `;
          })
          .join("")
      :
        '<p class="muted">No additional pizzas yet. Build your first pizza above.</p>';

  if (elements.cartCount) {
    elements.cartCount.textContent =
      String(items.length);
  }

  elements.cartList
    .querySelectorAll(
      ".cart-remove"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.cart.splice(
            Number(
              button.dataset.cartIndex
            ),
            1
          );

          renderPizzaCart();
          updateDeliveryUI();
          updateUI();
        }
      );
    });
}


// ============================================================
// MAIN UI
// ============================================================

function updateUI() {
  const order =
    calculateOrder();

  if (elements.selectedCount) {
    elements.selectedCount.textContent =
      uniqueToppings().length;
  }

  if (elements.summaryToppingCount) {
    elements.summaryToppingCount.textContent =
      `${order.toppingCount} topping${
        order.toppingCount === 1
          ? ""
          : "s"
      } across ${order.boxes} box${
        order.boxes === 1
          ? ""
          : "es"
      }`;
  }

  if (
    elements.summaryToppingsList
  ) {
    if (order.pizzas.length > 1) {
      elements.summaryToppingsList.innerHTML =
        order.pizzas
          .map(
            (pizza, index) =>
              `<span class="summary-chip">${escapeHtml(
                pizzaLabel(
                  pizza,
                  index
                )
              )}${
                pizza.quantity > 1
                  ? ` ×${pizza.quantity}`
                  : ""
              }</span>`
          )
          .join("");
    } else if (
      state.pizzaMode === "half"
    ) {
      elements.summaryToppingsList.innerHTML =
        `<span class="summary-chip">Left: ${
          state.leftToppings.length
            ? state.leftToppings
                .map(escapeHtml)
                .join(", ")
            : "Cheese"
        }</span>` +
        `<span class="summary-chip">Right: ${
          state.rightToppings.length
            ? state.rightToppings
                .map(escapeHtml)
                .join(", ")
            : "Cheese"
        }</span>`;
    } else {
      elements.summaryToppingsList.innerHTML =
        state.selectedToppings.length
          ? state.selectedToppings
              .map(
                (topping) =>
                  `<span class="summary-chip">${escapeHtml(
                    topping
                  )}</span>`
              )
              .join("")
          :
            '<span class="summary-chip">Cheese Pizza</span>';
    }
  }

  if (elements.summaryBase) {
    elements.summaryBase.textContent =
      money(order.pizzasSubtotal);
  }

  if (elements.summaryIncluded) {
    elements.summaryIncluded.textContent =
      order.includedToppings;
  }

  if (elements.summaryExtraCount) {
    elements.summaryExtraCount.textContent =
      order.extraToppings;
  }

  if (elements.summaryExtraCost) {
    elements.summaryExtraCost.textContent =
      money(order.extraToppingCost);
  }

  if (elements.summaryQuantity) {
    elements.summaryQuantity.textContent =
      order.boxes;
  }

  if (elements.summaryDelivery) {
    elements.summaryDelivery.textContent =
      money(order.deliveryFee);
  }

  if (elements.summaryTotal) {
    elements.summaryTotal.textContent =
      money(order.total);
  }

  if (elements.deliverySummary) {
    elements.deliverySummary.textContent =
      state.orderType === "delivery"
        ? order.boxes >=
          CONFIG.delivery.minimumBoxes
          ? `Delivery fee: ${money(
              order.deliveryFee
            )}.`
          :
            `Delivery requires ${CONFIG.delivery.minimumBoxes} boxes. You currently have ${order.boxes}.`
        :
          "Pickup selected — no delivery fee.";
  }

  renderPizzaCart();
}


// ============================================================
// ADD ANOTHER PIZZA
// ============================================================

function addCurrentPizza() {
  if (
    state.pizzaMode === "half" &&
    (
      !state.leftToppings.length ||
      !state.rightToppings.length
    )
  ) {
    if (elements.toppingsError) {
      elements.toppingsError.textContent =
        "Choose at least one topping on each half, or switch back to Whole Pizza.";
    }

    return;
  }

  state.cart.push(
    currentPizzaSnapshot()
  );

  state.selectedToppings = [];
  state.leftToppings = [];
  state.rightToppings = [];

  state.pizzaMode = "whole";
  state.quantity = 1;

  if (elements.quantityOutput) {
    elements.quantityOutput.value = 1;
    elements.quantityOutput.textContent = 1;
  }

  if (elements.toppingsError) {
    elements.toppingsError.textContent =
      "";
  }

  renderToppings();
  updateDeliveryUI();
  updateUI();

  document
    .querySelector("#builder")
    ?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}


// ============================================================
// VALIDATION
// ============================================================

function clearErrors() {
  if (elements.toppingsError) {
    elements.toppingsError.textContent =
      "";
  }

  if (elements.addressError) {
    elements.addressError.textContent =
      "";
  }

  if (elements.submissionError) {
    elements.submissionError.textContent =
      "";
  }

  const nameError =
    $("#name-error");

  const phoneError =
    $("#phone-error");

  const emailError =
    $("#email-error");

  if (nameError) {
    nameError.textContent = "";
  }

  if (phoneError) {
    phoneError.textContent = "";
  }

  if (emailError) {
    emailError.textContent = "";
  }
}

function validateForm() {
  clearErrors();

  let valid = true;

  const fullName =
    elements.name
      ? elements.name.value.trim()
      : "";

  /*
   * Keep the existing required customer fields.
   */
  if (!fullName) {
    const error =
      $("#name-error");

    if (error) {
      error.textContent =
        "Please enter your full name.";
    }

    valid = false;
  }

  if (
    !elements.phone ||
    !isValidPhone(
      elements.phone.value
    )
  ) {
    const error =
      $("#phone-error");

    if (error) {
      error.textContent =
        "Enter a valid Saint Lucia phone number, e.g. 7121777.";
    }

    valid = false;
  }

  if (
    !elements.email ||
    !isValidEmail(
      elements.email.value
    )
  ) {
    const error =
      $("#email-error");

    if (error) {
      error.textContent =
        "Please enter a valid email address.";
    }

    valid = false;
  }

  if (
    state.pizzaMode === "half" &&
    (
      !state.leftToppings.length ||
      !state.rightToppings.length
    )
  ) {
    if (elements.toppingsError) {
      elements.toppingsError.textContent =
        "Choose at least one topping on each half, or switch back to Whole Pizza.";
    }

    valid = false;
  }

  if (
    state.orderType ===
    "delivery"
  ) {
    if (
      cartBoxes() <
      CONFIG.delivery.minimumBoxes
    ) {
      if (
        elements.deliveryWarning
      ) {
        elements.deliveryWarning.classList.add(
          "visible"
        );
      }

      valid = false;
    }

    if (
      !elements.address ||
      !elements.address.value.trim()
    ) {
      if (elements.addressError) {
        elements.addressError.textContent =
          "Delivery address is required.";
      }

      valid = false;
    }
  }

  return valid;
}


// ============================================================
// ORDER DETAILS
// ============================================================

function buildOrderDetails() {
  const order =
    calculateOrder();

  const customerName =
    elements.name
      ? elements.name.value.trim()
      : "";

  const customerPhone =
    elements.phone
      ? normalizeSaintLuciaPhone(
          elements.phone.value
        )
      : "";

  const customerEmail =
    elements.email
      ? elements.email.value.trim()
      : "";

  const address =
    elements.address
      ? elements.address.value.trim()
      : "";

  const instructions =
    elements.instructions
      ? elements.instructions.value.trim()
      : "";

  return {
    customerName,
    customerPhone,
    customerEmail,

    orderType:
      state.orderType,

    address,

    instructions,

    ...order,

    pizzas:
      order.pizzas
  };
}


// ============================================================
// EMAIL BODY
// ============================================================

function buildEmailBody(details) {
  const pizzaLines =
    details.pizzas
      .map(
        (pizza, index) =>
          `Pizza ${index + 1} (${
            pizza.quantity
          } box${
            pizza.quantity === 1
              ? ""
              : "es"
          }): ${
            pizza.mode === "half"
              ? `Left: ${
                  pizza.left.join(", ") ||
                  "Cheese"
                } | Right: ${
                  pizza.right.join(", ") ||
                  "Cheese"
                }`
              :
                (
                  pizza.toppings.join(", ") ||
                  "Cheese Pizza"
                )
          } — ${money(
            pizza.unitPrice *
              pizza.quantity
          )}`
      )
      .join("\n");

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
    `Total pizzas/boxes: ${details.boxes}`,

    pizzaLines,

    `Order type: ${
      state.orderType === "delivery"
        ? "Delivery"
        : "Pickup"
    }`,

    `Delivery fee: ${money(
      details.deliveryFee
    )}`,

    ...(state.orderType ===
    "delivery"
      ? [
          `Delivery address: ${details.address}`
        ]
      : []),

    `Special instructions: ${
      details.instructions ||
      "None"
    }`,

    "",

    `TOTAL: ${money(
      details.total
    )}`
  ].join("\n");
}


// ============================================================
// SUBMITTING STATE
// ============================================================

function setSubmitting(
  isSubmitting
) {
  state.submitting =
    isSubmitting;

  if (elements.form) {
    elements.form.classList.toggle(
      "is-submitting",
      isSubmitting
    );
  }

  if (elements.placeOrder) {
    elements.placeOrder.disabled =
      isSubmitting;
  }
}


// ============================================================
// TRACKING TOKEN
// ============================================================

function createTrackingToken() {
  const bytes =
    new Uint8Array(18);

  crypto.getRandomValues(
    bytes
  );

  return Array.from(
    bytes,
    (byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
  ).join("");
}


// ============================================================
// SAVE ORDER TO SUPABASE
// ============================================================
// IMPORTANT:
// There is NO "order_details" field here.
// The current pizza_orders table does not have that column.
// ============================================================

async function saveOrderToSupabase(
  details
) {
  if (!window.pizzaYardSupabase) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  state.trackingToken =
    createTrackingToken();

  const toppingsSummary =
    details.pizzas.map(
      (pizza, index) =>
        pizzaLabel(
          pizza,
          index
        )
    );

  const payload = {
    customer_name:
      details.customerName,

    customer_phone:
      details.customerPhone,

    customer_email:
      details.customerEmail,

    order_type:
      details.orderType,

    delivery_address:
      details.address || null,

    pizza_size:
      CONFIG.pizza.size,

    toppings:
      toppingsSummary,

    order_source:
      "online",

    topping_count:
      details.toppingCount,

    unit_price:
      details.pizzasSubtotal /
      Math.max(
        1,
        details.boxes
      ),

    included_toppings:
      details.includedToppings,

    extra_toppings:
      details.extraToppings,

    extra_topping_cost:
      details.extraToppingCost,

    quantity:
      details.boxes,

    delivery_fee:
      details.deliveryFee,

    special_instructions:
      details.instructions || null,

    total:
      details.total,

    status:
      "new",

    tracking_token:
      state.trackingToken
  };

  console.log(
    "Pizza Yard order being saved:",
    payload
  );

  const {
    data,
    error
  } =
    await window.pizzaYardSupabase
      .from("pizza_orders")
      .insert(payload)
      .select()
      .single();

  if (error) {
    console.error(
      "Supabase order save failed:",
      error
    );

    throw new Error(
      "We couldn't receive your order right now. Please try again."
    );
  }

  console.log(
    "Pizza Yard order saved successfully:",
    data
  );

  localStorage.setItem(
    "pizzaYardTrackingToken",
    state.trackingToken
  );

  return state.trackingToken;
}


// ============================================================
// FORMSPREE BACKUP
// ============================================================

async function sendFormspreeBackup(
  details
) {
  if (
    !CONFIG.formspreeEndpoint ||
    CONFIG.formspreeEndpoint ===
      "YOUR_EMAIL_SERVICE_ENDPOINT"
  ) {
    return false;
  }

  const body =
    buildEmailBody(details);

  const formData =
    new FormData();

  formData.append(
    "_subject",
    `New Pizza Yard Order — ${details.customerName}`
  );

  formData.append(
    "customer_name",
    details.customerName
  );

  formData.append(
    "customer_phone",
    details.customerPhone
  );

  formData.append(
    "customer_email",
    details.customerEmail
  );

  formData.append(
    "order_type",
    details.orderType
  );

  formData.append(
    "delivery_address",
    details.address || "N/A"
  );

  formData.append(
    "pizza_size",
    CONFIG.pizza.size
  );

  formData.append(
    "toppings",
    details.pizzas
      .map(
        (pizza, index) =>
          pizzaLabel(
            pizza,
            index
          )
      )
      .join("\n")
  );

  formData.append(
    "number_of_toppings",
    String(
      details.toppingCount
    )
  );

  formData.append(
    "quantity",
    String(
      details.boxes
    )
  );

  formData.append(
    "delivery_fee",
    money(
      details.deliveryFee
    )
  );

  formData.append(
    "special_instructions",
    details.instructions ||
      "None"
  );

  formData.append(
    "total",
    money(
      details.total
    )
  );

  formData.append(
    "order_details",
    body
  );

  const response =
    await fetch(
      CONFIG.formspreeEndpoint,
      {
        method: "POST",

        body: formData,

        headers: {
          Accept:
            "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      "Formspree backup failed."
    );
  }

  return true;
}


// ============================================================
// COMPLETE ORDER SUBMISSION
// ============================================================

async function submitOrder(
  details
) {
  if (
    !window.pizzaYardSupabase ||
    !CONFIG.supabaseUrl ||
    !CONFIG.supabasePublishableKey
  ) {
    throw new Error(
      "Supabase is not configured."
    );
  }

  /*
   * Supabase is the source of truth.
   *
   * Formspree is only the backup notification.
   *
   * If Formspree fails after the order is
   * successfully inserted into Supabase,
   * the customer must NOT resubmit.
   */

  const savedOrder =
    await saveOrderToSupabase(
      details
    );

  try {
    await sendFormspreeBackup(
      details
    );
  } catch (error) {
    console.warn(
      "Order saved to Supabase, but Formspree backup failed:",
      error
    );
  }

  return savedOrder;
}


// ============================================================
// ORDER TRACKING
// ============================================================

const TRACKING_STEPS = [
  {
    key: "new",
    label: "Order Received",
    icon: "✓",
    message:
      "We've received your order."
  },

  {
    key: "preparing",
    label: "Preparing",
    icon: "👨‍🍳",
    message:
      "Our kitchen is preparing your pizza."
  },

  {
    key: "in_oven",
    label: "In the Oven",
    icon: "🔥",
    message:
      "Your pizza is cooking now."
  },

  {
    key: "ready",
    label: "Ready",
    icon: "📦",
    message:
      "Your pizza is ready for pickup or delivery."
  },

  {
    key: "completed",
    label: "Completed",
    icon: "🎉",
    message:
      "Enjoy your Pizza Yard order!"
  }
];


const ORDER_NOTIFICATION_MESSAGES = {
  new: {
    title:
      "Order Received 🍕",
    body:
      "We've received your Pizza Yard order."
  },

  preparing: {
    title:
      "Your order is being prepared 👨‍🍳",
    body:
      "The Pizza Yard kitchen is preparing your order now."
  },

  in_oven: {
    title:
      "Your pizza is in the oven 🔥",
    body:
      "Your Pizza Yard order is cooking now."
  },

  ready: {
    title:
      "Your order is ready! ✅",
    body:
      "Your Pizza Yard order is ready for pickup or delivery."
  },

  completed: {
    title:
      "Order completed 🎉",
    body:
      "Enjoy your Pizza Yard order!"
  },

  cancelled: {
    title:
      "Order cancelled",
    body:
      "Your Pizza Yard order was cancelled. Please contact us if you need help."
  }
};


// ============================================================
// BROWSER NOTIFICATIONS
// ============================================================

function updateNotificationUI() {
  const button =
    $("#enable-notifications");

  const status =
    $("#notification-status");

  if (!button || !status) {
    return;
  }

  if (
    !("Notification" in window)
  ) {
    button.disabled = true;

    button.textContent =
      "NOT SUPPORTED";

    status.textContent =
      "Your browser does not support notifications.";

    return;
  }

  state.notificationPermission =
    Notification.permission;

  if (
    Notification.permission ===
    "granted"
  ) {
    button.textContent =
      "🔔 NOTIFICATIONS ON";

    button.disabled = true;

    status.textContent =
      "You'll be notified when your order status changes.";
  } else if (
    Notification.permission ===
    "denied"
  ) {
    button.textContent =
      "NOTIFICATIONS BLOCKED";

    button.disabled = true;

    status.textContent =
      "Notifications are blocked in your browser settings.";
  } else {
    button.disabled = false;

    button.textContent =
      "TURN ON NOTIFICATIONS";

    status.textContent =
      "Get a browser notification when your order changes.";
  }
}

async function enableOrderNotifications() {
  if (
    !("Notification" in window)
  ) {
    updateNotificationUI();
    return;
  }

  try {
    const permission =
      await Notification.requestPermission();

    state.notificationPermission =
      permission;

    updateNotificationUI();

    if (
      permission ===
      "granted"
    ) {
      const notification =
        new Notification(
          "Pizza Yard notifications are on 🔔",
          {
            body:
              "We'll let you know when your order status changes.",
            tag:
              "pizza-yard-notification-enabled"
          }
        );

      notification.onclick =
        () => window.focus();
    }
  } catch (error) {
    console.warn(
      "Notification permission request failed:",
      error
    );
  }
}

function notifyOrderStatus(
  status
) {
  if (
    !("Notification" in window) ||
    Notification.permission !==
      "granted"
  ) {
    return;
  }

  const message =
    ORDER_NOTIFICATION_MESSAGES[
      status
    ];

  if (!message) {
    return;
  }

  try {
    const notification =
      new Notification(
        `Pizza Yard • ${message.title}`,
        {
          body:
            message.body,

          tag:
            `pizza-yard-order-${state.trackingToken}-${status}`,

          renotify: true
        }
      );

    notification.onclick =
      () => {
        window.focus();
        notification.close();
      };
  } catch (error) {
    console.warn(
      "Could not show order notification:",
      error
    );
  }
}


// ============================================================
// TRACKER UI
// ============================================================

function trackerStepIndex(
  status
) {
  if (
    status ===
    "cancelled"
  ) {
    return -1;
  }

  const index =
    TRACKING_STEPS.findIndex(
      (step) =>
        step.key === status
    );

  return index < 0
    ? 0
    : index;
}

function renderTracker(
  status,
  customerName = ""
) {
  const wrap =
    $("#order-tracker");

  if (!wrap) {
    return;
  }

  if (
    status ===
    "cancelled"
  ) {
    wrap.innerHTML = `
      <div class="tracker-cancelled">
        <strong>Order cancelled</strong>
        <span>Please contact Pizza Yard if you need help with this order.</span>
      </div>
    `;

    return;
  }

  const current =
    trackerStepIndex(status);

  const step =
    TRACKING_STEPS[current];

  const percent =
    (current /
      (TRACKING_STEPS.length - 1)) *
    100;

  wrap.innerHTML = `
    <div class="tracker-heading">
      <div>
        <span class="eyebrow">LIVE ORDER STATUS</span>
        <strong>${step.label}</strong>
      </div>

      <span class="tracker-current">
        ${step.icon}
      </span>
    </div>

    <div
      class="tracker-bar"
      aria-label="Order progress"
    >
      <span
        style="width:${percent}%"
      ></span>
    </div>

    <div class="tracker-steps">
      ${TRACKING_STEPS.map(
        (item, index) => `
          <div
            class="tracker-step ${
              index <= current
                ? "done"
                : ""
            } ${
              index === current
                ? "current"
                : ""
            }"
          >
            <span>
              ${
                index <= current
                  ? "✓"
                  : index + 1
              }
            </span>

            <small>
              ${item.label}
            </small>
          </div>
        `
      ).join("")}
    </div>

    <p class="tracker-message">
      ${step.message}${
        customerName
          ? ` ${escapeHtml(
              customerName
                .split(" ")[0]
            )}.`
          : ""
      }
    </p>
  `;
}


// ============================================================
// FETCH TRACKED ORDER
// ============================================================

async function fetchTrackedOrder() {
  if (
    !state.trackingToken ||
    !window.pizzaYardSupabase
  ) {
    return;
  }

  const {
    data,
    error
  } =
    await window.pizzaYardSupabase
      .rpc(
        "get_pizza_order_status",
        {
          p_tracking_token:
            state.trackingToken
        }
      );

  if (
    !error &&
    data &&
    data.length
  ) {
    const order =
      data[0];

    const nextStatus =
      order.status;

    if (
      state.lastTrackedStatus ===
      null
    ) {
      state.lastTrackedStatus =
        nextStatus;
    } else if (
      nextStatus !==
      state.lastTrackedStatus
    ) {
      state.lastTrackedStatus =
        nextStatus;

      notifyOrderStatus(
        nextStatus
      );
    }

    renderTracker(
      nextStatus,
      order.customer_name
    );
  }
}

function startOrderTracking() {
  if (
    !state.trackingToken ||
    !window.pizzaYardSupabase
  ) {
    return;
  }

  state.lastTrackedStatus =
    null;

  renderTracker("new");

  updateNotificationUI();

  fetchTrackedOrder();

  clearInterval(
    state.trackingPoll
  );

  state.trackingPoll =
    setInterval(
      fetchTrackedOrder,
      5000
    );
}

function stopOrderTracking() {
  clearInterval(
    state.trackingPoll
  );

  state.trackingPoll =
    null;
}


// ============================================================
// SUCCESS MODAL
// ============================================================

function openSuccessModal(
  total
) {
  if (elements.successTotal) {
    elements.successTotal.textContent =
      money(total);
  }

  const code =
    state.trackingToken
      ? state.trackingToken
          .slice(0, 8)
          .toUpperCase()
      : "";

  const codeElement =
    $("#tracking-code");

  if (codeElement) {
    codeElement.textContent =
      code;
  }

  renderTracker(
    "new",
    elements.name
      ? elements.name.value.trim()
      : ""
  );

  if (
    elements.successModal
  ) {
    elements.successModal.classList.remove(
      "hidden"
    );
  }

  document.body.classList.add(
    "modal-open"
  );

  startOrderTracking();

  if (
    elements.modalClose &&
    typeof elements.modalClose.focus ===
      "function"
  ) {
    elements.modalClose.focus();
  }
}

function closeSuccessModal() {
  if (
    elements.successModal
  ) {
    elements.successModal.classList.add(
      "hidden"
    );
  }

  document.body.classList.remove(
    "modal-open"
  );

  stopOrderTracking();
}


// ============================================================
// RESET ORDER
// ============================================================

function resetOrder() {
  state.selectedToppings = [];

  state.leftToppings = [];

  state.rightToppings = [];

  state.pizzaMode = "whole";

  state.quantity = 1;

  state.orderType =
    "pickup";

  state.cart = [];

  if (elements.form) {
    elements.form.reset();
  }

  if (
    elements.orderTypeInputs.length
  ) {
    elements.orderTypeInputs[0].checked =
      true;
  }

  if (elements.address) {
    elements.address.required =
      false;
  }

  if (
    elements.submissionError
  ) {
    elements.submissionError.textContent =
      "";
  }

  clearErrors();

  renderToppings();

  updateDeliveryUI();

  updateUI();
}


// ============================================================
// FORM SUBMISSION
// ============================================================

async function handleSubmit(
  event
) {
  event.preventDefault();

  if (state.submitting) {
    return;
  }

  if (!validateForm()) {
    const firstError =
      $(".field-error:not(:empty), .submission-error:not(:empty)");

    if (firstError) {
      const associated =
        firstError.previousElementSibling;

      if (
        associated &&
        typeof associated.focus ===
          "function"
      ) {
        associated.focus();
      }
    }

    return;
  }

  const details =
    buildOrderDetails();

  setSubmitting(true);

  if (
    elements.submissionError
  ) {
    elements.submissionError.textContent =
      "";
  }

  try {
    await submitOrder(
      details
    );

    openSuccessModal(
      details.total
    );
  } catch (error) {
    console.error(
      "Pizza Yard order submission failed:",
      error
    );

    if (
      elements.submissionError
    ) {
      elements.submissionError.textContent =
        error.message ===
        "Formspree endpoint is not configured."
          ? "Online ordering is not configured yet. Please try again after adding the Formspree endpoint."
          : "We couldn't send your order right now. Please try again.";
    }
  } finally {
    setSubmitting(false);
  }
}


// ============================================================
// TOPPING AVAILABILITY
// ============================================================

async function loadToppingAvailability() {
  if (
    !window.pizzaYardSupabase
  ) {
    return;
  }

  try {
    const {
      data,
      error
    } =
      await window.pizzaYardSupabase
        .from(
          "pizza_topping_availability"
        )
        .select(
          "name,available"
        );

    if (
      error ||
      !data
    ) {
      return;
    }

    state.toppingAvailability =
      Object.fromEntries(
        data.map(
          (row) => [
            row.name,
            row.available !== false
          ]
        )
      );

    renderToppings();

    updateUI();
  } catch (error) {
    console.warn(
      "Topping availability could not be loaded:",
      error
    );
  }
}


// ============================================================
// REVIEWS
// ============================================================

async function loadPublicReviews() {
  const element =
    $("#reviews-list");

  if (
    !element ||
    !window.pizzaYardSupabase
  ) {
    return;
  }

  const {
    data,
    error
  } =
    await window.pizzaYardSupabase
      .from("pizza_reviews")
      .select(
        "id,display_name,rating,comment,created_at"
      )
      .eq(
        "approved",
        true
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(20);

  if (error) {
    console.error(
      "Public reviews error",
      error
    );

    element.innerHTML =
      '<p class="muted">Reviews are temporarily unavailable.</p>';

    return;
  }

  if (
    !data?.length
  ) {
    element.innerHTML =
      '<p class="muted">Be the first to leave a review. ⭐</p>';

    return;
  }

  element.innerHTML =
    data
      .map((review) => {
        const comment =
          String(
            review.comment || ""
          ).trim();

        const rating =
          Number(
            review.rating
          );

        return `
          <article class="review-card">

            <div class="review-card-top">

              <strong>
                ${esc(
                  review.display_name ||
                    "Customer"
                )}
              </strong>

              <span class="review-stars">
                ${
                  "★".repeat(
                    Math.max(
                      0,
                      Math.min(
                        5,
                        rating
                      )
                    )
                  )
                }${
                  "☆".repeat(
                    Math.max(
                      0,
                      5 -
                        Math.min(
                          5,
                          rating
                        )
                    )
                  )
                }
              </span>

            </div>

            <p class="review-comment">
              ${esc(comment)}
            </p>

            <small class="muted">
              ${new Date(
                review.created_at
              ).toLocaleDateString()}
            </small>

          </article>
        `;
      })
      .join("");
}

async function submitReview(
  event
) {
  event.preventDefault();

  const message =
    $("#review-form-message");

  if (!message) {
    return;
  }

  message.textContent =
    "";

  const rating =
    Number(
      $("#review-rating")?.value
    );

  const name =
    $("#review-name")
      ?.value
      .trim() ||
    "Customer";

  const comment =
    $("#review-comment")
      ?.value
      .trim() ||
    "";

  if (!comment) {
    message.textContent =
      "Please write a review.";

    return;
  }

  if (
    !window.pizzaYardSupabase
  ) {
    message.textContent =
      "Reviews are temporarily unavailable.";

    return;
  }

  const {
    error
  } =
    await window.pizzaYardSupabase
      .from("pizza_reviews")
      .insert({
        display_name:
          name,

        rating,

        comment,

        approved:
          false
      });

  if (error) {
    console.error(
      "Review submission error:",
      error
    );

    message.textContent =
      "We couldn't submit your review right now. Please try again.";

    return;
  }

  $("#review-form")
    ?.reset();

  if (
    $("#review-rating")
  ) {
    $("#review-rating").value =
      "5";
  }

  message.textContent =
    "Thanks! Your review was submitted for approval. ⭐";
}


// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  if (
    elements.navToggle &&
    elements.navMenu
  ) {
    elements.navToggle.addEventListener(
      "click",
      () => {
        const open =
          elements.navMenu.classList.toggle(
            "open"
          );

        elements.navToggle.setAttribute(
          "aria-expanded",
          String(open)
        );

        elements.navToggle.setAttribute(
          "aria-label",
          open
            ? "Close navigation"
            : "Open navigation"
        );
      }
    );
  }

  $$("#nav-menu a").forEach(
    (link) => {
      link.addEventListener(
        "click",
        () => {
          if (
            elements.navMenu
          ) {
            elements.navMenu.classList.remove(
              "open"
            );
          }

          if (
            elements.navToggle
          ) {
            elements.navToggle.setAttribute(
              "aria-expanded",
              "false"
            );

            elements.navToggle.setAttribute(
              "aria-label",
              "Open navigation"
            );
          }
        }
      );
    }
  );
}


// ============================================================
// INIT
// ============================================================

function init() {
  if (
    elements.year
  ) {
    elements.year.textContent =
      new Date().getFullYear();
  }

  renderToppings();

  updateDeliveryUI();

  updateUI();

  if (
    elements.qtyMinus
  ) {
    elements.qtyMinus.addEventListener(
      "click",
      () =>
        updateQuantity(
          state.quantity - 1
        )
    );
  }

  if (
    elements.qtyPlus
  ) {
    elements.qtyPlus.addEventListener(
      "click",
      () =>
        updateQuantity(
          state.quantity + 1
        )
    );
  }

  elements.orderTypeInputs.forEach(
    (input) =>
      input.addEventListener(
        "change",
        updateOrderType
      )
  );

  if (elements.form) {
    elements.form.addEventListener(
      "submit",
      handleSubmit
    );
  }

  $$(".pizza-mode-btn").forEach(
    (button) =>
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();

          const mode =
            button.dataset.mode;

          if (
            mode !== "whole" &&
            mode !== "half"
          ) {
            return;
          }

          state.pizzaMode =
            mode;

          if (
            elements.toppingsError
          ) {
            elements.toppingsError.textContent =
              "";
          }

          renderToppings();

          updateUI();
        }
      )
  );

  loadToppingAvailability();

  loadPublicReviews();

  $("#review-form")
    ?.addEventListener(
      "submit",
      submitReview
    );

  $("#post-order-review")
    ?.addEventListener(
      "click",
      () => {
        document
          .querySelector("#reviews")
          ?.scrollIntoView({
            behavior: "smooth"
          });

        $("#review-comment")
          ?.focus();
      }
    );

  elements.addAnotherPizza
    ?.addEventListener(
      "click",
      addCurrentPizza
    );

  elements.anotherOrder
    ?.addEventListener(
      "click",
      () => {
        closeSuccessModal();

        resetOrder();

        document
          .querySelector(
            "#builder"
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }
    );

  $("#enable-notifications")
    ?.addEventListener(
      "click",
      enableOrderNotifications
    );

  updateNotificationUI();

  elements.modalClose
    ?.addEventListener(
      "click",
      closeSuccessModal
    );

  elements.successModal
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.successModal
        ) {
          closeSuccessModal();
        }
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape" &&
        elements.successModal &&
        !elements.successModal.classList.contains(
          "hidden"
        )
      ) {
        closeSuccessModal();
      }
    }
  );

  setupNavigation();
}


// Start site
init();


// ============================================================
// PIZZA YARD REWARDS
// ============================================================

async function ensureRewardsMemberFromOrder() {
  const join =
    document.querySelector(
      "#join-rewards"
    );

  if (
    !join?.checked ||
    !window.pizzaYardSupabase
  ) {
    return;
  }

  try {
    await window.pizzaYardSupabase.rpc(
      "ensure_rewards_member",
      {
        p_name:
          elements.name?.value.trim() ||
          "",

        p_phone:
          normalizeSaintLuciaPhone(
            elements.phone?.value ||
              ""
          ),

        p_email:
          elements.email?.value.trim() ||
          ""
      }
    );
  } catch (error) {
    console.warn(
      "Rewards signup could not be saved:",
      error
    );
  }
}


// ============================================================
// CHECK REWARDS
// ============================================================

async function checkRewards(
  event
) {
  event.preventDefault();

  const message =
    $("#rewards-message");

  const result =
    $("#rewards-result");

  if (!message || !result) {
    return;
  }

  message.textContent =
    "";

  result.classList.add(
    "hidden"
  );

  const name =
    $("#rewards-name")
      ?.value
      .trim() ||
    "";

  const phone =
    normalizeSaintLuciaPhone(
      $("#rewards-phone")
        ?.value ||
        ""
    );

  if (
    !name ||
    !isValidPhone(phone)
  ) {
    message.textContent =
      "Enter your name and a valid 7-digit Saint Lucia phone number.";

    return;
  }

  if (
    !window.pizzaYardSupabase
  ) {
    message.textContent =
      "Rewards are temporarily unavailable.";

    return;
  }

  const {
    data,
    error
  } =
    await window.pizzaYardSupabase
      .rpc(
        "get_rewards_summary",
        {
          p_name:
            name,

          p_phone:
            phone
        }
      );

  if (
    error ||
    !data?.length
  ) {
    console.error(
      "Rewards lookup error:",
      error
    );

    message.textContent =
      "We could not find a rewards account yet. Join Rewards when placing your next order, then check again after it is completed.";

    return;
  }

  const reward =
    data[0];

  const points =
    Number(
      reward.points || 0
    );

  const next =
    Number(
      reward.next_reward_points ||
        0
    );

  const percentage =
    next
      ? Math.min(
          100,
          Math.round(
            (points / next) *
              100
          )
        )
      : 100;

  result.innerHTML = `
    <div class="rewards-points">
      ${points} points
    </div>

    <strong>
      ${escapeHtml(
        reward.available_reward ||
          "Keep earning points"
      )}
    </strong>

    ${
      next
        ? `
          <div class="rewards-progress">
            <span
              style="width:${percentage}%"
            ></span>
          </div>

          <p>
            ${Math.max(
              0,
              next - points
            )}
            more points to
            ${escapeHtml(
              reward.next_reward_label ||
                "your next reward"
            )}
          </p>
        `
        :
          `
            <p>
              🎉 You have reached every current reward level.
            </p>
          `
    }

    <div class="rewards-actions">

      <button
        type="button"
        data-reward="five_off"
        ${
          points < 100
            ? "disabled"
            : ""
        }
      >
        Redeem $5 OFF
      </button>

      <button
        type="button"
        data-reward="ten_off"
        ${
          points < 200
            ? "disabled"
            : ""
        }
      >
        Redeem $10 OFF
      </button>

      <button
        type="button"
        data-reward="free_pizza"
        ${
          points < 300
            ? "disabled"
            : ""
        }
      >
        Redeem Free Pizza
      </button>

    </div>

    <small class="muted">
      Redeemed rewards give you a one-time code to show Pizza Yard staff.
    </small>
  `;

  result.classList.remove(
    "hidden"
  );

  result
    .querySelectorAll(
      "[data-reward]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () =>
            redeemReward(
              name,
              phone,
              button.dataset.reward,
              button,
              result
            )
        );
      }
    );
}


// ============================================================
// REDEEM REWARD
// ============================================================

async function redeemReward(
  name,
  phone,
  key,
  button,
  result
) {
  if (!button || !result) {
    return;
  }

  button.disabled =
    true;

  const {
    data,
    error
  } =
    await window.pizzaYardSupabase
      .rpc(
        "redeem_rewards",
        {
          p_name:
            name,

          p_phone:
            phone,

          p_reward_key:
            key
        }
      );

  if (
    error ||
    !data?.length
  ) {
    alert(
      error?.message ||
        "Unable to redeem this reward."
    );

    button.disabled =
      false;

    return;
  }

  const reward =
    data[0];

  result.insertAdjacentHTML(
    "afterbegin",
    `
      <div class="reward-code">

        <strong>
          🎁 ${escapeHtml(
            reward.reward_label
          )}
        </strong>

        <div
          style="
            font-size:28px;
            font-weight:900;
            letter-spacing:.12em;
            margin:6px 0
          "
        >
          ${escapeHtml(
            reward.code
          )}
        </div>

        <small>
          Show this code to Pizza Yard staff.
          It can only be used once.
        </small>

      </div>
    `
  );

  const message =
    $("#rewards-message");

  if (message) {
    message.textContent =
      "Reward redeemed successfully!";
  }
}


// ============================================================
// REWARDS HOOK
// ============================================================
// Join Rewards is saved after a successful order.
// ============================================================

const originalOpenSuccessModal =
  openSuccessModal;

openSuccessModal =
  function (total) {
    ensureRewardsMemberFromOrder();

    return originalOpenSuccessModal(
      total
    );
  };


// ============================================================
// REWARDS FORM
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    $("#rewards-form")
      ?.addEventListener(
        "submit",
        checkRewards
      );
  }
);
