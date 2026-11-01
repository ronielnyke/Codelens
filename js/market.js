import {$,esc,toast,db,fire,ready,needLogin,user,downloadOrder} from './app.js';
const {collection,doc,getDoc,getDocs,writeBatch,onSnapshot,query,orderBy,where,serverTimestamp}=fire;
await ready;
let listings=[],orders={},cur=null;
const btnFor=l=>{const o=orders[l.id];return !o?`<button class="btn btn-sm btn-mint" data-buy="${l.id}">Buy</button>`:o.status=='approved'?`<button class="btn btn-sm btn-mint" data-dl="${l.id}">Download</button>`:o.status=='pending'?`<span class="st pending">Waiting for approval</span>`:`<button class="btn btn-sm btn-outline-warning" data-retry="${l.id}">Rejected, try again</button>`};
const render=()=>{const q=$('#q').value.toLowerCase(),ls=listings.filter(l=>(l.title+l.desc+l.cat).toLowerCase().includes(q));
 $('#list').innerHTML=ls.length?ls.map(l=>`<div class="col-md-6 col-lg-4"><div class="panel card-x h-100 d-flex flex-column">${l.cover?`<img class="cover" src="${l.cover}" alt="">`:'<div class="cover"></div>'}<span class="badge text-bg-secondary align-self-start mb-2">${esc(l.cat)}</span><h5>${esc(l.title)}</h5><p class="muted small flex-grow-1">${esc(l.desc).slice(0,140)}</p><div class="muted small mb-2">By ${esc(l.sname||"Roniel Nyke Gonzales")}</div>
  <div class="d-flex align-items-center gap-2"><b class="fs-5 me-auto">&#8369;${Number(l.price).toLocaleString()}</b><button class="btn btn-sm btn-outline-light" data-view="${l.id}">View display</button>${user&&user.uid==l.seller?'<span class="st approved">Yours</span>':btnFor(l)}</div></div></div>`).join(''):'<div class="panel text-center muted">No products yet. Check back soon.</div>'};
onSnapshot(query(collection(db,'listings'),orderBy('created','desc')),s=>{listings=s.docs.map(d=>({id:d.id,...d.data()}));render()},e=>toast('Could not load products: '+e.message));
if(user)onSnapshot(query(collection(db,'orders'),where('buyer','==',user.uid)),s=>{orders={};s.forEach(d=>orders[d.data().lid]=d.data());render()});
$('#q').oninput=render;
async function openView(l){$('#vt').textContent=l.title;$('#vd').textContent=l.desc;$('#vp').innerHTML='&#8369;'+Number(l.price).toLocaleString();
 $('#vf').innerHTML=(l.features||[]).map(f=>`<li>${esc(f)}</li>`).join('');$('#vdemo').classList.toggle('d-none',!l.demo);if(l.demo)$('#vdemo').href=l.demo;
 $('#vbuy').innerHTML=user&&user.uid==l.seller?'':btnFor(l).replace('btn-sm','');$('#vbuy').dataset.id=l.id;
 $('#vc').innerHTML='<div class="muted p-4">Loading display...</div>';bootstrap.Modal.getOrCreateInstance('#viewM').show();
 try{const m=(await getDocs(query(collection(db,'listings',l.id,'media'),orderBy('n')))).docs.map(d=>d.data().data);const imgs=m.length?m:[l.cover].filter(Boolean);
  $('#vc').innerHTML=imgs.length?`<div id="car" class="carousel slide"><div class="carousel-inner">${imgs.map((s,i)=>`<div class="carousel-item ${i?'':'active'}"><img src="${s}" alt="Screenshot ${i+1}"></div>`).join('')}</div>${imgs.length>1?'<button class="carousel-control-prev" data-bs-target="#car" data-bs-slide="prev"><span class="carousel-control-prev-icon"></span></button><button class="carousel-control-next" data-bs-target="#car" data-bs-slide="next"><span class="carousel-control-next-icon"></span></button>':''}</div>`:'<div class="muted p-4">No display images yet.</div>'}catch(e){$('#vc').innerHTML='<div class="no p-4">Could not load images.</div>'}}
async function openBuy(l){cur=l;let s;try{s=(await getDoc(doc(db,'config','store'))).data()}catch(e){}if(!s||!s.gcash)return toast('The owner has not set up payment yet. Please try again later.');
 $('#bt').textContent=l.title;$('#bp').textContent='₱'+Number(l.price).toLocaleString();$('#bg').textContent=s.gcash;$('#bn').textContent=s.gname;$('#bo').textContent=s.other||'';$('#bo').parentElement.classList.toggle('d-none',!s.other);$('#ref').value='';$('#paid').checked=false;bootstrap.Modal.getInstance('#viewM')?.hide();bootstrap.Modal.getOrCreateInstance('#buyM').show()}
$('#sub').onclick=async()=>{const ref=$('#ref').value.replace(/\s/g,'').toUpperCase();if(!/^[A-Z0-9]{8,20}$/.test(ref))return toast('Enter the reference number from your GCash receipt (8-20 letters/numbers)');if(!$('#paid').checked)return toast('Please confirm that you sent the exact amount');
 const b=$('#sub');b.disabled=true;try{const w=writeBatch(db);w.set(doc(db,'refs',ref),{buyer:user.uid,lid:cur.id,at:serverTimestamp()});
  w.set(doc(db,'orders',user.uid+'_'+cur.id),{lid:cur.id,title:cur.title,price:cur.price,seller:cur.seller,buyer:user.uid,bname:user.displayName||user.email,bemail:user.email,ref,status:'pending',key:'',created:serverTimestamp()});await w.commit();
  bootstrap.Modal.getInstance('#buyM').hide();toast('Reference sent. The owner will verify your payment and unlock the files.')}catch(e){toast(/permission|exists/i.test(e.message)?'This reference number was already used or is invalid.':'Failed: '+e.message)}b.disabled=false};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 try{if(d.view)openView(listings.find(x=>x.id==d.view));
 if(d.buy&&needLogin())openBuy(listings.find(x=>x.id==d.buy));
 if(d.retry){await fire.deleteDoc(doc(db,'orders',user.uid+'_'+d.retry));openBuy(listings.find(x=>x.id==d.retry))}
 if(d.dl)await downloadOrder(orders[d.dl])}catch(x){toast('Error: '+x.message)}});
