
const api = () => window.pizzaYardSupabase;
let inventoryItems = [];

const $ = s => document.querySelector(s);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function show(id, visible){ const el=$(id); if(el) el.style.display=visible?'block':'none'; }

async function checkLogin(){
  const {data}=await api().auth.getSession();
  const logged=!!data?.session;
  show('#login-view',!logged);
  show('#inventory-view',logged);
  if(logged) loadInventory();
}

async function login(e){
 e.preventDefault();
 const {error}=await api().auth.signInWithPassword({
  email:$('#login-email').value.trim(),
  password:$('#login-password').value
 });
 if(error) alert(error.message);
 else checkLogin();
}

async function logout(){
 await api().auth.signOut();
 checkLogin();
}

async function loadInventory(){
 const {data,error}=await api().from('inventory').select('*').order('name',{ascending:true});
 if(error){console.error(error); alert('Inventory error: '+error.message); return;}
 inventoryItems=data||[];
 render();
}

function render(){
 const list=$('#inventory-list');
 if(!list)return;
 $('#stat-total') && ($('#stat-total').textContent=inventoryItems.length);
 $('#stat-low') && ($('#stat-low').textContent=inventoryItems.filter(i=>Number(i.quantity)<=Number(i.min_quantity||0)).length);
 $('#stat-out') && ($('#stat-out').textContent=inventoryItems.filter(i=>Number(i.quantity)<=0).length);
 list.innerHTML=inventoryItems.map(i=>`
 <div class="inventory-card">
 <strong>${esc(i.name)}</strong>
 <span>${esc(i.category||'')} • ${i.quantity||0} ${esc(i.unit||'')}</span>
 <button data-id="${i.id}" class="delete-item">Delete</button>
 </div>`).join('') || '<p>No inventory items yet.</p>';

 document.querySelectorAll('.delete-item').forEach(b=>b.onclick=async()=>{
   if(confirm('Delete item?')){
    await api().from('inventory').delete().eq('id',b.dataset.id);
    loadInventory();
   }
 });
}

document.addEventListener('DOMContentLoaded',()=>{
 $('#login-form')?.addEventListener('submit',login);
 $('#logout-btn')?.addEventListener('click',logout);
 $('#refresh-inventory')?.addEventListener('click',loadInventory);
 checkLogin();
});
