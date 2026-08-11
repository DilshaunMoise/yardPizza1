const SUPABASE_URL="https://dsjskpqdofuhkzkylxqt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_v4Vaxfo6i2Y_E2N24xO0ag_jkprC_Rk";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const MENU=[
 {id:'pancakes',name:'Classic Pancakes',desc:'3 pancakes',price:10},
 {id:'bacon',name:'Bacon Strips',price:5},
 {id:'sausage',name:'Pork Sausage',price:3},
 {id:'boiled_eggs',name:'Boiled Eggs',price:1.5},
 {id:'scrambled_eggs',name:'Scrambled Eggs',price:5},
 {id:'omelette',name:'Omelette',desc:'Add-ons available — list them in special instructions.',price:10,option:'omelette'},
 {id:'bakes',name:'Bakes',desc:'Choose fried or oven roasted',price:3,option:'bakes'},
 {id:'saltfish_cheese',name:'Saltfish & Cheese',price:3},
 {id:'local_bread',name:'Local Bread',price:3},
 {id:'coco_tea',name:'Coco Tea',price:3},
 {id:'coffee',name:'Coffee',price:3},
 {id:'juice',name:'Juice',price:6}
];
const qty=Object.fromEntries(MENU.map(x=>[x.id,0]));
const opts={bakes:'Fried'};
function money(v){return `$${Number(v).toFixed(2)}`}
function nextSunday(){const d=new Date();const day=d.getDay();d.setDate(d.getDate()+(7-day)%7);d.setHours(0,0,0,0);return d}
const target=nextSunday();
function dateLabel(d){return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(d)}
function cutoffPassed(){if(target.getDay()!==0)return false;const d=new Date();if(d.getDay()===0)return false;return false}
function render(){document.querySelector('#period-copy').textContent=`Pre-order now for ${dateLabel(target)}. Your name and phone number are required.`;document.querySelector('#cutoff-note').textContent='Breakfast pre-orders are available throughout the week. Orders for the next Sunday close at the configured cutoff.';const menu=document.querySelector('#menu');menu.innerHTML=MENU.map(x=>`<article class="item"><div><h3>${x.name}</h3><p>${x.desc||''}</p>${x.option==='bakes'?`<div class="option"><label><input type="radio" name="bakes" value="Fried" checked> Fried</label><label><input type="radio" name="bakes" value="Oven Roasted"> Oven Roasted</label></div>`:''}<div class="qty"><button type="button" data-minus="${x.id}" aria-label="Remove one ${x.name}">−</button><strong id="q-${x.id}">0</strong><button type="button" data-plus="${x.id}" aria-label="Add one ${x.name}">+</button></div></div><div class="price">${money(x.price)}</div></article>`).join('');
menu.addEventListener('click',e=>{const plus=e.target.closest('[data-plus]'),minus=e.target.closest('[data-minus]');if(plus){qty[plus.dataset.plus]++;update()}if(minus){qty[minus.dataset.minus]=Math.max(0,qty[minus.dataset.minus]-1);update()}});menu.addEventListener('change',e=>{if(e.target.name==='bakes')opts.bakes=e.target.value});update()}
function update(){let total=0;MENU.forEach(x=>{document.querySelector(`#q-${x.id}`).textContent=qty[x.id];total+=qty[x.id]*x.price});document.querySelector('#total').textContent=money(total)}
function items(){return MENU.filter(x=>qty[x.id]>0).map(x=>{let detail=x.name;if(x.id==='bakes')detail+=` (${opts.bakes})`;return {id:x.id,name:detail,quantity:qty[x.id],unit_price:x.price,line_total:qty[x.id]*x.price}})}
document.querySelector('#breakfast-form').addEventListener('submit',async e=>{e.preventDefault();const error=document.querySelector('#error');error.textContent='';const name=document.querySelector('#customer-name').value.trim(),phone=document.querySelector('#customer-phone').value.trim(),notes=document.querySelector('#notes').value.trim(),selected=items();if(!name||!phone){error.textContent='Name and phone number are required.';return}if(!selected.length){error.textContent='Please choose at least one breakfast item.';return}const total=selected.reduce((a,x)=>a+x.line_total,0);const submit=document.querySelector('#submit');submit.disabled=true;submit.textContent='Submitting…';const {data,error:dbError}=await supabaseClient.from('breakfast_orders').insert({target_sunday:target.toISOString().slice(0,10),customer_name:name,customer_phone:phone,items:selected,total,special_instructions:notes||null,status:'new'}).select('id').single();if(dbError){console.error(dbError);error.textContent='We could not submit the order. Please try again.';submit.disabled=false;submit.textContent='🍳 Submit Breakfast Pre-Order';return}document.querySelector('#breakfast-form').classList.add('hidden');document.querySelector('#success').classList.remove('hidden');document.querySelector('#success-text').textContent=`Order ${String(data.id).replaceAll('-','').slice(0,6).toUpperCase()} is saved for ${dateLabel(target)}. Pizza Yard has received your pre-order.`});
render();
