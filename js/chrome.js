export const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function toast(m){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',3500)}
let footDone=false;
export function render(user,isOwner){
 const nav=$('#nav');if(nav){const page=location.pathname.split('/').pop()||'index.html',
 L=[['index.html','Home'],['analyzer.html','Code Lens'],['market.html','Marketplace'],['orders.html','My Orders'],...(isOwner?[['admin.html','Owner Panel']]:[]),['verify.html','Verify License']];
 nav.innerHTML=`<nav class="navbar navbar-expand-lg sticky-top"><div class="container"><a class="brand" href="index.html">Code<b>Lens</b></a>
 <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#nv" aria-label="Menu"><i class="bi bi-list text-white fs-2"></i></button>
 <div class="collapse navbar-collapse" id="nv"><ul class="navbar-nav me-auto">${L.map(l=>`<li class="nav-item"><a class="nav-link ${page==l[0]?'active':''}" href="${l[0]}">${l[1]}</a></li>`).join('')}</ul>
 ${user?`<span class="me-3 d-flex align-items-center gap-2 muted">${user.photoURL?`<img class="avatar" src="${esc(user.photoURL)}" referrerpolicy="no-referrer" alt="">`:'<i class="bi bi-person-circle"></i>'}${esc(user.displayName||user.email)}${isOwner?' <span class="badge text-bg-warning">Owner</span>':''}</span><button class="btn btn-sm btn-outline-light" id="lo">Log out</button>`:`<a class="btn btn-mint btn-sm" href="login.html?next=${page}">Log in / Sign up</a>`}</div></div></nav>`;
 const lo=$('#lo');if(lo)lo.onclick=()=>document.dispatchEvent(new Event('cl-logout'))}
 if(footDone)return;footDone=true;
 const f=$('#foot');if(f)f.innerHTML=`<footer class="py-4 mt-5"><div class="container d-flex flex-wrap justify-content-between gap-2"><div><b class="brand">Code<span style="color:var(--mint)">Lens</span></b><div class="muted small">Check, explain, buy and sell code.</div></div><div class="muted small text-md-end">Developer: <b class="text-white">Roniel Nyke Gonzales - BS INFO TECH 2-B</b><br>&copy; ${new Date().getFullYear()} All rights reserved. Protected by the <a href="LICENSE.txt" class="text-info">CodeLens License</a>.</div></div></footer>`;
 if(!$('#toast')){const t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
 if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting)x.target.classList.add('in')}),{threshold:.15});$$('.reveal').forEach(r=>io.observe(r))}else $$('.reveal').forEach(r=>r.classList.add('in'));
}
render(null,false);

// Shows the real error (message + file + line) on screen, so nothing fails silently.
(function(){
  if(window.__clErr)return;window.__clErr=true;
  const seen=new Set();
  function show(msg,where){
    const key=msg+where;if(seen.has(key))return;seen.add(key);
    let box=document.getElementById('clerr');
    if(!box){box=document.createElement('div');box.id='clerr';
      box.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:40vh;overflow:auto;background:#2a0f14;color:#ffd6d6;border:1px solid #ff6b6b;border-radius:10px;padding:10px 12px;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap';
      const x=document.createElement('button');x.textContent='Close';x.style.cssText='float:right;margin-left:8px;background:#ff6b6b;border:0;border-radius:6px;padding:2px 8px;cursor:pointer';x.onclick=()=>{box.remove();seen.clear()};box.appendChild(x);
      const h=document.createElement('b');h.textContent='Error on this page:';box.appendChild(h);document.body.appendChild(box)}
    const d=document.createElement('div');d.style.marginTop='6px';d.textContent=msg+(where?'\n   at '+where:'');box.appendChild(d);console.error(msg,where||'')}
  const mine=f=>!f||f.startsWith(location.origin);
  window.addEventListener('error',e=>{if(e.target&&e.target!==window&&e.target.tagName){const t=e.target;if(t.tagName=='SCRIPT'||t.tagName=='LINK')show('Could not load '+(t.src||t.href)+' (blocked or offline).','');return}
    if(!mine(e.filename))return;show((e.error&&e.error.name?e.error.name+': ':'')+e.message,(e.filename||'').replace(location.origin,'')+':'+e.lineno+':'+e.colno)},true);
  window.addEventListener('unhandledrejection',e=>{const r=e.reason;const m=r&&r.message?r.message:String(r);if(/ResizeObserver|AbortError/.test(m))return;show('Unhandled error: '+(r&&r.name?r.name+': ':'')+m+(r&&r.code?' ['+r.code+']':''),'')});
})();
