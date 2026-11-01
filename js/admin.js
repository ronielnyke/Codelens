// Owner Panel: payment details, publish / edit / delete products.
// Everything is saved in Firebase Firestore, so the products show on every device with the same link.
import {$,esc,toast,db,fire,auth,ready,halt,OWNER,user,isOwner} from './app.js';
const authm_refresh=async()=>{try{await auth.currentUser.getIdToken(true)}catch(e){}};
const {collection,doc,getDoc,getDocs,setDoc,deleteDoc,onSnapshot,query,where,serverTimestamp}=fire;

await ready;
const gate=$('#gate'),panel=$('#app');
const fail=e=>/permission|insufficient/i.test(e.message||e.code||'')
  ?'Permission denied. Publish firestore.rules in Firebase and sign in with the owner Google account ('+OWNER.email+').'
  :(e.message||'Something went wrong.');

if(!user){
  gate.innerHTML=`<div class="panel">Log in with Google using <b>${esc(OWNER.email)}</b> to open the Owner Panel. <a class="btn btn-mint btn-sm ms-2" href="login.html?next=admin.html">Log in</a></div>`;
  await halt();
}
if(!isOwner){
  gate.innerHTML=`<div class="panel"><b class="no">Access denied.</b><div class="muted mt-2">You are signed in as <b>${esc(user.email||'')}</b>${user.emailVerified?'':' (email not verified)'}. Only the owner account <b>${esc(OWNER.email)}</b> signed in with Google can publish products.</div><button class="btn btn-outline-light btn-sm mt-3" id="sw">Log out and switch account</button></div>`;
  $('#sw').onclick=()=>document.dispatchEvent(new Event('cl-logout'));
  await halt();
}
gate.classList.add('d-none');panel.classList.remove('d-none');

/* ---------- payment details ---------- */
try{const s=(await getDoc(doc(db,'config','store'))).data()||{};$('#sgn').value=s.gcash||'';$('#sgm').value=s.gname||'';$('#so').value=s.other||''}catch(e){}
$('#saveStore').onclick=async()=>{
  const g=$('#sgn').value.trim(),n=$('#sgm').value.trim();
  if(!/^(09\d{9}|\+639\d{9})$/.test(g.replace(/[\s-]/g,'')))return toast('Enter a valid GCash number (09XXXXXXXXX)');
  if(!n)return toast('Enter the name on your GCash account');
  try{await setDoc(doc(db,'config','store'),{gcash:g,gname:n,other:$('#so').value.trim()});toast('Payment details saved.')}catch(e){toast(fail(e))}
};

/* ---------- helpers ---------- */
const CH=700000;                       // characters per chunk (Firestore limit is 1 MiB per document)
const MAX_TOTAL=10*1024*1024;          // 10 MB of files per product
const stat=m=>{$('#stat').textContent=m};
const b64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error||new Error('Cannot read file'));r.readAsDataURL(b)});
const shrink=(f,max,cap)=>new Promise((res,rej)=>{
  const u=URL.createObjectURL(f),i=new Image();
  i.onload=()=>{
    URL.revokeObjectURL(u);
    let dim=max,d='';
    for(let t=0;t<6;t++){
      const s=Math.min(1,dim/Math.max(i.width,i.height)),c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(i.width*s));c.height=Math.max(1,Math.round(i.height*s));
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);
      let q=.8;d=c.toDataURL('image/jpeg',q);
      while(d.length>cap&&q>.3){q-=.1;d=c.toDataURL('image/jpeg',q)}
      if(d.length<=cap)return res(d);
      dim=Math.round(dim*.75);
    }
    rej(new Error('Image is too large even after shrinking: '+f.name));
  };
  i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('Cannot read image: '+f.name+' (use JPG or PNG)'))};i.src=u});
const mid=n=>'m'+String(n).padStart(2,'0');
async function clearMedia(id){for(let n=0;n<6;n++)await deleteDoc(doc(db,'listings',id,'media',mid(n)))}
async function clearFiles(id){
  const fs=await getDocs(collection(db,'listings',id,'files'));
  for(const f of fs.docs){const n=f.data().chunks||0;for(let i=0;i<n;i++)await deleteDoc(doc(db,'listings',id,'chunks',f.id+'_'+i));await deleteDoc(f.ref)}
}

/* ---------- publish / edit ---------- */
let editing=null,old=null,mine=[];
function resetForm(){
  editing=null;old=null;
  ['#pt','#pp','#pd','#pfe','#pdm','#pc'].forEach(s=>$(s).value='');$('#pi').value='';$('#pf').value='';$('#pcat').selectedIndex=0;
  $('#ftitle').textContent='Add a product';$('#editNote').textContent='';$('#cancel').classList.add('d-none');$('#save').textContent='Publish';
}
$('#cancel').onclick=()=>{resetForm();stat('')};

$('#save').onclick=async()=>{
  const title=$('#pt').value.trim(),price=Math.round(Number($('#pp').value)),desc=$('#pd').value.trim(),
    feats=$('#pfe').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),demo=$('#pdm').value.trim(),
    imgs=[...$('#pi').files].slice(0,6),files=[...$('#pf').files],pasted=$('#pc').value;
  if(!title)return toast('Enter the product name');
  if(!(price>=1))return toast('Enter a price of at least 1 peso');
  if(!desc)return toast('Enter a description');
  if(demo&&!/^https?:\/\//i.test(demo))return toast('The live demo link must start with https://');
  if(!editing&&!imgs.length)return toast('Add at least one display image');
  if(!editing&&!files.length&&!pasted.trim())return toast('Add the files buyers will receive, or paste the code');
  if(files.reduce((a,f)=>a+f.size,0)+pasted.length>MAX_TOTAL)return toast('Files are too big. Maximum is 10 MB in total.');
  const btn=$('#save'),label=btn.textContent;btn.disabled=true;
  try{
    await authm_refresh();
    const id=editing||doc(collection(db,'listings')).id;
    let cover=old?.cover||'';
    if(imgs.length){
      stat('Processing images...');
      const full=[];for(const f of imgs)full.push(await shrink(f,1100,600000));
      cover=await shrink(imgs[0],640,150000);
      if(editing)await clearMedia(id);
      for(let i=0;i<full.length;i++){stat(`Saving image ${i+1} of ${full.length}...`);await setDoc(doc(db,'listings',id,'media',mid(i)),{n:i,data:full[i]})}
    }
    if(files.length||pasted.trim()){
      if(editing){stat('Replacing old files...');await clearFiles(id)}
      const list=[...files];if(pasted.trim())list.push(new File([pasted],'pasted-code.txt',{type:'text/plain'}));
      for(let k=0;k<list.length;k++){
        const data=await b64(list[k]),n=Math.max(1,Math.ceil(data.length/CH)),fid='f'+String(k).padStart(2,'0');
        for(let i=0;i<n;i++){stat(`Uploading ${list[k].name}: ${i+1}/${n}`);await setDoc(doc(db,'listings',id,'chunks',fid+'_'+i),{d:data.slice(i*CH,(i+1)*CH)})}
        await setDoc(doc(db,'listings',id,'files',fid),{name:list[k].name,size:list[k].size,chunks:n});
      }
    }
    stat('Publishing...');
    const data={title,cat:$('#pcat').value,price,desc,features:feats,demo,cover,seller:user.uid,sname:OWNER.name,updated:serverTimestamp()};
    if(!editing)data.created=serverTimestamp();
    await setDoc(doc(db,'listings',id),data,{merge:true});   // the listing goes live only when everything above succeeded
    const was=editing;resetForm();
    stat('');toast(was?'Product updated.':'Published! It is now live in the Marketplace.');
  }catch(e){console.error(e);stat('');toast('Publish failed: '+fail(e))}
  btn.disabled=false;if(!editing)btn.textContent='Publish';else btn.textContent=label;
};

/* ---------- my products ---------- */
function draw(){
  $('#items').innerHTML=mine.length?mine.map(l=>`<div class="panel mb-2"><div class="d-flex gap-2 align-items-center">${l.cover?`<img src="${l.cover}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px">`:''}<div class="me-auto"><b>${esc(l.title)}</b><div class="muted small">&#8369;${Number(l.price).toLocaleString()} &middot; ${esc(l.cat)} &middot; <span class="st approved">Live</span></div></div></div>
   <div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-outline-light" data-edit="${l.id}">Edit</button><a class="btn btn-sm btn-outline-light" href="market.html">View</a><button class="btn btn-sm btn-outline-danger ms-auto" data-del="${l.id}">Delete</button></div></div>`).join(''):'<div class="muted small">No products yet. Publish your first one.</div>';
}
onSnapshot(query(collection(db,'listings'),where('seller','==',user.uid)),s=>{
  mine=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.created?.seconds||0)-(a.created?.seconds||0));draw();
},e=>toast('Could not load your products: '+fail(e)));

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.edit){
    const l=mine.find(x=>x.id==b.dataset.edit);if(!l)return;editing=l.id;old=l;
    $('#pt').value=l.title||'';$('#pp').value=l.price||'';$('#pd').value=l.desc||'';$('#pfe').value=(l.features||[]).join('\n');$('#pdm').value=l.demo||'';$('#pcat').value=l.cat||'Website';
    $('#ftitle').textContent='Edit product';$('#editNote').textContent='Leave the images and files empty to keep the current ones.';$('#cancel').classList.remove('d-none');$('#save').textContent='Save changes';
    $('#form').scrollIntoView({behavior:'smooth'});
  }
  if(b.dataset.del){
    const l=mine.find(x=>x.id==b.dataset.del);if(!l||!confirm(`Delete "${l.title}" from the Marketplace? This cannot be undone.`))return;
    try{stat('Deleting...');await clearFiles(l.id);await clearMedia(l.id);await deleteDoc(doc(db,'listings',l.id));if(editing==l.id)resetForm();stat('');toast('Deleted.')}catch(x){stat('');toast('Delete failed: '+fail(x))}
  }
});
