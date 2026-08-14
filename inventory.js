const SUPABASE_URL="https://pqzfmbqmkeythyajkiti.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_p1ugtwfPHsKFmZ8KOQ_fBQ_YCAPYWxn";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={items:[],events:[],counts:[],search:"",category:"",status:""};

function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function num(v){return Number(v||0)}
function fmt(v){return Number(v||0).toLocaleString(undefined,{maximumFractionDigits:3})}
function statusFor(i){
  const qty=num(i.quantity), min=num(i.min_quantity);
  const weightTracked=i.weight_tracking && i.weight!=null;
  if(qty<=0 || (weightTracked && num(i.weight)<=0)) return "out";
  if(qty<=min || (i.min_weight!=null && weightTracked && num(i.weight)<=num(i.min_weight))) return "low";
  return "ok";
}
function statusLabel(s){return s==="out"?"OUT OF STOCK":s==="low"?"LOW STOCK":"IN STOCK"}
function displayStock(i){
  const q=`${fmt(i.quantity)} ${esc(i.unit)}`;
  const w=i.weight_tracking&&i.weight!=null?` • ${fmt(i.weight)} ${esc(i.weight_unit)}`:"";
  return q+w;
}
function filtered(){
  return state.items.filter(i=>{
    const term=state.search.toLowerCase();
    if(term && !(i.name+" "+i.category+" "+(i.supplier||"")).toLowerCase().includes(term))return false;
    if(state.category&&i.category!==state.category)return false;
    if(state.status&&statusFor(i)!==state.status)return false;
    return true;
  });
}
async function loadAll(){
  const [ir,er,cr,ec]=await Promise.all([
    sb.from("inventory_items").select("*").order("category").order("name"),
    sb.from("inventory_stock_events").select("*").order("created_at",{ascending:false}).limit(60),
    sb.from("inventory_daily_counts").select("*").eq("count_date",new Date().toISOString().slice(0,10)).order("created_at",{ascending:false}),
    null
  ]);
  if(ir.error){alert("Inventory database is not ready. Run the Inventory SQL section first.");console.error(ir.error);return}
  state.items=ir.data||[]; state.events=er.data||[]; state.counts=cr.data||[];
  renderAll();
}
function renderAll(){renderFilters();renderStats();renderRestock();renderItems();renderCounts();renderHistory()}
function renderFilters(){
  const cats=[...new Set(state.items.map(x=>x.category))].sort();
  const current=state.category;
  $("#category-filter").innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("#category-filter").value=current;
}
function renderStats(){
  const low=state.items.filter(i=>statusFor(i)==="low").length;
  const out=state.items.filter(i=>statusFor(i)==="out").length;
  $("#stat-total").textContent=state.items.length;
  $("#stat-low").textContent=low;
  $("#stat-out").textContent=out;
  $("#stat-counts").textContent=state.counts.length;
}
function renderRestock(){
  const rows=state.items.filter(i=>statusFor(i)!=="ok");
  $("#restock-list").innerHTML=rows.length?rows.map(i=>`<div class="restock-card"><strong>${esc(i.name)}</strong><span>${statusLabel(statusFor(i))}</span><small>${displayStock(i)} • minimum ${fmt(i.min_quantity)} ${esc(i.unit)}</small></div>`).join(""):'<div class="restock-empty">Everything is above its minimum stock level. 🎉</div>';
}
function renderItems(){
  const rows=filtered();
  $("#inventory-list").innerHTML=rows.length?rows.map(i=>{
    const s=statusFor(i);
    return `<article class="item-card">
      <div class="item-top"><div><div class="item-name">${esc(i.name)}</div><div class="item-meta">${esc(i.category)}${i.supplier?` • ${esc(i.supplier)}`:""}</div></div><span class="badge ${s}">${statusLabel(s)}</span></div>
      <div class="stock-grid">
        <div class="stock-box"><span>QUANTITY</span><strong>${fmt(i.quantity)} ${esc(i.unit)}</strong></div>
        <div class="stock-box"><span>${i.weight_tracking?"WEIGHT":"MINIMUM"}</span><strong>${i.weight_tracking&&i.weight!=null?`${fmt(i.weight)} ${esc(i.weight_unit)}`:`${fmt(i.min_quantity)} ${esc(i.unit)}`}</strong></div>
      </div>
      <div class="item-meta">Minimum: ${fmt(i.min_quantity)} ${esc(i.unit)}${i.min_weight!=null?` • ${fmt(i.min_weight)} ${esc(i.weight_unit)}`:""}${i.cost!=null?` • Cost ${Number(i.cost).toFixed(2)}`:""}</div>
      <div class="item-actions">
        <button class="primary" data-action="stock" data-id="${i.id}">＋ / − Stock</button>
        <button class="ghost" data-action="count" data-id="${i.id}">⚖️ Physical Count</button>
        <button class="ghost" data-action="edit" data-id="${i.id}">✏️ Edit</button>
      </div>
    </article>`;
  }).join(""):'<div class="muted">No inventory items match your filters.</div>';
  $$("[data-action]").forEach(b=>b.addEventListener("click",()=>handleItemAction(b.dataset.action,b.dataset.id)));
}
function renderCounts(){
  $("#daily-count-list").innerHTML=state.items.map(i=>{
    const c=state.counts.find(x=>x.item_id===i.id);
    return `<div class="count-row"><strong>${esc(i.name)}</strong><span>${c?`Count: ${fmt(c.quantity)} ${esc(i.unit)}`:"Not counted today"}</span><span>${c&&c.weight!=null?`Weight: ${fmt(c.weight)} ${esc(i.weight_unit)}`:""}</span><span>${c?`<span class="usage">Saved</span>`:""}</span><button class="ghost" data-count="${i.id}">⚖️ Count</button></div>`;
  }).join("");
  $$("[data-count]").forEach(b=>b.addEventListener("click",()=>openCount(b.dataset.count)));
}
function renderHistory(){
  const rows=state.events.slice(0,30);
  $("#history-list").innerHTML=rows.length?rows.map(e=>{
    const i=state.items.find(x=>x.id===e.item_id);
    return `<div class="history-row"><strong>${esc(i?.name||"Deleted item")}</strong><span>${esc(e.event_type)}</span><span>${e.quantity_before!=null?`${fmt(e.quantity_before)} → ${fmt(e.quantity_after)}`:""}</span><span>${e.weight_before!=null&&e.weight_after!=null?`${fmt(e.weight_before)} → ${fmt(e.weight_after)}`:""}</span><small>${new Date(e.created_at).toLocaleString()}${e.note?` • ${esc(e.note)}`:""}</small></div>`;
  }).join(""):'<div class="muted">No stock changes yet.</div>';
}
function openItem(item){
  $("#dialog-title").textContent=item?"Edit Inventory Item":"Add Inventory Item";
  $("#item-id").value=item?.id||"";
  $("#item-name").value=item?.name||"";
  $("#item-category").value=item?.category||"Ingredients";
  $("#item-quantity").value=item?.quantity??0;
  $("#item-unit").value=item?.unit||"pieces";
  $("#item-weight").value=item?.weight??"";
  $("#item-weight-unit").value=item?.weight_unit||"kg";
  $("#item-min-quantity").value=item?.min_quantity??0;
  $("#item-min-weight").value=item?.min_weight??"";
  $("#item-supplier").value=item?.supplier||"";
  $("#item-cost").value=item?.cost??"";
  $("#item-weight-tracking").checked=!!item?.weight_tracking;
  $("#item-notes").value=item?.notes||"";
  $("#item-dialog").showModal();
}
async function saveItem(e){
  e.preventDefault();
  const id=$("#item-id").value;
  const payload={
    name:$("#item-name").value.trim(),category:$("#item-category").value,
    quantity:num($("#item-quantity").value),unit:$("#item-unit").value.trim()||"pieces",
    weight:$("#item-weight").value===""?null:num($("#item-weight").value),
    weight_unit:$("#item-weight-unit").value,min_quantity:num($("#item-min-quantity").value),
    min_weight:$("#item-min-weight").value===""?null:num($("#item-min-weight").value),
    supplier:$("#item-supplier").value.trim()||null,cost:$("#item-cost").value===""?null:num($("#item-cost").value),
    notes:$("#item-notes").value.trim()||null,weight_tracking:$("#item-weight-tracking").checked
  };
  if(!payload.name)return;
  const q=id?sb.from("inventory_items").update(payload).eq("id",id):sb.from("inventory_items").insert(payload);
  const {error}=await q;
  if(error){alert(error.message);return}
  $("#item-dialog").close();loadAll();
}
function openStock(id){
  const i=state.items.find(x=>x.id===id);if(!i)return;
  $("#stock-item-id").value=id;$("#stock-title").textContent=`Update ${i.name}`;$("#stock-current").textContent=`Current: ${displayStock(i)}`;
  $("#stock-type").value="delivery";$("#stock-qty-change").value="";$("#stock-weight-after").value=i.weight??"";$("#stock-note").value="";
  $("#stock-dialog").showModal();
}
async function saveStock(e){
  e.preventDefault();
  const i=state.items.find(x=>x.id===$("#stock-item-id").value);if(!i)return;
  const change=num($("#stock-qty-change").value), after=Math.max(0,num(i.quantity)+change), wa=$("#stock-weight-after").value===""?i.weight:num($("#stock-weight-after").value);
  const type=$("#stock-type").value;
  const {error}=await sb.from("inventory_items").update({quantity:after,weight:wa}).eq("id",i.id);
  if(error){alert(error.message);return}
  const user=(await sb.auth.getUser()).data.user;
  await sb.from("inventory_stock_events").insert({item_id:i.id,event_type:type,quantity_before:i.quantity,quantity_after:after,weight_before:i.weight,weight_after:wa,reason:type,note:$("#stock-note").value.trim()||null,staff_user_id:user?.id||null});
  $("#stock-dialog").close();loadAll();
}
function openCount(id){
  const i=state.items.find(x=>x.id===id);if(!i)return;
  const prior=state.counts.find(x=>x.item_id===id);
  $("#count-item-id").value=id;$("#count-title").textContent=`Count ${i.name}`;$("#count-current").textContent=`System stock: ${displayStock(i)}`;
  $("#count-qty").value=prior?.quantity??i.quantity;$("#count-weight").value=prior?.weight??i.weight??"";$("#count-note").value="";
  updateUsagePreview(i);
  $("#count-dialog").showModal();
}
function updateUsagePreview(i){
  const q=num($("#count-qty").value), w=$("#count-weight").value===""?null:num($("#count-weight").value);
  const qUsed=num(i.quantity)-q;
  let html=`Quantity change: <strong>${qUsed>=0?"Used":"Added"} ${fmt(Math.abs(qUsed))} ${esc(i.unit)}</strong>`;
  if(i.weight_tracking&&i.weight!=null&&w!=null){const wu=num(i.weight)-w;html+=`<br>Weight change: <strong>${wu>=0?"Used":"Added"} ${fmt(Math.abs(wu))} ${esc(i.weight_unit)}</strong>`}
  $("#count-usage").innerHTML=html;
}
async function saveCount(e){
  e.preventDefault();
  const i=state.items.find(x=>x.id===$("#count-item-id").value);if(!i)return;
  const q=num($("#count-qty").value), w=$("#count-weight").value===""?null:num($("#count-weight").value), today=new Date().toISOString().slice(0,10);
  const user=(await sb.auth.getUser()).data.user;
  const {error}=await sb.from("inventory_daily_counts").upsert({count_date:today,item_id:i.id,quantity:q,weight:w,note:$("#count-note").value.trim()||null,staff_user_id:user?.id||null},{onConflict:"count_date,item_id"});
  if(error){alert(error.message);return}
  const uq=await sb.from("inventory_items").update({quantity:q,weight:w}).eq("id",i.id);
  if(uq.error){alert(uq.error.message);return}
  await sb.from("inventory_stock_events").insert({item_id:i.id,event_type:"count",quantity_before:i.quantity,quantity_after:q,weight_before:i.weight,weight_after:w,reason:"daily_count",note:$("#count-note").value.trim()||null,staff_user_id:user?.id||null});
  $("#count-dialog").close();loadAll();
}
async function handleItemAction(a,id){const i=state.items.find(x=>x.id===id);if(a==="edit")openItem(i);if(a==="stock")openStock(id);if(a==="count")openCount(id)}
function setup(){
  $("#login-form").addEventListener("submit",async e=>{e.preventDefault();$("#login-button").disabled=true;$("#login-error").textContent="";const {error}=await sb.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});if(error)$("#login-error").textContent=error.message;$("#login-button").disabled=false});
  $("#logout-btn").onclick=()=>sb.auth.signOut();
  $("#refresh-btn").onclick=loadAll;
  $("#add-item-btn").onclick=()=>openItem(null);
  $("#search").oninput=e=>{state.search=e.target.value;renderItems()};
  $("#category-filter").onchange=e=>{state.category=e.target.value;renderItems()};
  $("#status-filter").onchange=e=>{state.status=e.target.value;renderItems()};
  $("#item-form").addEventListener("submit",saveItem);$("#cancel-item").onclick=()=>$("#item-dialog").close();$("#close-dialog").onclick=()=>$("#item-dialog").close();
  $("#stock-form").addEventListener("submit",saveStock);$("#cancel-stock").onclick=()=>$("#stock-dialog").close();$("#close-stock").onclick=()=>$("#stock-dialog").close();
  $("#count-form").addEventListener("submit",saveCount);$("#cancel-count").onclick=()=>$("#count-dialog").close();$("#close-count").onclick=()=>$("#count-dialog").close();
  $("#count-all-btn").onclick=()=>window.scrollTo({top:document.querySelector(".panel:nth-of-type(3)")?.offsetTop||0,behavior:"smooth"});
  $("#count-qty").oninput=()=>{const i=state.items.find(x=>x.id===$("#count-item-id").value);if(i)updateUsagePreview(i)};
  $("#count-weight").oninput=()=>{const i=state.items.find(x=>x.id===$("#count-item-id").value);if(i)updateUsagePreview(i)};
  sb.auth.getSession().then(({data:{session}})=>{if(session){$("#login-view").classList.add("hidden");$("#app-view").classList.remove("hidden");loadAll()}});
  sb.auth.onAuthStateChange((_e,s)=>{if(s){$("#login-view").classList.add("hidden");$("#app-view").classList.remove("hidden");loadAll()}else{$("#login-view").classList.remove("hidden");$("#app-view").classList.add("hidden")}});
}
setup();
