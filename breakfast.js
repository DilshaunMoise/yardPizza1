const SUPABASE_URL="https://pqzfmbqmkeythyajkiti.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_p1ugtwfPHsKFmZ8KOQ_fBQ_YCAPYWxn";

let supabaseClient=null;
try{
  if(window.supabase?.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  }
}catch(err){console.error('Supabase initialization failed:',err)}

const MENU=[
 {id:'pancakes',name:'Classic Pancakes',desc:'3 pancakes',price:10},
 {id:'bacon',name:'Bacon Strips',price:5},
 {id:'sausage',name:'Pork Sausage',price:3},
 {id:'boiled_eggs',name:'Boiled Eggs',price:1.5},
 {id:'scrambled_eggs',name:'Scrambled Eggs',price:5},
 {id:'omelette',name:'Omelette',desc:'Add-ons available — list them in special instructions.',price:10},
 {id:'bakes',name:'Bakes',desc:'Choose cheese or saltfish',price:3,option:'bakes'},
 {id:'saltfish_cheese',name:'Saltfish & Cheese',price:3},
 {id:'local_bread',name:'Local Bread',price:3},
 {id:'coco_tea',name:'Cocoa Tea',price:3},
 {id:'coffee',name:'Coffee',price:3},
 {id:'juice',name:'Juice',price:6}
];
const qty=Object.fromEntries(MENU.map(x=>[x.id,0]));
const opts={bakes:'Cheese'};
const money=v=>`$${Number(v||0).toFixed(2)}`;
function nextSunday(){
  const d=new Date();
  const day=d.getDay();
  d.setDate(d.getDate()+(7-day)%7);
  d.setHours(0,0,0,0);
  return d;
}
const target=nextSunday();
const dateLabel=d=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(d);

function setPageMessage(message, type='info'){
  const note=document.querySelector('#cutoff-note');
  if(note){note.textContent=message;note.dataset.type=type;}
}

function render(){
  const period=document.querySelector('#period-copy');
  const cutoff=document.querySelector('#cutoff-note');
  const menu=document.querySelector('#menu');
  if(period) period.textContent=`Pre-order now for ${dateLabel(target)}. Your name and phone number are required.`;
  if(cutoff) cutoff.textContent='Breakfast pre-orders are available throughout the week. Orders for the next Sunday close at the configured cutoff.';
  if(!menu)return;

  menu.innerHTML=MENU.map(x=>`<article class="item">
    <div>
      <h3>${x.name}</h3>
      <p>${x.desc||''}</p>
      ${x.option==='bakes'?`<div class="option">
        <label><input type="radio" name="bakes" value="Cheese" checked> Cheese</label>
        <label><input type="radio" name="bakes" value="Saltfish"> Saltfish</label>
      </div>`:''}
      <div class="qty">
        <button type="button" data-minus="${x.id}" aria-label="Remove one ${x.name}">−</button>
        <strong id="q-${x.id}">0</strong>
        <button type="button" data-plus="${x.id}" aria-label="Add one ${x.name}">+</button>
      </div>
    </div>
    <div class="price">${money(x.price)}</div>
  </article>`).join('');

  menu.addEventListener('click',e=>{
    const plus=e.target.closest('[data-plus]');
    const minus=e.target.closest('[data-minus]');
    if(plus){qty[plus.dataset.plus]++;update();}
    if(minus){qty[minus.dataset.minus]=Math.max(0,qty[minus.dataset.minus]-1);update();}
  });
  menu.addEventListener('change',e=>{
    if(e.target.name==='bakes')opts.bakes=e.target.value;
  });
  update();
}

function update(){
  let total=0;
  MENU.forEach(x=>{
    const node=document.querySelector(`#q-${x.id}`);
    if(node) node.textContent=qty[x.id];
    total+=qty[x.id]*x.price;
  });
  const totalNode=document.querySelector('#total');
  if(totalNode) totalNode.textContent=money(total);
}

function selectedItems(){
  return MENU.filter(x=>qty[x.id]>0).map(x=>{
    let detail=x.name;
    if(x.id==='bakes')detail+=` (${opts.bakes})`;
    return {id:x.id,name:detail,quantity:qty[x.id],unit_price:x.price,line_total:qty[x.id]*x.price};
  });
}

async function submitBreakfastOrder(name,phone,notes,selected,total){
  if(!supabaseClient) throw new Error('Breakfast service is unavailable because Supabase did not load.');
  const {data,error}=await supabaseClient.from('breakfast_orders').insert({
    target_sunday:target.toISOString().slice(0,10),
    customer_name:name,
    customer_phone:phone,
    items:selected,
    total,
    special_instructions:notes||null,
    status:'new'
  }).select('id').single();
  if(error)throw error;
  if(document.querySelector('#join-rewards')?.checked){ try { await supabaseClient.rpc('ensure_rewards_member',{p_name:name,p_phone:phone,p_email:null}); } catch(rewardsError){ console.warn('Breakfast rewards signup failed:', rewardsError); } }
  return data;
}

document.querySelector('#breakfast-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const error=document.querySelector('#error');
  if(error)error.textContent='';
  const name=document.querySelector('#customer-name')?.value.trim()||'';
  const phone=document.querySelector('#customer-phone')?.value.trim()||'';
  const notes=document.querySelector('#notes')?.value.trim()||'';
  const selected=selectedItems();

  if(!name||!phone){if(error)error.textContent='Name and phone number are required.';return;}
  if(!selected.length){if(error)error.textContent='Please choose at least one breakfast item.';return;}

  const total=selected.reduce((a,x)=>a+x.line_total,0);
  const submit=document.querySelector('#submit');
  if(submit){submit.disabled=true;submit.textContent='Submitting…';}
  try{
    const data=await submitBreakfastOrder(name,phone,notes,selected,total);
    document.querySelector('#breakfast-form')?.classList.add('hidden');
    document.querySelector('#success')?.classList.remove('hidden');
    const msg=document.querySelector('#success-text');
    if(msg)msg.textContent=`Order ${String(data.id).replaceAll('-','').slice(0,6).toUpperCase()} is saved for ${dateLabel(target)}. Pizza Yard has received your pre-order.`;
  }catch(dbError){
    console.error('Breakfast order submission failed:',dbError);
    if(error)error.textContent='We could not submit the order. Please try again.';
    if(submit){submit.disabled=false;submit.textContent='🍳 Submit Breakfast Pre-Order';}
  }
});

render();
