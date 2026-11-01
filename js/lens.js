import {$,$$,esc,toast,ready} from './app.js';
import {GEMINI} from '../config.js';
import {analyzeCode,runJs,explainRuntime} from './checker.js';
function detect(c){if(/^\s*</.test(c))return'html';if(/^\s*(def |class \w+.*:|import \w+\s*$|from \w+ import|print\()/m.test(c)&&!/[;{}]/.test(c))return'python';if(!/function|=>|const |let |var |console\./.test(c)&&/[^{}]+\{[^{}]*:[^{}]*;?\s*\}/.test(c))return'css';return'js'}
const HT={div:'a container box',p:'a paragraph',h1:'the main heading',h2:'a second-level heading',h3:'a third-level heading',a:'a link to another page',img:'an image',button:'a button',input:'a field where the user types',form:'a form that sends data',ul:'a bulleted list',ol:'a numbered list',li:'one list item',table:'a table',nav:'a navigation bar',footer:'the bottom part of the page',section:'a section of the page',script:'JavaScript code',style:'CSS styles',link:'imports a file such as CSS',head:'page information that is not displayed',body:'everything visible on the page',html:'the root of the whole page',span:'a small inline piece of text',title:'the title shown in the browser tab',meta:'page information',header:'the top part of the page',main:'the main content',label:'the name of an input',textarea:'a large text box',select:'a dropdown'};
const RULES={js:[[/^\s*(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,m=>`Defines a function named "${m[2]}"${m[3].trim()?` that takes: ${m[3]}`:' with no inputs'}. It only runs when you call ${m[2]}().`],[/^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>/,m=>`Defines an arrow function named "${m[2]}", a short way to write a function.`],[/^\s*(const|let|var)\s+(\w+)/,m=>`Creates a variable named "${m[2]}" (${m[1]=='const'?'its value cannot be reassigned':'its value can change'}).`],[/^\s*}?\s*else\s+if\s*\(/,()=>'Another condition, checked when the earlier if was false.'],[/^\s*if\s*\(/,()=>'A condition: the code inside runs only if the expression in the parentheses is true.'],[/^\s*}?\s*else\b/,()=>'Runs when the earlier condition was false.'],[/^\s*for\s*\(/,()=>'A loop: repeats the code inside for a count or a list.'],[/^\s*while\s*\(/,()=>'A loop: repeats while the condition stays true.'],[/^\s*return\b/,()=>'Sends a result back to whoever called the function and stops the function.'],[/console\.(log|error|warn)/,()=>'Prints a message to the browser console, mostly for debugging.'],[/addEventListener\(\s*['"](\w+)/,m=>`Listens for the "${m[1]}" event and runs a function when it happens.`],[/querySelector|getElementById|getElementsBy/,()=>'Finds an element on the page so the code can use it.'],[/fetch\(/,()=>'Requests data from a server or API on the internet.'],[/\.(map|filter|forEach|reduce)\(/,m=>`Uses ${m[1]}() to go through each item of an array.`],[/\btry\s*\{/,()=>'Tries the code inside; if it fails, control jumps to catch.'],[/catch\s*\(/,()=>'Runs when the try block throws an error.'],[/setTimeout|setInterval/,()=>'Runs code after a delay, or repeatedly.'],[/innerHTML|textContent|\.value/,()=>'Reads or changes the content of an element.'],[/localStorage/,()=>'Saves or reads data stored in the browser.'],[/^\s*(import|export)\b/,()=>'Imports or exports code between files.'],[/^\s*class\s+(\w+)/,m=>`Defines a class named "${m[1]}", a blueprint for objects.`],[/^\s*\/\/|^\s*\/\*/,()=>'A comment. It does not run.'],[/=/,()=>'Assigns or updates a value.']],
python:[[/^\s*def\s+(\w+)\s*\(([^)]*)\)/,m=>`Defines a function named "${m[1]}"${m[2].trim()?` that takes: ${m[2]}`:''}.`],[/^\s*class\s+(\w+)/,m=>`Defines a class named "${m[1]}".`],[/^\s*elif\b/,()=>'Another condition, checked when the earlier if was false.'],[/^\s*if\b/,()=>'A condition: the block runs only if it is true.'],[/^\s*else\b/,()=>'Runs when all earlier conditions were false.'],[/^\s*for\b/,()=>'A loop: repeats for each item.'],[/^\s*while\b/,()=>'A loop: repeats while the condition is true.'],[/^\s*return\b/,()=>'Sends the function result back.'],[/\bprint\(/,()=>'Prints to the screen.'],[/\binput\(/,()=>'Asks the user for input.'],[/^\s*(import|from)\b/,()=>'Imports a library or module.'],[/^\s*try\b/,()=>'Tries the code; on error it jumps to except.'],[/^\s*except\b/,()=>'Runs when an error happened.'],[/^\s*#/,()=>'A comment. It does not run.'],[/=/,()=>'Assigns a value to a variable.']]};
function explain(l,lang){const s=l.trim();if(!s)return null;
 if(lang=='html'){const m=s.match(/^<\/?([a-zA-Z][\w-]*)/);if(s.startsWith('<!--'))return'A comment.';if(/^<!doctype/i.test(s))return'Tells the browser this is an HTML5 page.';if(m){const d=HT[m[1].toLowerCase()];return s[1]=='/'?`Closes <${m[1]}>.`:`Opens <${m[1]}>${d?`: ${d}`:''}.`}return'Text content of the page.'}
 if(lang=='css'){if(/\{\s*$/.test(s))return`Selects "${s.replace('{','').trim()}" to apply styles.`;if(s=='}')return'End of the style block.';const m=s.match(/^([\w-]+)\s*:\s*(.+?);?$/);return m?`Sets ${m[1]} to ${m[2]}.`:null}
 for(const r of RULES[lang]||[]){const m=s.match(r[0]);if(m)return r[1](m)}return/^[{}\[\]();,]*$/.test(s)?'A symbol that opens or closes a part of the code.':'Continues the previous line.'}
function autofix(code,er,lang){er=er.filter(e=>e.level!='warning');const f=code.split('\n');er.filter(e=>e.fixLine&&f[e.line-1]!=null).forEach(e=>{if(!f[e.line-1].trimEnd().endsWith(':'))f[e.line-1]=f[e.line-1].trimEnd()+':'});
 er.filter(e=>e.close==')'&&e.line&&lang!='html'&&f[e.line-1]!=null).forEach(e=>{const L=f[e.line-1],k=L.lastIndexOf('{');f[e.line-1]=k>=0?L.slice(0,k).trimEnd()+') '+L.slice(k):L.trimEnd()+')'});
 const cl=er.filter(e=>e.close&&!(e.close==')'&&lang!='html')).map(e=>e.close).reverse();return f.join('\n')+(cl.length?'\n'+cl.join('\n'):'')}
// ---------- Voice ----------
const voiceNote = m => { const n = $('#note'); if (n) n.innerHTML = '<span class="text-warning">Gemini voice problem: ' + esc(m) + ' The browser voice is used instead.</span>'; };
// Gemini voice is fetched ahead of time (pipeline) so the speech continues without gaps.
// If Gemini voice fails, the REAL reason is shown under the editor and the browser voice takes over.
let ctx, src, token = 0;
let geminiVoiceBlockedUntil = 0;
try { geminiVoiceBlockedUntil = Number(localStorage.getItem('codelensGeminiVoiceBlockedUntil') || 0); } catch (e) {}
const GEMINI_DAILY_QUOTA_COOLDOWN = 60 * 60 * 1000;
const GEMINI_SHORT_COOLDOWN = 45 * 1000;
const PREFETCH = 3;
const audioCache = new Map();

const stopAll = () => {
    token++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    try { if (src) { src.onended = null; src.stop(); } } catch (e) {}
    src = null;
    document.querySelectorAll('.speaking').forEach(x => x.classList.remove('speaking'));
};

const isQuotaError = m => /quota|rate.?limit|exceeded|too many requests|429|free.?tier|resource.?exhausted/i.test(String(m || ''));

function blockGeminiVoice(duration) {
    geminiVoiceBlockedUntil = Date.now() + duration;
    try { localStorage.setItem('codelensGeminiVoiceBlockedUntil', String(geminiVoiceBlockedUntil)); } catch (e) {}
}

function splitSpeechText(text, maxLength = 180) {
    const cleaned = String(text || '').trim();
    if (!cleaned) return [];
    const sentences = cleaned.match(/[^.!?\n]+[.!?]?|\n+/g) || [cleaned];
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
        const part = sentence.trim();
        if (!part) continue;
        if ((current + ' ' + part).trim().length <= maxLength) {
            current = (current + ' ' + part).trim();
        } else {
            if (current) chunks.push(current);
            if (part.length <= maxLength) {
                current = part;
            } else {
                const words = part.split(/\s+/);
                current = '';
                for (const word of words) {
                    if ((current + ' ' + word).trim().length > maxLength) {
                        if (current) chunks.push(current);
                        current = word;
                    } else {
                        current = (current + ' ' + word).trim();
                    }
                }
            }
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function browserSpeak(text, myToken) {
    return new Promise(resolve => {
        if (!('speechSynthesis' in window)) { resolve(false); return; }
        const chunks = splitSpeechText(text);
        let index = 0;
        const next = () => {
            if (myToken !== token || index >= chunks.length) { resolve(myToken === token); return; }
            const u = new SpeechSynthesisUtterance(chunks[index++]);
            u.lang = 'en-US';
            u.rate = 1;
            u.onend = () => { if (myToken !== token) resolve(false); else next(); };
            u.onerror = () => { if (myToken !== token) resolve(false); else next(); };
            speechSynthesis.speak(u);
        };
        next();
    });
}

function ensureCtx() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

async function gemini(text, voice) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let r;
    try {
        r = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'tts', text, voice }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('Voice API returned an invalid response.'); }
    if (!r.ok) throw new Error(j.error || 'Gemini voice request failed.');

    let audio = j.audio;
    if (typeof audio !== 'string' || !audio.trim()) throw new Error('Gemini returned empty audio data.');
    audio = audio.trim().replace(/^data:audio\/[^;]+;base64,/i, '').replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (audio.length % 4) audio += '=';
    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 2) throw new Error('Gemini returned audio that is too short.');

    const c = ensureCtx();
    // WAV / MP3 containers decode directly.
    try {
        const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const decoded = await c.decodeAudioData(copy);
        if (decoded && decoded.length) return decoded;
    } catch (e) { /* raw PCM: handled below */ }

    // Raw 16-bit PCM, mono, 24 kHz (Gemini default).
    const evenLength = bytes.length - (bytes.length % 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, evenLength);
    const n = evenLength / 2;
    const buffer = c.createBuffer(1, n, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    return buffer;
}

function getAudio(text) {
    const voice = $('#voice').value;
    const key = voice + '|' + text;
    if (!audioCache.has(key)) {
        const p = gemini(text, voice).catch(error => {
            audioCache.delete(key);
            if (isQuotaError(error.message)) {
                blockGeminiVoice(/per day|daily/i.test(error.message) ? GEMINI_DAILY_QUOTA_COOLDOWN : GEMINI_SHORT_COOLDOWN);
            }
            voiceNote(error.message);
            return null; // the caller falls back to the browser voice
        });
        audioCache.set(key, p);
        if (audioCache.size > 60) audioCache.delete(audioCache.keys().next().value);
    }
    return audioCache.get(key);
}

const useGemini = () => $('#voice').value !== 'browser' && Date.now() >= geminiVoiceBlockedUntil;

function playBuffer(buffer, my) {
    return new Promise(resolve => {
        if (my !== token) return resolve(false);
        const s = ctx.createBufferSource();
        src = s;
        s.buffer = buffer;
        s.connect(ctx.destination);
        s.onended = () => resolve(my === token);
        s.start();
    });
}

// Speaks a list of {text, el} one after another with no gaps.
async function speakSeq(items) {
    stopAll();
    const my = token;
    ensureCtx();
    const prefetch = from => {
        if (!useGemini()) return;
        for (let k = from; k < Math.min(items.length, from + PREFETCH); k++) getAudio(items[k].text);
    };
    prefetch(0);
    for (let i = 0; i < items.length; i++) {
        if (my !== token) return false;
        const { text, el } = items[i];
        if (el) { el.classList.add('speaking'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        try {
            prefetch(i);
            let buf = null;
            if (useGemini()) buf = await getAudio(text);
            if (my !== token) return false;
            if (buf) await playBuffer(buf, my);
            else await browserSpeak(text, my);
        } finally {
            if (el) el.classList.remove('speaking');
        }
        if (my !== token) return false;
    }
    return true;
}
const speak = (text, el) => speakSeq([{ text, el }]);

async function askGemini(prompt){
    let error = '';
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'text', prompt }) });
            const raw = await r.text();
            let j = null; try { j = JSON.parse(raw); } catch (e) {}
            if (r.ok && j && j.text) return { text: j.text, error: '' };
            error = (j && j.error) ? j.error + ' (HTTP ' + r.status + ')'
                : r.status === 404 ? 'HTTP 404: /api/gemini does not exist here. Open the site from your Vercel link (the api folder must be deployed), not from a file or other host.'
                : 'HTTP ' + r.status + ': ' + raw.slice(0, 200);
            if (r.status < 500 && r.status !== 429) break;
        } catch (e) { error = 'Could not reach /api/gemini: ' + e.message; }
        await new Promise(res => setTimeout(res, 1200));
    }
    return { text: '', error };
}
await ready;
$('#voice').innerHTML=['Kore','Puck','Charon','Fenrir','Aoede','Zephyr'].map(v=>`<option value="${v}" ${v==GEMINI.voice?'selected':''}>Gemini voice: ${v}</option>`).join('')+'<option value="browser">Browser voice</option>';
$('#note').textContent='Gemini AI and voice run through the secure Vercel API.';
let parts=[];
const card=e=>{const warn=e.level=='warning',t=(e.line?`Line ${e.line}: `:'')+e.msg;
 return `<div class="line ${warn?'warn':'err'}" data-s="${esc(t)}"><b>${e.line?'Line '+e.line:'Syntax'}</b> <span class="badge ${warn?'text-bg-warning':'text-bg-danger'}">${esc(e.kind||'Error')}</span>${e.text?`<pre class="src">${esc(e.text.slice(0,160))}</pre>`:''}<div class="ex">${esc(e.msg)}</div>${e.tech?`<div class="tech">Real message: <code>${esc(e.tech)}</code></div>`:''}</div>`};
let busy=false;
async function analyzeNow(){const code=$('#code').value;if(!code.trim())return toast('Paste some code first');if(busy)return;stopAll();
 let lang=$('#lang').value;if(lang=='auto')lang=detect(code);const ls=code.split('\n');parts=[];busy=true;$('#runRes').innerHTML='';
 let res;try{res=await analyzeCode(code,lang,m=>{$('#res').innerHTML='<div class="muted">'+esc(m)+'</div>'})}catch(x){busy=false;console.error(x);$('#res').innerHTML='<div class="line err"><b>Checker crashed</b><div class="ex">'+esc(x.message||String(x))+'</div></div>';return}
 busy=false;const all=res.errors,er=all.filter(e=>e.level!='warning'),wr=all.filter(e=>e.level=='warning');
 let h=`<div class="mb-3"><span class="badge text-bg-info">${lang.toUpperCase()}</span> <span class="ms-2">${ls.length} lines</span></div>`;
 if(er.length){h+=`<h5 class="text-danger"><i class="bi bi-bug"></i> ${er.length} error${er.length>1?'s':''} found</h5>`+er.map(card).join('');
  const fx=autofix(code,er,lang);h+=fx!=code?`<h6 class="mt-3">Suggested fix</h6><textarea class="form-control code" readonly style="min-height:120px">${esc(fx)}</textarea>`:`<p class="muted small">No automatic fix is available. Follow the explanations above.</p>`}
 else{const t='No syntax errors found.';h+=`<h5 style="color:var(--mint)"><i class="bi bi-check-circle"></i> ${t}</h5><div class="line d-none" data-s="${t}"></div>`+(lang=='js'?'<p class="muted small">The syntax is correct. To catch errors that only happen while the program runs (for example a name that is not defined), press "Run &amp; check".</p>':'')}
 if(wr.length)h+=`<h6 class="mt-3 text-warning"><i class="bi bi-exclamation-triangle"></i> ${wr.length} warning${wr.length>1?'s':''} (the page works, but fix these)</h6>`+wr.map(card).join('');
 (res.notes||[]).forEach(n=>{h+=`<p class="muted small mt-2"><i class="bi bi-info-circle"></i> ${esc(n)}</p>`});
 const fn=[...code.matchAll(lang=='python'?/def\s+(\w+)/g:/function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/g)].map(m=>m[1]||m[2]);
 if(fn.length){const t='Functions in this code: '+fn.join(', ');h+=`<h6 class="mt-3">Functions</h6><div class="line" data-s="${esc(t)}">${fn.map(f=>`<code>${esc(f)}</code>`).join(', ')}</div>`}
 h+='<h5 class="mt-4">Line-by-line explanation</h5>';ls.forEach((l,i)=>{const e=explain(l,lang);if(!e)return;h+=`<div class="line" data-s="${esc(`Line ${i+1}. ${e}`)}"><code>${esc(l.trim().slice(0,90))}</code><div class="ex"><b>${i+1}.</b> ${esc(e)}</div></div>`});
 $('#res').innerHTML=h;parts=$$('#res .line');$('#ai').innerHTML=''}
$('#go').onclick=analyzeNow;
$('#runBtn').onclick=async()=>{const code=$('#code').value;if(!code.trim())return toast('Paste some code first');
 let lang=$('#lang').value;if(lang=='auto')lang=detect(code);if(lang!='js')return toast('Run & check works for JavaScript. HTML, CSS and Python are checked with Analyze.');
 const syn=(await analyzeCode(code,'js')).errors;if(syn.length){await analyzeNow();return toast('Fix the syntax error first, then run.')}
 if(!confirm('Run this code once inside a locked sandbox (no internet, no access to this website) to find runtime errors? Code that never ends is stopped after 4 seconds.'))return;
 $('#runRes').innerHTML='<div class="muted mt-3">Running...</div>';const r=await runJs(code);let h='<h5 class="mt-3">Run result</h5>';
 if(r.error){const m=r.error.msg||'',help=explainRuntime(m),ln=r.error.line;h+=`<div class="line err" data-s="${esc((ln?'Line '+ln+': ':'')+help)}"><b>${ln?'Line '+ln:'Runtime error'}</b> <span class="badge text-bg-danger">${esc(r.error.name||'Error')}</span>${ln?`<pre class="src">${esc(((code.split('\n')[ln-1])||'').trim().slice(0,160))}</pre>`:''}<div class="ex">${esc(help)}</div><div class="tech">Real message: <code>${esc((r.error.name||'Error')+': '+m)}</code></div></div>`}
 else if(r.timeout)h+='<div class="line warn"><b>No finish after 4 seconds</b><div class="ex">The code did not stop. It probably has an infinite loop (a while/for that never ends), or it waits for something that never comes.</div></div>';
 else h+='<h6 style="color:var(--mint)"><i class="bi bi-check-circle"></i> The code ran without any runtime error.</h6>';
 if(r.logs&&r.logs.length)h+='<h6 class="mt-3">Console output</h6><pre class="src">'+esc(r.logs.join('\n').slice(0,3000))+'</pre>';
 $('#runRes').innerHTML=h}
$('#res').onclick=e=>{const l=e.target.closest('.line');if(l)speak(l.dataset.s,l)};
$('#say').onclick=()=>{if(!parts.length)return toast('Analyze some code first');speakSeq(parts.map(el=>({text:el.dataset.s,el})))};
$('#stop').onclick=stopAll;
$('#aiBtn').onclick=async()=>{const code=$('#code').value;if(!code.trim())return toast('Paste some code first');
 $('#ai').innerHTML='<div class="muted">Gemini is reading your code...</div>';
 const g=await askGemini('You are a patient coding teacher. Review this code. 1) List every error with its line number and the fix. 2) Explain each function and what every important line does, in simple English. 3) Give the corrected full code. Keep it clear.\n\n'+code);
 if(!g.text){await analyzeNow();$('#ai').innerHTML=`<div class="line err"><b>Gemini could not answer</b><div class="ex">${esc(g.error||'No answer.')}</div><div class="muted small mt-1">The built-in checker result is shown above instead.</div></div>`;return}
 const t=g.text;
 $('#ai').innerHTML=`<h5 class="mt-3">Gemini explanation</h5><div class="ai panel">${esc(t)}</div><button class="btn btn-outline-light btn-sm mt-2" id="aiSay"><i class="bi bi-volume-up"></i> Read aloud</button>`;
 $('#aiSay').onclick=()=>{const txt=t.replace(/```[\s\S]*?```/g,' (code block skipped) ').replace(/[*#`]/g,''),ch=(txt.match(/[\s\S]{1,500}(?:[.!?\n]|$)/g)||[]).map(x=>x.trim()).filter(Boolean);speakSeq(ch.map(text=>({text,el:null})))}};
