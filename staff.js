const SUPABASE_URL = "https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";
let supabaseClient;

// Pizza Yard Supabase JWT recovery layer. Handles transient PGRST303
// ("JWT issued at future") without exposing any secret/service-role key.
let authRefreshPromise = null;
let lastAuthRecoveryAt = 0;
const nativeFetch = window.fetch.bind(window);

function isPizzaYardJwtError(response, body) {
  return response?.status === 401 && body?.code === "PGRST303" && /JWT issued at future/i.test(body?.message || "");
}

async function pizzaYardRefreshSession(client) {
  if (!client?.auth) return null;
  if (authRefreshPromise) return authRefreshPromise;
  const now = Date.now();
  if (now - lastAuthRecoveryAt < 1500) {
    try { const { data } = await client.auth.getSession(); return data?.session || null; } catch { return null; }
  }
  lastAuthRecoveryAt = now;
  authRefreshPromise = client.auth.refreshSession()
    .then(({ data, error }) => {
      if (error) { console.warn("Pizza Yard auth refresh failed", error); return null; }
      return data?.session || null;
    })
    .catch(error => { console.warn("Pizza Yard auth refresh failed", error); return null; })
    .finally(() => { authRefreshPromise = null; });
  return authRefreshPromise;
}

function makePizzaYardFetch(getClient) {
  return async function(input, init) {
    let response = await nativeFetch(input, init);
    if (response.status !== 401) return response;
    let body = null;
    try { body = await response.clone().json(); } catch {}
    const url = typeof input === "string" ? input : (input?.url || "");
    if (!url.includes("/rest/v1/") || !isPizzaYardJwtError(response, body)) return response;

    const client = getClient();
    const delays = [0, 2000, 5000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
      const session = await pizzaYardRefreshSession(client);
      if (!session?.access_token) continue;
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${session.access_token}`);
      try {
        const retry = input instanceof Request
          ? await nativeFetch(new Request(input.clone(), { headers }))
          : await nativeFetch(input, { ...(init || {}), headers });
        if (retry.status !== 401) return retry;
        let retryBody = null;
        try { retryBody = await retry.clone().json(); } catch {}
        if (!isPizzaYardJwtError(retry, retryBody)) return retry;
        response = retry;
      } catch (error) {
        console.warn("Pizza Yard REST retry failed", error);
      }
    }
    return response;
  };
}

supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {global:{fetch:makePizzaYardFetch(()=>supabaseClient)}});
const TOPPINGS=["Corn","Pepperoni","Mushroom","Tuna","Bacon","Ham","Bell Peppers","Sausage","Veg"];
const ICONS={Corn:"🌽",Pepperoni:"🔴",Mushroom:"🍄",Tuna:"🐟",Bacon:"🥓",Ham:"🍖","Bell Peppers":"🫑",Sausage:"🌭",Veg:"🥦"};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],money=v=>`$${Number(v||0).toFixed(2)}`,esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"),unique=a=>[...new Set(a)],priceFor=c=>c===0||c===1?20:25+Math.max(0,c-2)*3;
const BREAKFAST_MENU=[
 {id:"pancakes",name:"Classic Pancakes",desc:"3 pancakes",price:10},
 {id:"bacon",name:"Bacon Strips",price:5},
 {id:"sausage",name:"Pork Sausage",price:3},
 {id:"boiled_eggs",name:"Boiled Eggs",price:1.5},
 {id:"scrambled_eggs",name:"Scrambled Eggs",price:5},
 {id:"omelette",name:"Omelette",desc:"Add-ons can be written in notes",price:10},
 {id:"bakes",name:"Bakes",desc:"Cheese or saltfish",price:3},
 {id:"saltfish_cheese",name:"Saltfish & Cheese",price:3},
 {id:"local_bread",name:"Local Bread",price:3}
];
const breakfastQty=Object.fromEntries(BREAKFAST_MENU.map(x=>[x.id,0]));
const state={category:"pizza",mode:"whole",whole:[],left:[],right:[],quantity:1,type:"pickup",availability:Object.fromEntries(TOPPINGS.map(t=>[t,true])),repeatOrder:null,cart:[],paymentStatus:"unpaid",paymentMethod:"",storeMode:false};

function renderBreakfastMenu(){const el=$("#breakfast-menu");if(!el)return;el.innerHTML=BREAKFAST_MENU.map(x=>`<article class="breakfast-item"><div><strong>${esc(x.name)}</strong><small>${esc(x.desc||"")}</small></div><div class="breakfast-item-actions"><strong>${money(x.price)}</strong><div class="qty mini"><button type="button" data-bminus="${x.id}">−</button><output>${breakfastQty[x.id]}</output><button type="button" data-bplus="${x.id}">+</button></div></div></article>`).join("");$$('[data-bplus]').forEach(b=>b.addEventListener("click",()=>{breakfastQty[b.dataset.bplus]++;renderBreakfastMenu();updateSummary()}));$$('[data-bminus]').forEach(b=>b.addEventListener("click",()=>{breakfastQty[b.dataset.bminus]=Math.max(0,breakfastQty[b.dataset.bminus]-1);renderBreakfastMenu();updateSummary()}))}
function selectedBreakfastItems(){return BREAKFAST_MENU.filter(x=>breakfastQty[x.id]>0).map(x=>({id:x.id,name:x.name,quantity:breakfastQty[x.id],unit_price:x.price,line_total:breakfastQty[x.id]*x.price}))}
function breakfastTotal(){return selectedBreakfastItems().reduce((s,x)=>s+x.line_total,0)}
function setCategory(category){state.category=category;$$('.category').forEach(b=>b.classList.toggle('active',b.dataset.category===category));$("#pizza-staff-section").classList.toggle('hidden',category!=="pizza");$("#breakfast-staff-section").classList.toggle('hidden',category!=="breakfast");$("#summary-pizza").classList.toggle('hidden',category!=="pizza");$("#cart-summary").classList.toggle('hidden',category!=="pizza");$("#summary-toppings").classList.toggle('hidden',category!=="pizza");$("#summary-breakfast").classList.toggle('hidden',category!=="breakfast");$("#summary-note").textContent=category==="breakfast"?"Breakfast order ready to send.":"Ready to send.";updateSummary()}
function selectedUnique(){return unique(state.mode==="whole"?state.whole:[...state.left,...state.right])}
function currentItem(){const tops=selectedUnique();const unit=priceFor(tops.length);return {size:'12"',mode:state.mode,toppings:state.mode==="half"?{mode:"half_and_half",left:unique(state.left),right:unique(state.right)}:tops,topping_count:tops.length,unit_price:unit,quantity:state.quantity,extra_toppings:Math.max(0,tops.length-2),extra_topping_cost:Math.max(0,tops.length-2)*3,special_instructions:$("#instructions").value.trim()||null};}
function renderGrid(selector,selected,onToggle){const el=$(selector);el.innerHTML=TOPPINGS.map(t=>{const a=state.availability[t]!==false;return `<button type="button" class="topping ${selected.includes(t)?"selected":""} ${a?"":"sold"}" data-topping="${esc(t)}" ${a?"":"disabled"}>${ICONS[t]||"🍕"} ${esc(t)}${a?"":"<small>SOLD OUT</small>"}</button>`}).join("");$$(selector+" .topping").forEach(b=>b.addEventListener("click",()=>onToggle(b.dataset.topping)))}
function renderToppings(){renderGrid("#whole-toppings",state.whole,t=>{state.whole=state.whole.includes(t)?state.whole.filter(x=>x!==t):[...state.whole,t];renderToppings();updateSummary()});renderGrid("#left-toppings",state.left,t=>{state.left=state.left.includes(t)?state.left.filter(x=>x!==t):[...state.left,t];renderToppings();updateSummary()});renderGrid("#right-toppings",state.right,t=>{state.right=state.right.includes(t)?state.right.filter(x=>x!==t):[...state.right,t];renderToppings();updateSummary()})}
function itemLabel(it){if(it.mode==="half")return `12" Half & Half • Left: ${(it.toppings.left||[]).join(", ")||"Cheese"} • Right: ${(it.toppings.right||[]).join(", ")||"Cheese"}`;return `12" Whole • ${it.toppings.length?it.toppings.join(", "):"Cheese"}`}
function renderCart(){
 const list=$("#cart-list");
 $("#cart-count").textContent=`${state.cart.length+1} ITEM${state.cart.length+1===1?"":"S"}`;
 const all=[...state.cart,currentItem()];
 list.innerHTML=all.map((it,i)=>{
   const note=it.special_instructions?` • ${esc(it.special_instructions)}`:"";
   const action=i<state.cart.length?`<button type="button" class="remove-cart" data-i="${i}">REMOVE</button>`:`<span class="cart-current">CURRENT</span>`;
   return `<div class="cart-item"><div><strong>${i+1}. ${esc(itemLabel(it))}</strong><small>${it.quantity} box${it.quantity===1?"":"es"} • ${money(it.unit_price)} each${note}</small></div>${action}</div>`;
 }).join("");
 $$(".remove-cart").forEach(b=>b.addEventListener("click",()=>{state.cart.splice(Number(b.dataset.i),1);renderCart();updateSummary()}));
 $("#cart-summary").textContent=all.length>1?`${all.length} different pizza selections ready to send.`:"One pizza selection ready to send.";
}

function updateSummary(){if(state.category==="breakfast"){const items=selectedBreakfastItems(),total=breakfastTotal();$("#summary-breakfast").innerHTML=items.length?items.map(x=>`<span>${esc(x.name)} ×${x.quantity} — ${money(x.line_total)}</span>`).join(""):"<span class=\"muted\">No breakfast items selected yet</span>";$("#unit-price").textContent="—";$("#summary-qty").textContent=items.reduce((s,x)=>s+x.quantity,0);$("#delivery-fee").textContent="$0.00";$("#total").textContent=money(total);renderCart();return}const it=currentItem();const delivery=state.type==="delivery"&&(state.quantity+state.cart.reduce((s,x)=>s+Number(x.quantity||1),0))>=3?5:0;const total=it.unit_price*it.quantity+delivery+state.cart.reduce((s,x)=>s+Number(x.unit_price||0)*Number(x.quantity||1),0);$("#summary-pizza").textContent=state.mode==="whole"?'12" Whole Pizza':'12" Half & Half';$("#summary-toppings").innerHTML=state.mode==="half"?`<span>Left: ${state.left.length?state.left.map(esc).join(", "):"Cheese"}</span><span>Right: ${state.right.length?state.right.map(esc).join(", "):"Cheese"}</span>`:(it.toppings.length?it.toppings.map(t=>`<span>${ICONS[t]||"🍕"} ${esc(t)}</span>`).join(""):'<span class="muted">Cheese Pizza</span>');$("#unit-price").textContent=money(it.unit_price);$("#summary-qty").textContent=it.quantity;$("#delivery-fee").textContent=money(delivery);$("#total").textContent=money(total);$("#summary-note").textContent=state.type==="delivery"&&((it.quantity)+state.cart.reduce((s,x)=>s+Number(x.quantity||1),0))<3?"Delivery requires 3 boxes or more.":"Ready to send.";renderCart()}
async function loadAvailability(){try{const{data,error}=await supabaseClient.from("pizza_topping_availability").select("name,available");if(!error&&data)data.forEach(r=>state.availability[r.name]=r.available!==false)}catch(_){}renderToppings();updateSummary()}
function showApp(session){$("#login-view").classList.toggle("hidden",!!session);$("#app-view").classList.toggle("hidden",!session);if(session)loadAvailability()}
async function login(e){e.preventDefault();const b=$("#login-button");b.disabled=true;b.textContent="Signing in…";$("#login-error").textContent="";const{error}=await supabaseClient.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});if(error)$("#login-error").textContent=error.message;b.disabled=false;b.textContent="Sign In"}
function normalizePhone(v){return String(v).replace(/[\s()-]/g,"")}function validPhone(v){return !v||/^\d{7}$/.test(normalizePhone(v))}
let customerSearchTimer=null;
async function searchCustomers(term){const box=$("#customer-suggestions");if(!term){box.classList.add("hidden");box.innerHTML="";return}const{data,error}=await supabaseClient.from("pizza_orders").select("customer_name,customer_phone").or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`).order("created_at",{ascending:false}).limit(8);if(error||!data){box.classList.add("hidden");return}const seen=new Set(),rows=data.filter(x=>{const k=`${x.customer_name||""}|${x.customer_phone||""}`;if(seen.has(k))return false;seen.add(k);return true});box.innerHTML=rows.length?rows.map((x,i)=>`<button type="button" class="customer-suggestion" data-i="${i}"><span><strong>${esc(x.customer_name||"Walk-in Customer")}</strong><span>${esc(x.customer_phone||"No phone")}</span></span><b>USE</b></button>`).join(""):'<div class="customer-suggestion"><span>No previous customer found.</span></div>';box.classList.remove("hidden");$$('.customer-suggestion[data-i]').forEach(b=>b.addEventListener("click",()=>{const x=rows[Number(b.dataset.i)];$("#customer-name").value=x.customer_name||"";$("#customer-phone").value=x.customer_phone||"";box.classList.add("hidden");$("#customer-search").value="";loadRepeatOrder(x.customer_phone||"")}))}
async function loadRepeatOrder(phone){state.repeatOrder=null;$("#repeat-last")?.classList.add("hidden");if(!phone)return;const{data,error}=await supabaseClient.from("pizza_orders").select("*").eq("customer_phone",phone).neq("status","cancelled").order("created_at",{ascending:false}).limit(1).maybeSingle();if(error||!data)return;state.repeatOrder=data;const b=$("#repeat-last");if(b){b.textContent=`🔁 REPEAT LAST ORDER ${data.order_number?"#"+data.order_number:""}`;b.classList.remove("hidden")}}
function applyRepeatOrder(){const o=state.repeatOrder;if(!o)return;state.mode=o.toppings?.mode==="half_and_half"?"half":"whole";state.whole=Array.isArray(o.toppings)?[...o.toppings]:[];state.left=state.mode==="half"?[...(o.toppings.left||[])]:[];state.right=state.mode==="half"?[...(o.toppings.right||[])]:[];state.quantity=Number(o.quantity||1);state.type=o.order_type||"pickup";$("#qty").textContent=state.quantity;$("#delivery-fields").classList.toggle("hidden",state.type!=="delivery");$$('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));$$('.mode[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===state.type));$("#whole-builder").classList.toggle("hidden",state.mode!=="whole");$("#half-builder").classList.toggle("hidden",state.mode!=="half");$("#instructions").value=o.special_instructions||"";renderToppings();updateSummary()}
function addCurrentToCart(){if(state.mode==="half"&&(!state.left.length||!state.right.length)){$("#submit-error").textContent="Choose at least one topping on each half.";return false}state.cart.push(currentItem());state.mode="whole";state.whole=[];state.left=[];state.right=[];state.quantity=1;$("#qty").textContent="1";$("#instructions").value="";$$('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==="whole"));$("#whole-builder").classList.remove("hidden");$("#half-builder").classList.add("hidden");renderToppings();updateSummary();return true}
function resetForm(){BREAKFAST_MENU.forEach(x=>breakfastQty[x.id]=0);state.category="pizza";state.mode="whole";state.whole=[];state.left=[];state.right=[];state.quantity=1;state.type="pickup";state.cart=[];state.paymentStatus="unpaid";state.paymentMethod="";$("#staff-order-form").reset();$("#qty").textContent="1";$("#customer-search").value="";$("#repeat-last")?.classList.add("hidden");$("#delivery-fields").classList.add("hidden");$$('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==="whole"));$$('.mode[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type==="pickup"));$$('.payment').forEach(b=>b.classList.toggle('active',b.dataset.payment==="unpaid"));$("#payment-method").value="";$("#submit-error").textContent="";$("#delivery-error").textContent="";renderBreakfastMenu();renderToppings();setCategory("pizza");updateSummary()}
function nextSunday(){const d=new Date();const day=d.getDay();d.setDate(d.getDate()+(7-day)%7);return d.toISOString().slice(0,10)}
async function submit(e){e.preventDefault();$("#submit-error").textContent="";$("#delivery-error").textContent="";const name=$("#customer-name").value.trim(),phone=normalizePhone($("#customer-phone").value),email=$("#customer-email").value.trim(),address=$("#address").value.trim();if(state.category==="breakfast"){const selected=selectedBreakfastItems();if(!selected.length)return $("#submit-error").textContent="Choose at least one breakfast item.";const total=breakfastTotal();const b=$("#send-order");b.disabled=true;b.textContent="SENDING…";const target=nextSunday();const payload={target_sunday:target,customer_name:name||"Walk-in Customer",customer_phone:phone||"",items:selected,total,special_instructions:$("#instructions").value.trim()||null,status:"new"};const{data,error}=await supabaseClient.from("breakfast_orders").insert(payload).select("id").single();b.disabled=false;b.textContent="SEND ORDER TO DASHBOARD →";if(error){console.error(error);$("#submit-error").textContent="Could not send the breakfast order.";return}$("#success-text").textContent=`Breakfast order #${String(data.id).replaceAll("-","").slice(0,6).toUpperCase()} is now on the live dashboard.`;$("#success").classList.remove("hidden");resetForm();return}const all=[...state.cart,currentItem()],totalBoxes=all.reduce((s,x)=>s+Number(x.quantity||1),0);if(phone&&!validPhone(phone))return $("#submit-error").textContent="Enter a valid 7-digit Saint Lucia phone number.";if(state.mode==="half"&&(!state.left.length||!state.right.length))return $("#submit-error").textContent="Choose at least one topping on each half.";if(state.type==="delivery"&&totalBoxes<3)return $("#submit-error").textContent="Delivery requires 3 boxes or more.";if(state.type==="delivery"&&!address)return $("#delivery-error").textContent="Delivery address is required.";const delivery=state.type==="delivery"?5:0,subtotal=all.reduce((s,x)=>s+Number(x.unit_price||0)*Number(x.quantity||1),0),total=subtotal+delivery,items=all.map((x,i)=>({...x,item_number:i+1}));const first=items[0],token=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");const payload={customer_name:name||"Walk-in Customer",customer_phone:phone||"",customer_email:email||null,order_type:state.type,delivery_address:address||null,pizza_size:'12"',toppings:first.toppings,topping_count:first.topping_count,unit_price:first.unit_price,included_toppings:Math.min(first.topping_count,2),extra_toppings:first.extra_toppings,extra_topping_cost:first.extra_topping_cost,quantity:totalBoxes,delivery_fee:delivery,special_instructions:$("#instructions").value.trim()||null,total,status:"new",tracking_token:token,order_items:items,payment_status:state.paymentStatus,payment_method:$("#payment-method").value||null};const b=$("#send-order");b.disabled=true;b.textContent="SENDING…";const{data,error}=await supabaseClient.from("pizza_orders").insert(payload).select("order_number,id").single();b.disabled=false;b.textContent="SEND ORDER TO DASHBOARD →";if(error){console.error(error);$("#submit-error").textContent=error.message.includes("order_items")?"Please run the new Pizza Yard v2 SQL in Supabase first.":"Could not send the order. Check the dashboard/Supabase connection.";return}$("#success-text").textContent=`Order ${data?.order_number?"#"+data.order_number:""} with ${items.length} different pizza${items.length===1?"":"s"} is now on the live dashboard.`;$("#success").classList.remove("hidden");resetForm()}
function init(){
 $("#customer-search")?.addEventListener("input",e=>{clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(()=>searchCustomers(e.target.value.trim()),180)});$("#repeat-last")?.addEventListener("click",applyRepeatOrder);$("#customer-phone")?.addEventListener("blur",()=>loadRepeatOrder(normalizePhone($("#customer-phone").value)));document.addEventListener("click",e=>{if(!e.target.closest(".customer-quick"))$("#customer-suggestions")?.classList.add("hidden")});
 $$(".category").forEach(b=>b.addEventListener("click",()=>setCategory(b.dataset.category)));$("#login-form").addEventListener("submit",login);$("#logout").addEventListener("click",()=>supabaseClient.auth.signOut());$("#staff-order-form").addEventListener("submit",submit);$("#new-order").addEventListener("click",()=>$("#success").classList.add("hidden"));$("#add-pizza").addEventListener("click",addCurrentToCart);$("#store-mode").addEventListener("click",async()=>{state.storeMode=!state.storeMode;document.body.classList.toggle("store-mode",state.storeMode);$("#store-mode").textContent=state.storeMode?"📱 EXIT TABLET MODE":"📱 TABLET MODE";localStorage.setItem("pizzaYardStoreMode",state.storeMode?"1":"0");if(state.storeMode&&document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen()}catch(_){}}if(!state.storeMode&&document.fullscreenElement&&document.exitFullscreen){try{await document.exitFullscreen()}catch(_){}}});
 $$(".payment").forEach(b=>b.addEventListener("click",()=>{state.paymentStatus=b.dataset.payment;$$('.payment').forEach(x=>x.classList.toggle('active',x===b))}));
 $$("[data-note]").forEach(b=>b.addEventListener("click",()=>{const ta=$("#instructions"),note=b.dataset.note;const parts=ta.value.split(/,\s*/).filter(Boolean);if(!parts.includes(note))parts.push(note);ta.value=parts.join(", ")}));
 $$(".mode[data-mode]").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();const mode=b.dataset.mode;if(!["whole","half"].includes(mode))return;state.mode=mode;$$('.mode[data-mode]').forEach(x=>x.classList.toggle('active',x===b));$("#whole-builder").classList.toggle("hidden",mode!=="whole");$("#half-builder").classList.toggle("hidden",mode!=="half");renderToppings();updateSummary()}));
 $$(".mode[data-type]").forEach(b=>b.addEventListener("click",()=>{state.type=b.dataset.type;$$('.mode[data-type]').forEach(x=>x.classList.toggle('active',x===b));$("#delivery-fields").classList.toggle("hidden",state.type!=="delivery");updateSummary()}));
 $("#qty-minus").addEventListener("click",()=>{state.quantity=Math.max(1,state.quantity-1);$("#qty").textContent=state.quantity;updateSummary()});$("#qty-plus").addEventListener("click",()=>{state.quantity++;$("#qty").textContent=state.quantity;updateSummary()});
 if(localStorage.getItem("pizzaYardStoreMode")==="1"){$("#store-mode").click()};supabaseClient.auth.getSession().then(({data:{session}})=>showApp(session));supabaseClient.auth.onAuthStateChange((_e,s)=>showApp(s));renderBreakfastMenu();renderToppings();setCategory("pizza");updateSummary();
}
init();
