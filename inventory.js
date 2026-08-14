
(() => {
const $=s=>document.querySelector(s);
const db=window.pizzaYardSupabase;
const money=v=>`$${Number(v||0).toFixed(2)}`;
const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

async function loadInventory(){
  const table="inventory_items";
  const {data,error}=await db.from(table).select("*").order("name");
  if(error){
    console.error(error);
    const el=$("#inventory-list")||$("#items-list");
    if(el) el.innerHTML="<p>Inventory database is not ready. Create the Firestore inventory_items collection first.</p>";
    return;
  }
  renderInventory(data||[]);
}

function renderInventory(items){
 const el=$("#inventory-list")||$("#items-list");
 if(!el) return;
 if(!items.length){el.innerHTML="<p>No inventory items yet.</p>";return;}
 el.innerHTML=items.map(i=>`
 <div class="inventory-item">
   <strong>${esc(i.name||"Item")}</strong>
   <span>${Number(i.quantity||0)} ${esc(i.unit||"")}</span>
   <button data-id="${i.id}" class="toggle-stock">${i.available===false?"Mark Available":"Mark Sold Out"}</button>
 </div>`).join("");
 el.querySelectorAll(".toggle-stock").forEach(btn=>{
   btn.onclick=async()=>{
    const item=items.find(x=>x.id===btn.dataset.id);
    await db.from("inventory_items").update({available:item.available===false});
    loadInventory();
   };
 });
}

document.addEventListener("DOMContentLoaded",()=>{
 loadInventory();
});
})();
