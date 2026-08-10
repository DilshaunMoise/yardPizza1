const SUPABASE_URL = "https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const TOPPINGS = ["Corn","Pepperoni","Mushroom","Tuna","Bacon","Ham","Bell Peppers","Sausage","Veg"];
const ICONS = { Corn:"🌽", Pepperoni:"🔴", Mushroom:"🍄", Tuna:"🐟", Bacon:"🥓", Ham:"🍖", "Bell Peppers":"🫑", Sausage:"🌭", Veg:"🥦" };
const state = { mode:"whole", whole:[], left:[], right:[], quantity:1, type:"pickup", availability:Object.fromEntries(TOPPINGS.map(t=>[t,true])) };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = v => `$${Number(v || 0).toFixed(2)}`;
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const unique = a => [...new Set(a)];
const priceFor = count => count === 0 || count === 1 ? 20 : 25 + Math.max(0,count-2)*3;
const selectedUnique = () => unique(state.mode === "whole" ? state.whole : [...state.left, ...state.right]);

function renderGrid(selector, selected, onToggle) {
  const el = $(selector);
  el.innerHTML = TOPPINGS.map(t => {
    const available = state.availability[t] !== false;
    return `<button type="button" class="topping ${selected.includes(t)?"selected":""} ${available?"":"sold"}" data-topping="${esc(t)}" ${available?"":"disabled"}>${ICONS[t] || "🍕"} ${esc(t)}${available?"":"<small>SOLD OUT</small>"}</button>`;
  }).join("");
  $$(selector + " .topping").forEach(btn => btn.addEventListener("click", () => onToggle(btn.dataset.topping)));
}
function renderToppings() {
  renderGrid("#whole-toppings", state.whole, t => { state.whole = state.whole.includes(t) ? state.whole.filter(x=>x!==t) : [...state.whole,t]; renderToppings(); updateSummary(); });
  renderGrid("#left-toppings", state.left, t => { state.left = state.left.includes(t) ? state.left.filter(x=>x!==t) : [...state.left,t]; renderToppings(); updateSummary(); });
  renderGrid("#right-toppings", state.right, t => { state.right = state.right.includes(t) ? state.right.filter(x=>x!==t) : [...state.right,t]; renderToppings(); updateSummary(); });
}
function updateSummary() {
  const tops = selectedUnique();
  const unit = priceFor(tops.length);
  const delivery = state.type === "delivery" && state.quantity >= 3 ? 5 : 0;
  const total = unit * state.quantity + delivery;
  $("#summary-pizza").textContent = state.mode === "whole" ? '12" Whole Pizza' : '12" Half & Half';
  $("#summary-toppings").innerHTML = state.mode === "half"
    ? `<span>Left: ${state.left.length ? state.left.map(esc).join(", ") : "Cheese"}</span><span>Right: ${state.right.length ? state.right.map(esc).join(", ") : "Cheese"}</span>`
    : (tops.length ? tops.map(t=>`<span>${ICONS[t] || "🍕"} ${esc(t)}</span>`).join("") : '<span class="muted">Cheese Pizza</span>');
  $("#unit-price").textContent = money(unit);
  $("#summary-qty").textContent = state.quantity;
  $("#delivery-fee").textContent = money(delivery);
  $("#total").textContent = money(total);
  $("#summary-note").textContent = state.type === "delivery" && state.quantity < 3 ? "Delivery requires 3 boxes or more." : `${tops.length ? tops.length + " unique topping" + (tops.length===1?"":"s") : "Cheese pizza"} • ready to send.`;
}
async function loadAvailability() {
  try {
    const {data,error} = await supabaseClient.from("pizza_topping_availability").select("name,available");
    if (!error && data) data.forEach(row => state.availability[row.name] = row.available !== false);
  } catch (_) {}
  renderToppings(); updateSummary();
}
function showApp(session) { $("#login-view").classList.toggle("hidden",!!session); $("#app-view").classList.toggle("hidden",!session); if(session) loadAvailability(); }
async function login(e) { e.preventDefault(); const b=$("#login-button"); b.disabled=true; b.textContent="Signing in…"; const {error}=await supabaseClient.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value}); if(error) $("#login-error").textContent=error.message; b.disabled=false; b.textContent="Sign In"; }
function normalizePhone(v){return String(v).replace(/[\s()-]/g,"");}
function validPhone(v){return /^\d{7}$/.test(normalizePhone(v));}
function resetForm(){ state.mode="whole"; state.whole=[]; state.left=[]; state.right=[]; state.quantity=1; state.type="pickup"; $("#staff-order-form").reset(); $("#qty").textContent="1"; $("#delivery-fields").classList.add("hidden"); $$(".mode[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode==="whole")); $$(".mode[data-type]").forEach(b=>b.classList.toggle("active",b.dataset.type==="pickup")); $("#submit-error").textContent=""; $("#delivery-error").textContent=""; renderToppings(); updateSummary(); }
async function submit(e){
  e.preventDefault(); $("#submit-error").textContent=""; $("#delivery-error").textContent="";
  const name=$("#customer-name").value.trim(), phone=normalizePhone($("#customer-phone").value), email=$("#customer-email").value.trim(), address=$("#address").value.trim(), instructions=$("#instructions").value.trim(), tops=selectedUnique();
  if(!name) return $("#submit-error").textContent="Customer name is required.";
  if(!validPhone(phone)) return $("#submit-error").textContent="Enter a valid 7-digit Saint Lucia phone number.";
  if(state.mode==="half" && (!state.left.length || !state.right.length)) return $("#submit-error").textContent="Choose at least one topping on each half.";
  if(state.type==="delivery" && state.quantity<3) return $("#submit-error").textContent="Delivery requires 3 boxes or more.";
  if(state.type==="delivery" && !address) return $("#delivery-error").textContent="Delivery address is required.";
  const unit=priceFor(tops.length), delivery=state.type==="delivery"?5:0, total=unit*state.quantity+delivery;
  const token=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");
  const payload={customer_name:name,customer_phone:phone,customer_email:email||null,order_type:state.type,delivery_address:address||null,pizza_size:'12"',toppings:state.mode==="half"?{mode:"half_and_half",left:unique(state.left),right:unique(state.right)}:tops,topping_count:tops.length,unit_price:unit,included_toppings:Math.min(tops.length,2),extra_toppings:Math.max(0,tops.length-2),extra_topping_cost:Math.max(0,tops.length-2)*3,quantity:state.quantity,delivery_fee:delivery,special_instructions:instructions||null,total,status:"new",tracking_token:token,order_source:"staff"};
  const b=$("#send-order"); b.disabled=true; b.textContent="SENDING…";
  const {data,error}=await supabaseClient.from("pizza_orders").insert(payload).select("order_number,id").single();
  b.disabled=false; b.textContent="SEND ORDER TO DASHBOARD →";
  if(error){console.error(error); $("#submit-error").textContent="Could not send the order. Check the dashboard/Supabase connection."; return;}
  $("#success-text").textContent=`Order ${data?.order_number ? "#"+data.order_number : ""} is now on the live dashboard.`; $("#success").classList.remove("hidden"); resetForm();
}
function setPizzaMode(mode){
  state.mode = mode === "half" ? "half" : "whole";
  $$(".mode[data-mode]").forEach(x => {
    const active = x.dataset.mode === state.mode;
    x.classList.toggle("active", active);
    x.setAttribute("aria-pressed", active ? "true" : "false");
  });
  $("#whole-builder").classList.toggle("hidden", state.mode !== "whole");
  $("#half-builder").classList.toggle("hidden", state.mode !== "half");
  renderToppings();
  updateSummary();
}

function init(){
  $("#login-form").addEventListener("submit",login); $("#logout").addEventListener("click",()=>supabaseClient.auth.signOut()); $("#staff-order-form").addEventListener("submit",submit); $("#new-order").addEventListener("click",()=>$("#success").classList.add("hidden"));
  $$(".mode[data-mode]").forEach(b=>b.addEventListener("click",(event)=>{
    event.preventDefault();
    event.stopPropagation();
    setPizzaMode(b.dataset.mode);
  }));
  $$(".mode[data-type]").forEach(b=>b.addEventListener("click",()=>{state.type=b.dataset.type; $$(".mode[data-type]").forEach(x=>x.classList.toggle("active",x===b)); $("#delivery-fields").classList.toggle("hidden",state.type!=="delivery"); updateSummary();}));
  $("#qty-minus").addEventListener("click",()=>{state.quantity=Math.max(1,state.quantity-1);$("#qty").textContent=state.quantity;updateSummary();});
  $("#qty-plus").addEventListener("click",()=>{state.quantity++;$("#qty").textContent=state.quantity;updateSummary();});
  supabaseClient.auth.getSession().then(({data:{session}})=>showApp(session)); supabaseClient.auth.onAuthStateChange((_e,s)=>showApp(s)); setPizzaMode("whole");
}
init();
