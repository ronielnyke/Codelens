import {$,esc,toast,db,fire,ready,halt,needLogin,user,isOwner,downloadOrder} from './app.js';
const {collection,doc,writeBatch,onSnapshot,query,where,serverTimestamp}=fire;
await ready;
if(!needLogin())await halt();
let mine=[],sales=[];if(!isOwner)$('#tabSales').parentElement.remove();
const st=s=>`<span class="st ${s}">${{pending:'Pending',approved:'Approved',rejected:'Rejected'}[s]}</span>`;
const t=o=>o.created?.toDate?.().toLocaleString()||'';
const draw=()=>{
 $('#mine').innerHTML=mine.length?mine.map(o=>`<div class="panel mb-3"><div class="d-flex flex-wrap gap-2 align-items-center"><b class="me-auto">${esc(o.title)}</b>${st(o.status)}</div><div class="muted small mt-1">Paid &#8369;${Number(o.price).toLocaleString()} &middot; Ref ${esc(o.ref)} &middot; ${t(o)}</div>
  ${o.status=='approved'?`<div class="mt-2">License key: <code>${esc(o.key)}</code> <button class="btn btn-sm btn-mint ms-2" data-dl="${o.lid}">Download code</button></div>`:o.status=='pending'?'<div class="muted small mt-2">The owner is checking your GCash reference. The code unlocks once approved.</div>':'<div class="no small mt-2">The owner could not find this payment. Go to the Marketplace and submit the correct reference.</div>'}</div>`).join(''):'<div class="panel muted">You have not bought anything yet.</div>';
 $('#sales').innerHTML=sales.length?sales.map(o=>`<div class="panel mb-3"><div class="d-flex flex-wrap gap-2 align-items-center"><b class="me-auto">${esc(o.title)}</b>${st(o.status)}</div>
  <div class="small mt-1">Buyer: ${esc(o.bname)} (${esc(o.bemail)})<br>Amount to receive: <b>&#8369;${Number(o.price).toLocaleString()}</b><br>GCash reference: <code class="fs-6">${esc(o.ref)}</code> &middot; ${t(o)}</div>
  ${o.status=='pending'?`<div class="mt-2 d-flex gap-2"><button class="btn btn-mint btn-sm" data-ok="${o.buyer}_${o.lid}">Payment received, approve</button><button class="btn btn-outline-danger btn-sm" data-no="${o.buyer}_${o.lid}">Reject</button></div><div class="muted small mt-2">Open your GCash app, find this reference and amount in your transactions, then approve.</div>`:o.status=='approved'?`<div class="muted small mt-1">License key: ${esc(o.key)}</div>`:''}</div>`).join(''):'<div class="panel muted">No orders for your listings yet.</div>';
 const c=$('#cnt');if(c)c.textContent=sales.filter(o=>o.status=='pending').length||''};
const sort=a=>a.sort((x,y)=>(y.created?.seconds||0)-(x.created?.seconds||0));
onSnapshot(query(collection(db,'orders'),where('buyer','==',user.uid)),s=>{mine=sort(s.docs.map(d=>d.data()));draw()});
if(isOwner)onSnapshot(query(collection(db,'orders'),where('seller','==',user.uid)),s=>{sales=sort(s.docs.map(d=>d.data()));draw()});
const rnd=()=>{const a=new Uint32Array(3);crypto.getRandomValues(a);return 'CL-'+[...a].map(n=>n.toString(36).toUpperCase().padStart(4,'0').slice(-4)).join('-')};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 try{if(b.dataset.dl)await downloadOrder(mine.find(o=>o.lid==b.dataset.dl));
  if(b.dataset.ok){const o=sales.find(x=>x.buyer+'_'+x.lid==b.dataset.ok);if(!confirm(`Confirm you received ₱${o.price} with reference ${o.ref} in your GCash?`))return;const key=rnd(),w=writeBatch(db),m=o.bemail.slice(0,2)+'***'+o.bemail.slice(o.bemail.indexOf('@'));
   w.update(doc(db,'orders',b.dataset.ok),{status:'approved',key,approved:serverTimestamp()});w.set(doc(db,'licenses',key),{lid:o.lid,title:o.title,buyer:o.buyer,seller:user.uid,bmask:m,date:serverTimestamp()});await w.commit();toast('Approved. The buyer can now download the code.')}
  if(b.dataset.no&&confirm('Reject this payment reference?')){await fire.updateDoc(doc(db,'orders',b.dataset.no),{status:'rejected'});toast('Rejected.')}}catch(x){toast('Error: '+x.message)}});
