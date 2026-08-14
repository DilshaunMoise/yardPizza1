const db = () => window.pizzaYardSupabase;
let items = [];
const $ = s => document.querySelector(s);

function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function loadInventory(){
 const {data,error}=await db().from('inventory').select('*').order('name',{ascending:true});
 if(error){console.error(error); return showError(error.message);}
 items=data||[]; render();
}
function showError(m){const el=$('#inventory-list'); if(el)el.innerHTML='<p class="error">'+esc(m)+'</p>';}
function render(){
 $('#stat-total').textContent=items.length;
 $('#stat-low').textContent=items.filter(i=>Number(i.quantity)<=Number(i.min_quantity||0)&&Number(i.quantity)>0).length;
 $('#stat-out').textContent=items.filter(i=>Number(i.quantity)<=0).length;
 $('#inventory-list').innerHTML=items.map(i=>`<div class="inventory-card"><strong>${esc(i.name)}</strong><span>${esc(i.category||'')} • ${i.quantity||0} ${esc(i.unit||'')}</span><button onclick="changeStock('${i.id}')">Update</button></div>`).join('')||'<p>No items yet.</p>';
}
async function saveItem(e){e.preventDefault();
 const payload={name:$('#item-name').value,category:$('#item-category').value,quantity:Number($('#item-quantity').value||0),unit:$('#item-unit').value,min_quantity:Number($('#item-min-quantity').value||0),supplier:$('#item-supplier').value,notes:$('#item-notes').value,updated_at:new Date().toISOString()};
 const {error}=await db().from('inventory').insert(payload); if(error) alert(error.message); else {$('#item-dialog').close();loadInventory();}
}
window.changeStock=async id=>{const it=items.find(x=>x.id===id);const q=prompt('New quantity',it.quantity);if(q===null)return;const {error}=await db().from('inventory').update({quantity:Number(q)}).eq('id',id);if(error)alert(error.message);else loadInventory();};

document.addEventListener('DOMContentLoaded',()=>{
 $('#item-form')?.addEventListener('submit',saveItem);
 $('#add-item-btn')?.addEventListener('click',()=>$('#item-dialog').showModal());
 $('#close-dialog')?.addEventListener('click',()=>$('#item-dialog').close());
 $('#cancel-item')?.addEventListener('click',()=>$('#item-dialog').close());
 $('#refresh-btn')?.addEventListener('click',loadInventory);
 $('#logout-btn')?.addEventListener('click',()=>firebase.auth().signOut());
 firebase.auth().onAuthStateChanged(user=>{if(user){$('#login-view').classList.add('hidden');$('#app-view').classList.remove('hidden');loadInventory();}else{$('#login-view').classList.remove('hidden');$('#app-view').classList.add('hidden');}});
 $('#login-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await firebase.auth().signInWithEmailAndPassword($('#login-email').value,$('#login-password').value)}catch(err){$('#login-error').textContent=err.message;}});
});
