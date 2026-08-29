const SUPABASE_URL="https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";

let supabaseClient=null;

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

try{
  if(window.supabase?.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:makePizzaYardFetch(()=>supabaseClient)}
  });
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
 {id:'juice',name:'Local Juice',price:6}
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
  if(period) period.textContent=`Pre-order now for ${dateLabel(target)}. Order ahead for Sunday breakfast — name and phone are optional.`;
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
    customer_birthday:birthday||null,
    status:'new'
  }).select('id').single();
  if(error)throw error;
  if(document.querySelector('#join-rewards')?.checked && phone){ try { await supabaseClient.rpc('ensure_rewards_member',{p_name:name,p_phone:phone,p_email:null,p_birthday:birthday||null}); } catch(rewardsError){ console.warn('Breakfast rewards signup failed:', rewardsError); } }
  return data;
}

document.querySelector('#breakfast-form')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const error=document.querySelector('#error');
  if(error)error.textContent='';
  const name=document.querySelector('#customer-name')?.value.trim()||'Walk-in Customer';
  const phoneRaw=document.querySelector('#customer-phone')?.value.trim()||'';
  const phone=phoneRaw ? phoneRaw : null;
  const notes=document.querySelector('#notes')?.value.trim()||'';
  const birthday=document.querySelector('#birthday')?.value||'';
  const selected=selectedItems();

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
