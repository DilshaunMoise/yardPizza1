const SUPABASE_URL="https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";

// Pizza Yard auth recovery:
// PostgREST can reject an otherwise valid staff session with PGRST303
// ("JWT issued at future"). Keep the existing dashboard/session intact,
// refresh the Auth session once, then replay the failed REST request with
// the fresh access token. This does not expose a service-role key.
let supabaseClient;
let authRefreshPromise=null;
let lastAuthRecoveryAt=0;
const nativeFetch=window.fetch.bind(window);

function isPostgrestJwtError(response,errorBody){
  return response?.status===401 && errorBody?.code==="PGRST303" && errorBody?.message==="JWT issued at future";
}

async function refreshStaffSession(){
  if(!supabaseClient)return null;
  const now=Date.now();
  if(authRefreshPromise)return authRefreshPromise;
  if(now-lastAuthRecoveryAt<1500){
    const {data}=await supabaseClient.auth.getSession();
    return data?.session||null;
  }
  lastAuthRecoveryAt=now;
  authRefreshPromise=supabaseClient.auth.refreshSession()
    .then(({data,error})=>{
      if(error){console.warn("Pizza Yard auth refresh failed",error);return null;}
      return data?.session||null;
    })
    .catch(error=>{console.warn("Pizza Yard auth refresh failed",error);return null;})
    .finally(()=>{authRefreshPromise=null});
  return authRefreshPromise;
}

async function resilientSupabaseFetch(input,init){
  const response=await nativeFetch(input,init);
  if(response.status!==401)return response;

  let body=null;
  try{body=await response.clone().json()}catch{}
  const url=typeof input==="string"?input:(input?.url||"");
  if(!url.includes("/rest/v1/")||!isPostgrestJwtError(response,body))return response;

  const session=await refreshStaffSession();
  if(!session?.access_token)return response;

  const headers=new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  headers.set("Authorization",`Bearer ${session.access_token}`);

  try{
    if(input instanceof Request){
      return await nativeFetch(new Request(input.clone(),{headers}));
    }
    return await nativeFetch(input,{...(init||{}),headers});
  }catch(error){
    console.warn("Pizza Yard REST retry failed",error);
    return response;
  }
}

supabaseClient=window.supabase?.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  global:{fetch:resilientSupabaseFetch}
});
const TOPPINGS=["Corn","Pepperoni","Mushroom","Tuna","Bacon","Ham","Bell Peppers","Sausage","Veg"];
const state={orders:[],selectedId:null,filter:"active",search:"",soundOn:true,speechOn:true,kitchenMode:false,reportsOpen:false,channel:null,alertTimeout:null,audioContext:null,toastTimeout:null,availability:{},reviews:[],lastAnnouncedId:null};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=v=>`$${Number(v||0).toFixed(2)}`;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const orderNumber=o=>o?.order_number?`#${o.order_number}`:`#${String(o?.id||"").replaceAll("-","").slice(0,6).toUpperCase()}`;
const statusLabel=s=>String(s||"").replaceAll("_"," ").toUpperCase();
const formatTime=v=>new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit"}).format(new Date(v));
const formatDateTime=v=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v));
const todayStart=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const elapsed=(v)=>{const ms=Math.max(0,Date.now()-new Date(v).getTime());const m=Math.floor(ms/60000),sec=Math.floor((ms%60000)/1000);return m?`${m}m ${String(sec).padStart(2,"0")}s`:`${sec}s`};
const statusAgeClass=o=>{const mins=(Date.now()-new Date(o.created_at).getTime())/60000;return mins>=30?"age-danger":mins>=15?"age-warn":"age-fresh"};
const isActive=s=>["new","preparing","in_oven","ready"].includes(s);
function setConnection(live){const e=$("#connection-status");e.textContent=live?"● Live":"● Reconnecting…";e.classList.toggle("live",live);e.classList.toggle("reconnecting",!live)}
function showToast(m){const t=$("#toast");t.textContent=m;t.classList.remove("hidden");clearTimeout(state.toastTimeout);state.toastTimeout=setTimeout(()=>t.classList.add("hidden"),3500)}
function playNotification(){if(!state.soundOn)return;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;state.audioContext ||= new A;const c=state.audioContext;if(c.state==="suspended")c.resume().catch(()=>{});const now=c.currentTime;[0,.18,.36,.54,1.05,1.23,1.41].forEach((offset,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=i%2?"square":"sawtooth";o.frequency.setValueAtTime(i%2?980:740,now+offset);g.gain.setValueAtTime(.0001,now+offset);g.gain.exponentialRampToValueAtTime(.34,now+offset+.025);g.gain.exponentialRampToValueAtTime(.0001,now+offset+.16);o.connect(g).connect(c.destination);o.start(now+offset);o.stop(now+offset+.18)});if(navigator.vibrate)navigator.vibrate([300,120,300,120,500]);}catch(e){console.warn(e)}}
function announceOrder(o){if(!state.speechOn||!("speechSynthesis" in window))return;const parts=[];parts.push(`New Pizza Yard order ${o.order_number||""}`);if(o.customer_name&&o.customer_name!=="Walk-in Customer")parts.push(`for ${o.customer_name}`);parts.push(o.order_source==="staff"?"staff order":"online order");parts.push(o.order_type==="delivery"?"delivery":"pickup");parts.push(`${o.quantity||1} 12 inch pizza${Number(o.quantity)===1?"":"s"}`);if(o.toppings?.mode==="half_and_half"){parts.push(`half and half, left side ${((o.toppings.left||[]).join(", ")||"cheese")}, right side ${((o.toppings.right||[]).join(", ")||"cheese")}`)}else if(Array.isArray(o.toppings)&&o.toppings.length){parts.push(`toppings ${o.toppings.join(", ")}`)}parts.push(`total ${Number(o.total||0).toFixed(2)} dollars`);window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(parts.join(". "));u.rate=.92;u.pitch=1;u.volume=1;window.speechSynthesis.speak(u)}
function showNewOrderAlert(o){state.lastAnnouncedId=o.id;const a=$("#new-order-alert");$("#new-order-alert-text").textContent=`${orderNumber(o)} • ${o.customer_name||"Walk-in Customer"} • ${money(o.total)} • ${o.order_source==="staff"?"STAFF ORDER":"ONLINE ORDER"}`;a.classList.remove("hidden");clearTimeout(state.alertTimeout);state.alertTimeout=setTimeout(()=>a.classList.add("hidden"),12000);playNotification();setTimeout(()=>playNotification(),2200);setTimeout(()=>playNotification(),5000);setTimeout(()=>announceOrder(o),250)}
function toppingText(o){if(Array.isArray(o.order_items)&&o.order_items.length>1)return o.order_items.map((it,i)=>`Pizza ${i+1}: ${it.mode==="half"?`Left: ${(it.toppings.left||[]).join(", ")||"Cheese"} | Right: ${(it.toppings.right||[]).join(", ")||"Cheese"}`:(it.toppings.length?it.toppings.join(", "):"Cheese")}`).join(" • ");const t=o.toppings;if(t&&typeof t==="object"&&!Array.isArray(t)&&t.mode==="half_and_half")return `Left: ${(t.left||[]).join(", ")||"Cheese"} | Right: ${(t.right||[]).join(", ")||"Cheese"}`;return Array.isArray(t)&&t.length?t.join(", "):"Cheese Pizza"}
function filteredOrders(){const q=state.search.trim().toLowerCase();return [...state.orders].filter(o=>state.filter==="active"?isActive(o.status):state.filter==="all"?true:state.filter==="staff"?o.order_source==="staff":state.filter==="online"?o.order_source!=="staff":o.status===state.filter).filter(o=>!q||[o.customer_name,o.customer_phone,o.customer_email,orderNumber(o),toppingText(o)].some(v=>String(v??"").toLowerCase().includes(q))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
function updateStats(){const today=state.orders.filter(o=>new Date(o.created_at)>=todayStart());$("#stat-new").textContent=state.orders.filter(o=>o.status==="new").length;$("#stat-preparing").textContent=state.orders.filter(o=>o.status==="preparing"||o.status==="in_oven").length;$("#stat-ready").textContent=state.orders.filter(o=>o.status==="ready").length;$("#stat-today").textContent=today.length;$("#stat-sales").textContent=money(today.filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Number(o.total||0),0))}
function renderOrders(){const list=$("#orders-list"),orders=filteredOrders();if(!orders.length){list.innerHTML='<div class="empty-state">No orders in this view.</div>';return}list.innerHTML=orders.map(o=>`<article class="order-card ${state.selectedId===o.id?"selected ":""}${o.status==="new"?"is-new":""}" data-id="${esc(o.id)}"><div class="order-card-top"><div><div class="order-number">${orderNumber(o)} <span class="source-badge source-${o.order_source==="staff"?"staff":"online"}">${o.order_source==="staff"?"STAFF":"ONLINE"}</span></div><div class="customer">${esc(o.customer_name)}</div></div><div><span class="status-pill status-${esc(o.status)}">${statusLabel(o.status)}</span><div class="time"><span>${formatTime(o.created_at)}</span> • <span class="order-timer ${statusAgeClass(o)}" data-created="${esc(o.created_at)}">${elapsed(o.created_at)}</span></div></div></div><div class="meta"><span>${o.order_type==="delivery"?"🛵 Delivery":"🏪 Pickup"}</span><span>🍕 ${esc(o.quantity)} box${Number(o.quantity)===1?"":"es"}</span><span>${esc(o.pizza_size||'12"')}</span></div><div class="card-bottom"><div class="toppings-preview">${esc(toppingText(o))}</div><div class="total">${money(o.total)}</div></div></article>`).join("");$$('.order-card').forEach(c=>c.addEventListener("click",()=>{state.selectedId=c.dataset.id;renderOrders();renderDetails()}))}
function renderDetails(){const p=$("#details-panel"),o=state.orders.find(x=>x.id===state.selectedId);if(!o){p.innerHTML='<div class="details-empty"><span>🍕</span><h2>Select an order</h2><p>New orders will appear here automatically.</p></div>';return}const history=o.customer_phone?state.orders.filter(x=>x.customer_phone===o.customer_phone).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)):[o];const chips=o.toppings&&typeof o.toppings==="object"&&!Array.isArray(o.toppings)&&o.toppings.mode==="half_and_half"?`<div class="half-order"><strong>Left half</strong><span>${esc((o.toppings.left||[]).join(", ")||"Cheese")}</span><strong>Right half</strong><span>${esc((o.toppings.right||[]).join(", ")||"Cheese")}</span></div>`:(Array.isArray(o.toppings)&&o.toppings.length?o.toppings.map(x=>`<span class="detail-chip">${esc(x)}</span>`).join(""):'<span class="muted">Cheese Pizza</span>');p.innerHTML=`<div class="details-content"><div class="details-header"><div><div class="eyebrow">ORDER ${orderNumber(o)}</div><h2>${esc(o.customer_name)}</h2><div class="details-sub">Received ${formatDateTime(o.created_at)}</div></div><span class="status-pill status-${esc(o.status)}">${statusLabel(o.status)}</span></div><div class="detail-section"><h3>Order Source</h3><div class="detail-row"><span>Source</span><strong>${o.order_source==="staff"?"Staff tablet":"Online website"}</strong></div></div><div class="detail-section"><h3>Customer</h3><div class="detail-row"><span>Name</span><strong>${esc(o.customer_name)}</strong></div><div class="detail-row"><span>Phone</span><strong>${esc(o.customer_phone)}</strong></div><div class="detail-row"><span>Email</span><strong>${esc(o.customer_email||"Not provided")}</strong></div><div class="detail-links"><a href="tel:${esc(o.customer_phone)}">📞 Call</a>${o.customer_email?`<a href="mailto:${esc(o.customer_email)}">✉️ Email</a>`:""}</div></div><div class="detail-section"><h3>Customer History</h3><div class="detail-row"><span>Previous orders</span><strong>${Math.max(0,history.length-1)}</strong></div><div class="detail-row"><span>Lifetime orders</span><strong>${history.length}</strong></div><div class="detail-row"><span>Lifetime sales</span><strong>${money(history.filter(x=>x.status!=="cancelled").reduce((s,x)=>s+Number(x.total||0),0))}</strong></div></div><div class="detail-section"><h3>Pizza</h3><div class="detail-row"><span>Size</span><strong>${esc(o.pizza_size||'12"')}</strong></div><div class="detail-row"><span>Unique toppings</span><strong>${esc(o.topping_count)}</strong></div><div class="detail-row"><span>Quantity</span><strong>${esc(o.quantity)}</strong></div><div class="detail-toppings">${chips}</div></div><div class="detail-section"><h3>Order Type</h3><div class="detail-row"><span>Type</span><strong>${o.order_type==="delivery"?"Delivery":"Pickup"}</strong></div>${o.order_type==="delivery"?`<div class="instructions">${esc(o.delivery_address||"No address supplied")}</div>`:""}</div><div class="detail-section"><h3>Pricing</h3><div class="detail-row"><span>Unit price</span><strong>${money(o.unit_price)}</strong></div><div class="detail-row"><span>Included toppings</span><strong>${esc(o.included_toppings)}</strong></div><div class="detail-row"><span>Extra toppings</span><strong>${esc(o.extra_toppings)}</strong></div><div class="detail-row"><span>Extra topping cost</span><strong>${money(o.extra_topping_cost)}</strong></div><div class="detail-row"><span>Quantity</span><strong>${esc(o.quantity)}</strong></div><div class="detail-row"><span>Delivery fee</span><strong>${money(o.delivery_fee)}</strong></div><div class="detail-total"><span>Final total</span><strong>${money(o.total)}</strong></div></div><div class="detail-section"><h3>Payment</h3><div class="detail-row"><span>Status</span><strong>${esc(o.payment_status||"unpaid")}</strong></div><div class="payment-actions"><button id="mark-paid">Mark Paid</button><button id="mark-unpaid">Mark Unpaid</button></div></div>${o.special_instructions?`<div class="detail-section"><h3>Special Instructions</h3><div class="instructions">${esc(o.special_instructions)}</div></div>`:""}<div class="detail-section"><div class="detail-actions"><button class="detail-print" id="print-order">🖨 Print Order</button><button class="detail-print" id="repeat-order">🔁 Repeat Order</button></div><h3>Update Status</h3><div class="status-actions">${["new","preparing","in_oven","ready","completed","cancelled"].map(s=>`<button class="status-btn ${o.status===s?"active":""}" data-status="${s}">${statusLabel(s)}</button>`).join("")}</div></div></div>`;$("#print-order")?.addEventListener("click",()=>printOrder(o));$("#repeat-order")?.addEventListener("click",()=>repeatOrder(o));$("#mark-paid")?.addEventListener("click",()=>setPayment(o.id,"paid"));$("#mark-unpaid")?.addEventListener("click",()=>setPayment(o.id,"unpaid"));$$('.status-btn').forEach(b=>b.addEventListener("click",()=>updateStatus(o.id,b.dataset.status)))}
function repeatOrder(o){
  const payload={...o}; delete payload.id; delete payload.created_at; delete payload.order_number; delete payload.status; payload.status="new"; payload.order_source="staff"; payload.tracking_token=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,"0")).join("");
  supabaseClient.from("pizza_orders").insert(payload).select("order_number,id").single().then(({data,error})=>{if(error){console.error(error);showToast("Could not repeat this order.");return}showToast(`Repeat order ${data?.order_number?"#"+data.order_number:"created"}.`)});
}
function printOrder(o){const w=window.open("","_blank","width=600,height=800");if(!w)return;w.document.write(`<html><head><title>${orderNumber(o)} Pizza Yard</title><style>body{font-family:Arial;padding:25px}h1{font-size:24px}h2{margin-top:22px;border-bottom:1px solid #ddd;padding-bottom:6px}.line{margin:7px 0}.total{font-size:24px;font-weight:bold;margin-top:18px}.half{display:grid;grid-template-columns:100px 1fr;gap:8px}</style></head><body><h1>🍕 Pizza Yard</h1><div>${orderNumber(o)} • ${o.order_source==="staff"?"STAFF":"ONLINE"}</div><div class="line"><b>Customer:</b> ${esc(o.customer_name)}</div><div class="line"><b>Phone:</b> ${esc(o.customer_phone)}</div><div class="line"><b>Type:</b> ${o.order_type}</div><h2>Pizza</h2><div class="line"><b>Size:</b> ${esc(o.pizza_size||'12"')}</div><div class="line"><b>Qty:</b> ${o.quantity}</div><div class="line"><b>Toppings:</b> ${esc(toppingText(o))}</div>${o.delivery_address?`<div class="line"><b>Address:</b> ${esc(o.delivery_address)}</div>`:""}${o.special_instructions?`<div class="line"><b>Notes:</b> ${esc(o.special_instructions)}</div>`:""}<div class="total">TOTAL ${money(o.total)}</div></body></html>`);w.document.close();w.focus();w.print()}
async function loadOrders(){
  if(!supabaseClient){$("#orders-list").innerHTML='<div class="empty-state">Supabase is not configured.</div>';return}
  let {data,error}=await supabaseClient.from("pizza_orders").select("*").order("created_at",{ascending:false});
  if(error && error.code==="PGRST303"){
    await refreshStaffSession();
    ({data,error}=await supabaseClient.from("pizza_orders").select("*").order("created_at",{ascending:false}));
  }
  if(error){console.error(error);$("#orders-list").innerHTML='<div class="empty-state">Unable to load orders. Reconnecting to staff session…</div>';return}
  state.orders=data||[];updateStats();renderReports();renderOrders();renderDetails();
}
function upsertOrder(o,isNew=false){const i=state.orders.findIndex(x=>x.id===o.id);if(i===-1)state.orders.push(o);else state.orders[i]=o;updateStats();renderReports();if(isNew)state.selectedId=o.id;renderOrders();renderDetails();if(isNew)showNewOrderAlert(o)}
function subscribeToOrders(){if(!supabaseClient)return;if(state.channel)supabaseClient.removeChannel(state.channel);state.channel=supabaseClient.channel("pizza-orders-live").on("postgres_changes",{event:"INSERT",schema:"public",table:"pizza_orders"},p=>upsertOrder(p.new,true)).on("postgres_changes",{event:"UPDATE",schema:"public",table:"pizza_orders"},p=>upsertOrder(p.new,false)).subscribe(s=>{if(s==="SUBSCRIBED")setConnection(true);else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(s)){setConnection(false);setTimeout(()=>subscribeToOrders(),2500)}})}
async function setPayment(id,payment_status){const{error}=await supabaseClient.from("pizza_orders").update({payment_status}).eq("id",id);if(error){showToast("Could not update payment.");return}const o=state.orders.find(x=>x.id===id);if(o){o.payment_status=payment_status;renderDetails()}showToast(payment_status==="paid"?"Order marked paid.":"Order marked unpaid.")}
async function updateStatus(id,status){const o0=state.orders.find(x=>x.id===id);if(status==="cancelled"&&!confirm(`Cancel order ${orderNumber(o0)}? This cannot be undone.`))return;const{error}=await supabaseClient.from("pizza_orders").update({status}).eq("id",id);if(error){console.error(error);showToast("Could not update order status.");return}const o=state.orders.find(x=>x.id===id);if(o)upsertOrder({...o,status});showToast(`Order ${orderNumber(o)} marked ${statusLabel(status)}.`);if(status==="ready") announceReady(o);}
function announceReady(o){if(!state.speechOn||!("speechSynthesis" in window))return;const u=new SpeechSynthesisUtterance(`Pizza Yard order ${o.order_number||""} is ready for ${o.order_type==="delivery"?"delivery":"pickup"}.`);u.rate=.9;window.speechSynthesis.cancel();window.speechSynthesis.speak(u)}
async function loadAvailability(){const{data,error}=await supabaseClient.from("pizza_topping_availability").select("name,available");if(error){$("#availability-list").innerHTML='<span class="muted">Menu controls are unavailable until the database upgrade is run.</span>';return}state.availability=Object.fromEntries(data.map(r=>[r.name,r.available]));renderAvailability()}
function renderAvailability(){$("#availability-list").innerHTML=TOPPINGS.map(t=>`<button class="availability-btn ${state.availability[t]!==false?"available":"soldout"}" data-topping="${esc(t)}"><span>${esc(t)}</span><strong>${state.availability[t]!==false?"AVAILABLE":"SOLD OUT"}</strong></button>`).join("");$$('.availability-btn').forEach(b=>b.addEventListener("click",()=>toggleAvailability(b.dataset.topping)))}
async function toggleAvailability(name){const next=state.availability[name]===false;const{error}=await supabaseClient.from("pizza_topping_availability").upsert({name,available:next});if(error){showToast("Could not change topping availability.");return}state.availability[name]=next;renderAvailability();showToast(`${name} is ${next?"available":"sold out"}.`)}
function setupFilters(){$("#order-date")?.addEventListener("change",renderOrders);$$("#filters .filter").forEach(b=>b.addEventListener("click",()=>{state.filter=b.dataset.filter;$$('#filters .filter').forEach(x=>x.classList.toggle("active",x===b));renderOrders()}));$("#order-search")?.addEventListener("input",e=>{state.search=e.target.value;renderOrders()})}
function setupSound(){$("#sound-toggle").addEventListener("click",()=>{state.soundOn=!state.soundOn;const b=$("#sound-toggle");b.textContent=state.soundOn?"🔊 LOUD SOUND ON":"🔕 Sound Off";b.setAttribute("aria-pressed",String(state.soundOn));if(state.soundOn)playNotification()});$("#test-sound")?.addEventListener("click",()=>{state.soundOn=true;playNotification()})}
async function handleLogin(e){e.preventDefault();const b=$("#login-button");b.disabled=true;b.textContent="Signing in…";$("#login-error").textContent="";const{error}=await supabaseClient.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});if(error)$("#login-error").textContent=error.message;b.disabled=false;b.textContent="Sign In"}
function showDashboard(session){$("#login-view").classList.toggle("hidden",!!session);$("#dashboard-view").classList.toggle("hidden",!session);if(session){subscribeToOrders();loadOrders();loadAvailability();loadReviews()}else if(state.channel&&supabaseClient){supabaseClient.removeChannel(state.channel);state.channel=null}}
async function loadReviews(){const el=$("#reviews-admin-list");if(!el)return;const{data,error}=await supabaseClient.from("pizza_reviews").select("*").order("created_at",{ascending:false});if(error){el.innerHTML='<span class="muted">Reviews database setup is required before reviews can be managed.</span>';return}state.reviews=data||[];renderReviews()}
function renderReviews(){const el=$("#reviews-admin-list");if(!state.reviews.length){el.innerHTML='<span class="muted">No reviews yet.</span>';return}el.innerHTML=state.reviews.map(r=>`<article class="review-admin-card"><div class="review-admin-top"><strong>${esc(r.display_name||"Customer")}</strong><span class="review-stars">${"★".repeat(Number(r.rating))}${"☆".repeat(5-Number(r.rating))}</span></div><p>${esc(r.comment)}</p><small class="muted">${new Date(r.created_at).toLocaleString()} • ${r.approved?"Published":"Pending"}</small><div class="review-admin-actions"><button class="approve" data-review="${esc(r.id)}" data-approved="true">${r.approved?"Published":"Approve"}</button><button class="hide" data-review="${esc(r.id)}" data-approved="false">Hide</button></div></article>`).join("");$$('[data-review]').forEach(b=>b.addEventListener("click",()=>updateReview(b.dataset.review,b.dataset.approved==="true")))}
async function updateReview(id,approved){const{error}=await supabaseClient.from("pizza_reviews").update({approved}).eq("id",id);if(error){showToast("Could not update review.");return}const r=state.reviews.find(x=>x.id===id);if(r)r.approved=approved;renderReviews();showToast(approved?"Review approved.":"Review hidden.")}
function renderReports(){
  const today=state.orders.filter(o=>new Date(o.created_at)>=todayStart()&&o.status!=="cancelled");
  const sales=today.reduce((s,o)=>s+Number(o.total||0),0);
  const avg=today.length?sales/today.length:0;
  const online=today.filter(o=>o.order_source!=="staff").length, staff=today.filter(o=>o.order_source==="staff").length;
  const pickup=today.filter(o=>o.order_type==="pickup").length, delivery=today.filter(o=>o.order_type==="delivery").length;
  $("#closing-report").innerHTML=`<div><span>Orders</span><strong>${today.length}</strong></div><div><span>Sales</span><strong>${money(sales)}</strong></div><div><span>Average</span><strong>${money(avg)}</strong></div><div><span>Online</span><strong>${online}</strong></div><div><span>Staff</span><strong>${staff}</strong></div><div><span>Pickup</span><strong>${pickup}</strong></div><div><span>Delivery</span><strong>${delivery}</strong></div>`;
  const hours=Array.from({length:24},()=>0); today.forEach(o=>hours[new Date(o.created_at).getHours()]++); const max=Math.max(1,...hours);
  $("#busy-report").innerHTML=hours.map((n,h)=>n?`<div class="busy-row"><span>${new Date(2000,0,1,h).toLocaleTimeString([], {hour:"numeric"})}</span><div><i style="width:${Math.round(n/max*100)}%"></i></div><strong>${n}</strong></div>`:"").join("")||'<span class="muted">No orders yet today.</span>';
  const counts={}; today.forEach(o=>{const t=o.toppings;if(t?.mode==="half_and_half"){[...(t.left||[]),...(t.right||[])].forEach(x=>counts[x]=(counts[x]||0)+1)} else if(Array.isArray(t)) t.forEach(x=>counts[x]=(counts[x]||0)+1)}); const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $("#topping-report").innerHTML=top.length?top.map(([n,c],i)=>`<div><span>${i+1}. ${esc(n)}</span><strong>${c}</strong></div>`).join(""):'<span class="muted">No toppings ordered yet today.</span>';
}
function tickTimers(){document.querySelectorAll(".order-timer[data-created]").forEach(e=>{e.textContent=elapsed(e.dataset.created);const m=(Date.now()-new Date(e.dataset.created).getTime())/60000;e.classList.toggle("age-warn",m>=15&&m<30);e.classList.toggle("age-danger",m>=30)})}
function setKitchenMode(on){state.kitchenMode=on;document.body.classList.toggle("kitchen-mode",on);const b=$("#kitchen-toggle");b?.setAttribute("aria-pressed",String(on));if(b)b.textContent=on?"🧑‍🍳 EXIT KITCHEN MODE":"🍕 KITCHEN MODE";renderOrders();renderDetails()}
function init(){$("#login-form").addEventListener("submit",handleLogin);$("#logout-button").addEventListener("click",()=>supabaseClient.auth.signOut());setupFilters();setupSound();$("#kitchen-toggle")?.addEventListener("click",()=>setKitchenMode(!state.kitchenMode));$("#reports-toggle")?.addEventListener("click",()=>{state.reportsOpen=!state.reportsOpen;$("#reports-panel").classList.toggle("hidden",!state.reportsOpen);if(state.reportsOpen)renderReports()});$("#replay-order")?.addEventListener("click",()=>{const o=state.orders.find(x=>x.id===state.selectedId)||state.orders.find(x=>x.id===state.lastAnnouncedId);if(o)announceOrder(o)});setInterval(tickTimers,1000);$("#sound-toggle")?.insertAdjacentHTML("afterend",`<button id="speech-toggle" class="ghost-btn" type="button" aria-pressed="true">🗣️ VOICE ON</button>`);$("#speech-toggle")?.addEventListener("click",()=>{state.speechOn=!state.speechOn;const b=$("#speech-toggle");b.textContent=state.speechOn?"🗣️ VOICE ON":"🔇 Voice Off";b.setAttribute("aria-pressed",String(state.speechOn));if(state.speechOn&&"speechSynthesis" in window){const u=new SpeechSynthesisUtterance("Pizza Yard voice alerts are on.");window.speechSynthesis.cancel();window.speechSynthesis.speak(u)}});if(!supabaseClient)return;supabaseClient.auth.getSession().then(({data:{session}})=>showDashboard(session));supabaseClient.auth.onAuthStateChange((_e,s)=>showDashboard(s))

  // If Auth rotates/replaces the token, immediately reload all staff data.
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    if(event==="TOKEN_REFRESHED" && session){
      loadOrders();
      loadBreakfastOrders();
      loadAvailability();
      loadReviews();
      loadInventorySummary();
    }
  });
}
init();


// === Pizza Yard Sunday Breakfast + Inventory + Fullscreen kitchen ===
const breakfastState={channel:null,rows:[]};
function upcomingSundayForDashboard(){const d=new Date();const day=d.getDay();d.setDate(d.getDate()+(7-day)%7);return d.toISOString().slice(0,10)}
function breakfastDateLabel(v){return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(new Date(v+'T12:00:00'))}
function breakfastStatusLabel(s){return String(s||'').replaceAll('_',' ').toUpperCase()}
function renderBreakfastOrders(rows){const list=document.querySelector('#breakfast-orders-list'),count=document.querySelector('#breakfast-count');if(!list)return;breakfastState.rows=rows||[];if(count)count.textContent=`${breakfastState.rows.length} order${breakfastState.rows.length===1?'':'s'}`;if(!breakfastState.rows.length){list.innerHTML='<div class="empty-state">No Sunday breakfast pre-orders yet.</div>';return}list.innerHTML=breakfastState.rows.map(o=>{const items=Array.isArray(o.items)?o.items:[];const summary=items.map(i=>`${i.name} ×${i.quantity}`).join(' • ')||'Breakfast order';return `<article class="breakfast-order-row" data-breakfast-id="${esc(o.id)}"><div class="breakfast-order-main"><strong>🍳 ${esc(o.customer_name)} · ${esc(o.customer_phone)}</strong><small>${esc(summary)}</small><span class="breakfast-status ${esc(o.status)}">${breakfastStatusLabel(o.status)}</span></div><div class="breakfast-order-total">${money(o.total)}</div></article>`}).join('');list.querySelectorAll('.breakfast-order-row').forEach(el=>el.addEventListener('click',()=>{const o=breakfastState.rows.find(x=>x.id===el.dataset.breakfastId);if(!o)return;const items=(Array.isArray(o.items)?o.items:[]).map(i=>`${i.name} ×${i.quantity} — ${money(i.line_total)}`).join('\n');const next=prompt(`Breakfast order for ${o.customer_name}\nPhone: ${o.customer_phone}\n\n${items}\n\nNotes: ${o.special_instructions||'None'}\n\nStatus: new, preparing, ready, completed, cancelled`,o.status);if(next&&['new','preparing','ready','completed','cancelled'].includes(next)&&next!==o.status)updateBreakfastStatus(o.id,next)}))}
async function loadBreakfastOrders(){
  if(!supabaseClient)return;
  const label=document.querySelector('#breakfast-period-label');if(label)label.textContent='Live breakfast orders';
  let {data,error}=await supabaseClient.from('breakfast_orders').select('*').order('created_at',{ascending:false}).limit(100);
  if(error && error.code==='PGRST303'){
    await refreshStaffSession();
    ({data,error}=await supabaseClient.from('breakfast_orders').select('*').order('created_at',{ascending:false}).limit(100));
  }
  if(error){console.error('Breakfast load failed',error);const list=document.querySelector('#breakfast-orders-list');if(list)list.innerHTML='<div class="empty-state">Breakfast orders could not be loaded. Reconnecting to staff session…</div>';return}
  renderBreakfastOrders(data||[])
}
async function updateBreakfastStatus(id,status){const {error}=await supabaseClient.from('breakfast_orders').update({status}).eq('id',id);if(error){showToast('Could not update breakfast order.');return}showToast(`Breakfast order marked ${breakfastStatusLabel(status)}.`);loadBreakfastOrders()}
function subscribeToBreakfast(){if(!supabaseClient)return;if(breakfastState.channel)supabaseClient.removeChannel(breakfastState.channel);breakfastState.channel=supabaseClient.channel('breakfast-orders-live').on('postgres_changes',{event:'*',schema:'public',table:'breakfast_orders'},()=>loadBreakfastOrders()).subscribe()}
async function loadInventorySummary(){const el=document.querySelector('#inventory-summary-list');if(!el||!supabaseClient)return;const {data,error}=await supabaseClient.from('inventory_items').select('id,name,quantity,unit,min_quantity,weight,weight_unit,min_weight,weight_tracking').order('name');if(error){el.innerHTML='<span class="muted">Inventory summary unavailable. Open the Inventory page for full controls.</span>';return}const needs=(data||[]).filter(i=>{const out=Number(i.quantity||0)<=0||(i.weight_tracking&&i.weight!=null&&Number(i.weight)<=0);const low=Number(i.quantity||0)<=Number(i.min_quantity||0)||(i.weight_tracking&&i.min_weight!=null&&i.weight!=null&&Number(i.weight)<=Number(i.min_weight));return out||low}).slice(0,10);if(!needs.length){el.innerHTML='<span class="muted">No items currently at or below their minimum. ✅</span>';return}el.innerHTML=needs.map(i=>{const out=Number(i.quantity||0)<=0||(i.weight_tracking&&i.weight!=null&&Number(i.weight)<=0);return `<div class="inventory-mini-row"><div><div class="inv-name">${esc(i.name)}</div><div class="inv-meta">${Number(i.quantity||0).toLocaleString(undefined,{maximumFractionDigits:3})} ${esc(i.unit)}${i.weight_tracking&&i.weight!=null?` • ${Number(i.weight).toLocaleString(undefined,{maximumFractionDigits:3})} ${esc(i.weight_unit)}`:''}</div></div><span class="inv-state ${out?'out':'low'}">${out?'OUT':'LOW'}</span><a class="ghost-btn" href="inventory.html">Open</a></div>`}).join('')}
function openFullscreenOrder(o){const modal=document.querySelector('#fullscreen-order-modal'),content=document.querySelector('#fullscreen-order-content');if(!modal||!content||!o)return;const items=Array.isArray(o.order_items)&&o.order_items.length?o.order_items.map((it,i)=>`Pizza ${i+1}: ${esc(it.mode==='half'?`Left: ${(it.toppings?.left||[]).join(', ')||'Cheese'} | Right: ${(it.toppings?.right||[]).join(', ')||'Cheese'}`:(it.toppings||[]).join(', ')||'Cheese')}`):[esc(toppingText(o))];content.innerHTML=`<div class="fullscreen-order-line"><span>Order</span><strong>${esc(orderNumber(o))}</strong></div><div class="fullscreen-order-line"><span>Customer</span><strong>${esc(o.customer_name||'Walk-in Customer')}</strong></div><div class="fullscreen-order-line"><span>Type</span><strong>${o.order_type==='delivery'?'🛵 Delivery':'🏪 Pickup'}</strong></div><div class="fullscreen-order-line"><span>Items</span><strong>${items.join('<br>')}</strong></div><div class="fullscreen-order-line"><span>Quantity</span><strong>${esc(o.quantity||1)}</strong></div><div class="fullscreen-order-line"><span>Total</span><strong>${money(o.total)}</strong></div>${o.special_instructions?`<div class="fullscreen-order-line"><span>Notes</span><strong>${esc(o.special_instructions)}</strong></div>`:''}`;modal.classList.remove('hidden');document.body.classList.add('modal-open');if(state.speechOn)announceOrder(o)}
function closeFullscreenOrder(){document.querySelector('#fullscreen-order-modal')?.classList.add('hidden');document.body.classList.remove('modal-open')}
const oldShowNewOrderAlert=showNewOrderAlert;
showNewOrderAlert=function(o){oldShowNewOrderAlert(o);setTimeout(()=>openFullscreenOrder(o),250)};
const oldShowDashboard=showDashboard;
showDashboard=function(session){oldShowDashboard(session);if(session){loadBreakfastOrders();subscribeToBreakfast();loadInventorySummary()}else if(breakfastState.channel&&supabaseClient){supabaseClient.removeChannel(breakfastState.channel);breakfastState.channel=null}};
document.addEventListener('DOMContentLoaded',()=>{document.querySelector('#fullscreen-close')?.addEventListener('click',closeFullscreenOrder);document.querySelector('#fullscreen-preparing')?.addEventListener('click',async()=>{const o=state.orders.find(x=>x.id===state.selectedId)||state.orders.find(x=>x.id===state.lastAnnouncedId);if(o){closeFullscreenOrder();await updateStatus(o.id,'preparing')}});setInterval(()=>{if(supabaseClient&&document.visibilityState==='visible'){loadBreakfastOrders();loadInventorySummary()}},15000)});

// Pizza Yard Rewards verification
async function verifyRewardCode(e){
  e.preventDefault();
  const input=document.querySelector('#reward-code-input'), msg=document.querySelector('#reward-verify-message');
  if(!input||!msg||!window.pizzaYardSupabase)return;
  msg.className='reward-verify-message'; msg.textContent='Verifying…';
  const {data,error}=await window.pizzaYardSupabase.rpc('verify_reward_code',{p_code:input.value.trim()});
  if(error||!data?.length){msg.classList.add('error');msg.textContent=error?.message||'Reward code is invalid or already used.';return;}
  const r=data[0]; msg.classList.add('success'); msg.textContent=`✅ ${r.reward_label} redeemed for ${r.customer_name} (${r.customer_phone}). Code ${r.code} is now used.`; input.value='';
}
document.addEventListener('DOMContentLoaded',()=>document.querySelector('#reward-verify-form')?.addEventListener('submit',verifyRewardCode));
