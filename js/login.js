import {$,$$,toast,auth,authm,errMsg,ready,welcomeFor,welcomeGate} from './app.js';
const nx=new URLSearchParams(location.search).get('next')||'market.html',go=()=>location.href=/^[\w.-]+\.html$/.test(nx)?nx:'market.html';
// After every login: make sure the welcome email is sent (waits up to 12 s so the page change cannot cancel it), then continue.
const finish=async()=>{let r=null;try{r=await Promise.race([welcomeFor(auth.currentUser),new Promise(x=>setTimeout(()=>x(null),12000))])}catch(e){console.error(e)}
 if(r&&!r.ok&&!r.skipped)await new Promise(x=>setTimeout(x,3500));else if(r&&r.sent)await new Promise(x=>setTimeout(x,1800));go()};
await ready;if(auth.currentUser)go();
$$('.auth-tabs button').forEach(b=>b.onclick=()=>{$$('.auth-tabs button').forEach(x=>x.classList.toggle('on',x==b));$('#fLogin').classList.toggle('d-none',b.dataset.t!='login');$('#fReg').classList.toggle('d-none',b.dataset.t!='reg')});
$$('.eye').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input'),h=i.type=='password';i.type=h?'text':'password';b.innerHTML=`<i class="bi bi-eye${h?'':'-slash'}"></i>`});
const busy=(b,v,t)=>{b.disabled=v;b.innerHTML=v?'<span class="spinner-border spinner-border-sm"></span> Please wait...':t};
authm.setPersistence(auth,authm.browserLocalPersistence).catch(()=>{});
try{const rr=await authm.getRedirectResult(auth);if(rr&&rr.user)await finish()}catch(e){toast(errMsg(e)+(e.code?' ['+e.code+']':''))}
if(!/^https?:$/.test(location.protocol))toast('Open this site from its https:// link (Vercel) or localhost. Google sign-in does not work from a file.');
let gBusy=false;
function google(){if(gBusy)return;gBusy=true;const p=new authm.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 authm.signInWithPopup(auth,p).then(()=>finish()).catch(async e=>{
  if(e.code=='auth/popup-blocked'||e.code=='auth/operation-not-supported-in-this-environment'){try{await authm.signInWithRedirect(auth,p);return}catch(x){e=x}}
  if(e.code!='auth/popup-closed-by-user')toast(errMsg(e)+(e.code?' ['+e.code+']':''))}).finally(()=>{gBusy=false})}
$('#gl').onclick=google;
$('#fLogin').onsubmit=async e=>{e.preventDefault();const b=$('#bl');busy(b,true);try{await authm.setPersistence(auth,$('#rem').checked?authm.browserLocalPersistence:authm.browserSessionPersistence);await authm.signInWithEmailAndPassword(auth,$('#le').value.trim(),$('#lp').value);await finish()}catch(x){toast(errMsg(x)+(x.code?' ['+x.code+']':''));busy(b,false,'Log in')}};
$('#forgot').onclick=async e=>{e.preventDefault();const m=$('#le').value.trim();if(!m)return toast('Type your email first, then click Forgot password');try{await authm.sendPasswordResetEmail(auth,m);toast('Password reset email sent. Check your inbox.')}catch(x){toast(errMsg(x))}};
const score=p=>(p.length>=8)+(p.length>=12)+/[A-Z]/.test(p)+/\d/.test(p)+/[^\w\s]/.test(p);
const L=[['Too short','#ff6b6b',10],['Weak','#ff6b6b',25],['Fair','#ffb347',50],['Good','#9be26b',75],['Strong','#38d996',100],['Very strong','#38d996',100]];
const chk=()=>{const p=$('#rp').value,c=$('#rc').value,s=p?L[Math.min(score(p),5)]:['','#223a52',0];$('#sb').style.width=s[2]+'%';$('#sb').style.background=s[1];$('#sl').textContent=p?'Strength: '+s[0]:'';
 const n=$('#cn');if(!c){n.textContent='';return}n.className='field-note '+(p==c?'ok':'no');n.innerHTML=p==c?'<i class="bi bi-check-circle"></i> Passwords match':'<i class="bi bi-x-circle"></i> Passwords do not match'};
$('#rp').oninput=chk;$('#rc').oninput=chk;
$('#fReg').onsubmit=async e=>{e.preventDefault();const n=$('#rn').value.trim(),m=$('#re').value.trim(),p=$('#rp').value;
 if(!n)return toast('Enter your full name');if(p.length<6)return toast('Password must be at least 6 characters');if(p!=$('#rc').value)return toast('Passwords do not match');if(!$('#tos').checked)return toast('Please accept the license terms');
 const b=$('#br');busy(b,true);welcomeGate.hold=true;try{await authm.setPersistence(auth,authm.browserLocalPersistence);const c=await authm.createUserWithEmailAndPassword(auth,m,p);await authm.updateProfile(c.user,{displayName:n});welcomeGate.hold=false;await finish()}catch(x){welcomeGate.hold=false;toast(errMsg(x)+(x.code?' ['+x.code+']':''));busy(b,false,'Create account')}};
