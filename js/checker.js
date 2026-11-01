// CodeLens checker: finds the REAL errors of pasted code (with the real line number),
// then explains each one in simple words.
//  - JavaScript : the browser's own compiler (real SyntaxError text) + exact line finder; optional safe run for runtime errors
//  - HTML       : tag structure, broken tags, duplicate ids, and the JavaScript / CSS written inside <script> / <style>
//  - CSS        : the browser's own CSS.supports() for every property and value, selectors, missing ; and }
//  - Python     : the real Python compiler (Pyodide, loaded on demand) -> real SyntaxError / IndentationError
// Every error: { line, col, kind, msg (simple explanation), tech (real message), text (the code line), close, fixLine, level }

const JS_ERR = [
  [/Unexpected end of input/, 'Something is not closed: a bracket, parenthesis, brace or quote is missing, so the code ends too early.'],
  [/missing \) after argument list/, 'A ")" or a comma is missing inside a function call.'],
  [/Unexpected token '?\}'?/, 'A "}" appears where it is not expected: there is one "}" too many, or something before it is missing.'],
  [/Unexpected token '?\)'?/, 'A ")" appears where it is not expected: there is one ")" too many, or an argument is missing before it.'],
  [/Unexpected token 'else'/, 'An "else" has no "if" in front of it. Check the "}" just before it.'],
  [/Unexpected token '?\{'?/, 'A "{" appears where it is not expected, often because a ")" is missing just before it.'],
  [/Unexpected token/, 'A symbol appears where it is not allowed, usually an extra or missing comma, bracket or operator.'],
  [/Unexpected identifier/, 'A name appears in the wrong place, usually a missing comma, operator or ";" before it.'],
  [/Invalid or unexpected token/, 'There is an invalid character or a string that was never closed.'],
  [/Unterminated template/, 'A template string (between backticks) was never closed.'],
  [/Unexpected string/, 'A string appears in the wrong place, usually a missing "+" or comma.'],
  [/Unexpected number/, 'A number appears in the wrong place, usually a missing operator or comma.'],
  [/already been declared/, 'The same variable name was declared twice in the same place. Rename one or remove the second let/const.'],
  [/Missing initializer in const/, 'A const must get a value right away, for example: const x = 5;'],
  [/Invalid left-hand side in assignment/, 'The left side of "=" cannot receive a value. You probably wrote "=" where "==" or "===" was meant, or assigned to a function call.'],
  [/Invalid regular expression/, 'The regular expression is written incorrectly.'],
  [/await is only valid/, '"await" can only be used inside an async function.'],
  [/Unexpected strict mode|Unexpected reserved/, 'A reserved word was used as a name.'],
  [/Illegal (break|continue)/, '"break" / "continue" can only be used inside a loop (or switch for break).'],
  [/Illegal return/, '"return" can only be used inside a function.'],
  [/Unexpected eval or arguments/, '"eval" or "arguments" cannot be used as a name here.'],
  [/Rest parameter must be last/, 'The "..." rest parameter must be the last one.'],
  [/Duplicate parameter/, 'The same parameter name is used twice.']
];

const PAIR = { ')': '(', ']': '[', '}': '{' }, OPEN = { '(': ')', '[': ']', '{': '}' };
const EOF_RE = /Unexpected end of input|Unterminated template|missing \) after argument list|Unexpected token '?end of file/i;
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

const lineText = (code, n) => (code.split('\n')[n - 1] || '').trimEnd();
const explainJs = m => (JS_ERR.find(x => x[0].test(m)) || [0, 'There is a syntax error here.'])[1];

/* ---------------- bracket matcher (used to say WHICH bracket is not closed) ---------------- */
export function brackets(code, lang) {
  const st = [], er = [];
  let line = 1, q = null;
  const py = lang == 'python';
  for (let i = 0; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (c == '\n') { line++; if (q && q != '`') q = null; continue; }
    if (q) { if (c == '\\') { i++; continue; } if (c == q) q = null; continue; }
    if ((!py && lang != 'css' && c == '/' && n == '/') || (py && c == '#')) { while (i < code.length && code[i] != '\n') i++; i--; continue; }
    if (!py && c == '/' && n == '*') {
      const e = code.indexOf('*/', i + 2), seg = code.slice(i, e < 0 ? code.length : e);
      line += (seg.match(/\n/g) || []).length; i = e < 0 ? code.length : e + 1; continue;
    }
    if (c == '"' || c == "'" || (c == '`' && !py)) { q = c; continue; }
    if (OPEN[c]) st.push([c, line]);
    else if (PAIR[c]) {
      const t = st.pop();
      if (!t) er.push({ line, kind: 'Bracket', msg: `Extra "${c}" with no matching "${PAIR[c]}".` });
      else if (t[0] != PAIR[c]) { er.push({ line, kind: 'Bracket', msg: `Mismatch: found "${c}" but the open bracket is "${t[0]}" from line ${t[1]}.` }); st.length = 0; }
    }
  }
  st.forEach(t => er.push({ line: t[1], kind: 'Bracket', msg: `The "${t[0]}" opened on line ${t[1]} is never closed. Add "${OPEN[t[0]]}".`, close: OPEN[t[0]] }));
  return er;
}

/* ---------------- JavaScript ---------------- */
function stripModules(code) {
  // import / export are not allowed inside a function body, so they are blanked (line numbers stay the same).
  const blank = s => s.replace(/[^\n]/g, ' ');
  return code
    .replace(/^\s*import\s+[\w$*{},\s]+?\s*from\s*['"][^'"]*['"]\s*;?/gm, blank)
    .replace(/^\s*import\s*['"][^'"]*['"]\s*;?/gm, blank)
    .replace(/^\s*export\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"][^'"]*['"]\s*;?/gm, blank)
    .replace(/^\s*export\s+default\s+/gm, s => blank(s))
    .replace(/^\s*export\s+(?=(async|function|const|let|var|class)\b)/gm, s => blank(s))
    .replace(/^\s*export\s*\{[^}]*\};?/gm, blank);
}
function compileErr(code) { try { new AsyncFn(code); return null; } catch (e) { return e; } }

// For every line: is something still open after it (bracket, template string, block comment)?
// A prefix of the code that ends inside an open bracket always fails to compile, which is NOT a real error.
function openAfterLine(code) {
  const res = []; let depth = 0, q = null, inBlock = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (c == '\n') { if (q && q != '`') q = null; res.push(depth > 0 || q == '`' || inBlock); continue; }
    if (inBlock) { if (c == '*' && n == '/') { inBlock = false; i++; } continue; }
    if (q) { if (c == '\\') { i++; continue; } if (c == q) q = null; continue; }
    if (c == '/' && n == '/') { while (i < code.length && code[i] != '\n') i++; i--; continue; }
    if (c == '/' && n == '*') { inBlock = true; i++; continue; }
    if (c == '"' || c == "'" || c == '`') { q = c; continue; }
    if (OPEN[c]) depth++; else if (PAIR[c] && depth > 0) depth--;
  }
  res.push(depth > 0 || q == '`' || inBlock);
  return res;
}

export function jsSyntax(source, lineOffset = 0) {
  const code = stripModules(source);
  const first = compileErr(code);
  if (!first) return [];
  const lines = code.split('\n');
  let loc = null;
  if (lines.length <= 4000) {
    const open = openAfterLine(code);
    for (let i = 1; i <= lines.length; i++) {
      if (open[i - 1]) continue;                       // still inside a bracket: an incomplete prefix, not a real error
      const e = compileErr(lines.slice(0, i).join('\n'));
      if (e && !EOF_RE.test(e.message)) { loc = { line: i, e }; break; }
    }
  }
  const br = brackets(code, 'js');
  if (!loc) {
    // Nothing wrong line by line, but the end is reached with something still open.
    const unclosed = br.filter(b => b.close || b.msg.startsWith('Mismatch') || b.msg.startsWith('Extra'));
    const tech = first.name + ': ' + first.message;
    if (unclosed.length) return unclosed.map(b => ({ ...b, line: b.line + lineOffset, kind: 'SyntaxError', tech, text: lineText(source, b.line) }));
    return [{ line: lines.length + lineOffset, kind: 'SyntaxError', msg: explainJs(first.message), tech: first.name + ': ' + first.message, text: lineText(source, lines.length) }];
  }
  const e = { line: loc.line + lineOffset, kind: loc.e.name || 'SyntaxError', msg: explainJs(loc.e.message), tech: (loc.e.name || 'SyntaxError') + ': ' + loc.e.message, text: lineText(source, loc.line) };
  // A "(" opened on this very line and never closed is the most common cause of "Unexpected token": say it exactly and allow auto-fix.
  const hit = br.find(b => b.close == ')' && b.line == loc.line);
  if (hit) { e.msg = hit.msg + ' This is why the code breaks on this line.'; e.close = ')'; }
  return [e];
}

// Optional: really RUN the code in a locked sandbox (no network, no access to this site) to catch runtime errors.
export function runJs(source, ms = 4000) {
  return new Promise(resolve => {
    const code = stripModules(source);
    const ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts');
    ifr.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    const logs = [];
    let done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); removeEventListener('message', onMsg); ifr.remove(); r.logs = logs; resolve(r); };
    const onMsg = ev => {
      if (ev.source !== ifr.contentWindow || !ev.data || ev.data.cl !== 1) return;
      const d = ev.data;
      if (d.t == 'log') logs.push(d.s);
      else if (d.t == 'err') finish({ error: { name: d.name, msg: d.msg, line: d.line, col: d.col } });
      else if (d.t == 'done') setTimeout(() => finish({ ok: true }), 500);
    };
    addEventListener('message', onMsg);
    const timer = setTimeout(() => finish({ timeout: true }), ms);
    const page = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:"><body><script>
const P=(o)=>parent.postMessage(Object.assign({cl:1},o),'*');
const S=v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch(e){return String(v)}};
const loc=st=>{const m=/<anonymous>:(\\d+):(\\d+)/.exec(st||'');return m?{line:Math.max(1,+m[1]-2),col:+m[2]}:{line:0,col:0}};
for(const k of ['log','info','warn','error']){console[k]=(...a)=>P({t:'log',s:(k=='log'?'':k+': ')+a.map(S).join(' ')})}
window.alert=m=>P({t:'log',s:'alert: '+m});window.prompt=()=>null;window.confirm=()=>false;
window.addEventListener('error',e=>{const l=loc(e.error&&e.error.stack);P({t:'err',name:(e.error&&e.error.name)||'Error',msg:e.message,line:l.line||0,col:l.col})});
window.addEventListener('unhandledrejection',e=>{const r=e.reason||{};const l=loc(r.stack);P({t:'err',name:r.name||'Error',msg:'Unhandled promise rejection: '+(r.message||S(r)),line:l.line,col:l.col})});
(async()=>{try{await new (Object.getPrototypeOf(async function(){}).constructor)(${JSON.stringify(code).replace(/</g, '\\u003c')})();P({t:'done'})}catch(e){const l=loc(e&&e.stack);P({t:'err',name:(e&&e.name)||'Error',msg:(e&&e.message)||S(e),line:l.line,col:l.col})}})();
<\/script>`;
    ifr.srcdoc = page;
    document.body.appendChild(ifr);
  });
}
const RUNTIME_HELP = [
  [/is not defined/, 'You use a name that was never created. Check the spelling, or declare it (let / const / function) before using it.'],
  [/is not a function/, 'You call something like a function, but it is not one. Check the name, or whether it was assigned a value first.'],
  [/Cannot read propert(y|ies) of (undefined|null)/, 'You read a property of something that is undefined or null. The variable has no value yet at this point.'],
  [/Cannot set propert(y|ies) of (undefined|null)/, 'You write to a property of something that is undefined or null.'],
  [/before initialization/, 'A let/const variable is used before the line that creates it.'],
  [/Assignment to constant/, 'A const cannot get a new value. Use let if it must change.'],
  [/Maximum call stack/, 'A function keeps calling itself forever (infinite recursion). Add a stopping condition.'],
  [/Invalid array length/, 'An array was given an impossible length (negative or too big).'],
  [/is not iterable/, 'You loop over something that is not a list/array/string.'],
  [/not a constructor/, 'You used "new" with something that is not a class or constructor function.']
];
export const explainRuntime = m => (RUNTIME_HELP.find(x => x[0].test(m)) || [0, 'The code stopped while running because of this error.'])[1];

/* ---------------- HTML ---------------- */
const VOID = new Set('area base br col embed hr img input link meta source track wbr param keygen command'.split(' '));
const OPT = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'colgroup', 'head', 'body', 'html']);
const P_CLOSERS = new Set('address article aside blockquote div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul'.split(' '));
const blank = s => s.replace(/[^\n]/g, ' ');
const lineAt = (code, idx) => code.slice(0, idx).split('\n').length;

export function htmlCheck(code) {
  const er = [];
  let clean = code.replace(/<!--[\s\S]*?-->/g, blank);
  const open = clean.indexOf('<!--');
  if (open >= 0) er.push({ line: lineAt(code, open), kind: 'HTML', msg: 'A comment "<!--" is never closed. Add "-->".', close: '-->' });
  const embedded = [];
  clean = clean.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi, (all, o, tag, body, c, off) => {
    embedded.push({ tag: tag.toLowerCase(), attrs: o, body, start: off + o.length });
    return o + blank(body) + c;
  });
  const hasDoctype = /<!doctype\s+html/i.test(clean);
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;
  const st = [], ids = new Map(), broken = new Set();
  const startRe = /<(\/?)([a-zA-Z][\w:-]*)/g;
  let m;
  while ((m = startRe.exec(clean))) {
    tagRe.lastIndex = m.index;
    const t = tagRe.exec(clean);
    const ln = lineAt(clean, m.index);
    if (!t) { broken.add(m[2].toLowerCase()); er.push({ line: ln, kind: 'HTML', msg: `The tag <${m[1]}${m[2]}> starting on line ${ln} is broken: a ">" or a closing quote (") is missing.`, text: lineText(code, ln) }); continue; }
    startRe.lastIndex = m.index + t[0].length;
    const name = t[2].toLowerCase(), attrs = t[3] || '';
    if (!t[1]) {
      const idm = /\sid\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      if (idm) { const id = idm[2] ?? idm[3]; if (ids.has(id)) er.push({ line: ln, kind: 'HTML', level: 'warning', msg: `The id "${id}" is already used on line ${ids.get(id)}. An id must be unique.`, text: lineText(code, ln) }); else ids.set(id, ln); }
      if (name == 'img' && !/\salt\s*=/i.test(attrs)) er.push({ line: ln, kind: 'HTML', level: 'warning', msg: 'This <img> has no alt="" text. Screen readers and broken-image cases need it.', text: lineText(code, ln) });
      if (/="[^"]*$/.test(attrs.replace(/="[^"]*"/g, ''))) er.push({ line: ln, kind: 'HTML', msg: 'An attribute value has an opening quote but no closing quote.', text: lineText(code, ln) });
    }
    if (VOID.has(name) || /\/\s*$/.test(attrs)) continue;
    if (!t[1]) {
      while (st.length) {
        const top = st[st.length - 1][0];
        if ((['li', 'dt', 'dd', 'option', 'tr', 'td', 'th'].includes(top) && top == name) || (top == 'p' && P_CLOSERS.has(name)) ||
          ((top == 'td' || top == 'th') && (name == 'tr' || name == 'td' || name == 'th')) || (top == 'tr' && name == 'tr') ||
          ((top == 'dt' || top == 'dd') && (name == 'dt' || name == 'dd'))) st.pop(); else break;
      }
      st.push([name, ln]);
    } else {
      let k = st.length - 1;
      while (k >= 0 && st[k][0] != name) k--;
      if (k < 0) { if (broken.has(name)) continue; er.push({ line: ln, kind: 'HTML', msg: `Extra </${name}> on line ${ln}: there is no open <${name}> to close.`, text: lineText(code, ln) }); continue; }
      for (let j = st.length - 1; j > k; j--) {
        if (!OPT.has(st[j][0])) er.push({ line: st[j][1], kind: 'HTML', msg: `<${st[j][0]}> on line ${st[j][1]} is not closed before </${name}> on line ${ln}.`, close: `</${st[j][0]}>`, text: lineText(code, st[j][1]) });
      }
      st.length = k;
    }
  }
  st.forEach(t => { if (!OPT.has(t[0])) er.push({ line: t[1], kind: 'HTML', msg: `<${t[0]}> on line ${t[1]} is never closed.`, close: `</${t[0]}>`, text: lineText(code, t[1]) }); });
  if (!hasDoctype && /<html[\s>]/i.test(clean)) er.push({ line: 1, kind: 'HTML', level: 'warning', msg: 'The page has no <!doctype html> at the top. Browsers may render it in old "quirks" mode.' });
  // JavaScript and CSS written inside the page
  embedded.forEach(b => {
    if (!b.body.trim()) return;
    const baseLine = lineAt(code, b.start) - 1;
    if (b.tag == 'script') {
      const type = (/type\s*=\s*["']([^"']*)["']/i.exec(b.attrs) || [])[1] || '';
      if (/json|template|x-/i.test(type) || /\ssrc\s*=/i.test(b.attrs)) return;
      jsSyntax(b.body, baseLine).forEach(e => er.push({ ...e, kind: 'JavaScript in <script>', close: undefined }));
    } else cssCheck(b.body, baseLine).forEach(e => er.push({ ...e, kind: 'CSS in <style>', close: undefined }));
  });
  return er;
}

/* ---------------- CSS ---------------- */
export function cssCheck(source, lineOffset = 0) {
  const er = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, blank);
  const canSupports = typeof CSS !== 'undefined' && CSS.supports;
  const types = []; // 'rule' | 'group' | 'kf' | 'face' | 'other'
  let buf = '', line = 1, bufLine = 0, i = 0;
  const add = (ln, kind, msg, extra = {}) => er.push({ line: ln + lineOffset, kind, msg, text: lineText(source, ln), ...extra });
  const checkDecl = (stmt, ln) => {
    const s = stmt.trim(); if (!s) return;
    const top = types[types.length - 1];
    if (top == 'group' || top == undefined) { if (!s.startsWith('@')) add(ln, 'CSS', `"${s.slice(0, 40)}" is outside a rule. Properties must be inside { } after a selector.`); return; }
    if (top == 'face' || top == 'other') return;
    const m = /^([\w-]+)\s*:\s*([\s\S]+)$/.exec(s);
    if (!m) { add(ln, 'CSS', `"${s.slice(0, 50)}" is not a valid declaration. A property needs the form  name: value;  (the ":" may be missing).`); return; }
    const prop = m[1], val = m[2].replace(/!important\s*$/i, '').trim();
    if (/:[^;]*\n\s*[\w-]+\s*:/.test(s) && !/url\(|\(/.test(val.split('\n')[0])) {
      add(ln, 'CSS', 'A ";" is missing at the end of this line, so it runs into the next property.', { fixSemi: true }); return;
    }
    if (prop.startsWith('-') || !canSupports) return;
    if (!CSS.supports(prop, 'inherit')) add(ln, 'CSS', `"${prop}" is not a known CSS property. Check the spelling.`, { tech: `Unknown property: ${prop}` });
    else if (!CSS.supports(prop, val.replace(/\s+/g, ' '))) add(ln, 'CSS', `"${val.replace(/\s+/g, ' ').slice(0, 60)}" is not a valid value for "${prop}".`, { tech: `Invalid value for ${prop}: ${val}` });
  };
  while (i < code.length) {
    const c = code[i];
    if (c == '\n') { line++; buf += c; i++; continue; }
    if (c == '"' || c == "'") {
      let j = i + 1;
      while (j < code.length && code[j] != c && code[j] != '\n') { if (code[j] == '\\') j++; j++; }
      if (code[j] != c) add(line, 'CSS', 'A string was opened with a quote but never closed on this line.');
      if (!bufLine) bufLine = line;
      buf += code.slice(i, j + 1); i = j + 1; continue;
    }
    if (c == '(') { // keep url(...) / calc(...) intact, even with ; inside
      let d = 0, j = i;
      for (; j < code.length; j++) { if (code[j] == '(') d++; else if (code[j] == ')') { d--; if (!d) break; } else if (code[j] == '\n') line++; }
      if (!bufLine) bufLine = line;
      buf += code.slice(i, j + 1); i = j + 1; continue;
    }
    if (c == '{') {
      const sel = buf.trim(), ln = bufLine || line, parent = types[types.length - 1];
      let type = 'rule';
      if (/^@(media|supports|layer|container|document|scope)\b/i.test(sel)) type = 'group';
      else if (/^@(-\w+-)?keyframes\b/i.test(sel)) type = 'kf';
      else if (/^@(font-face|page|property|counter-style|font-feature-values)\b/i.test(sel)) type = 'face';
      else if (sel.startsWith('@')) type = 'other';
      else if (parent == 'kf') type = 'rule';
      else if (!sel) add(ln, 'CSS', 'A "{" has no selector in front of it.');
      if (type == 'rule' && parent != 'kf' && parent != 'rule' && sel && typeof document !== 'undefined' && !/::?-|&|@/.test(sel)) {
        try { document.createDocumentFragment().querySelector(sel); } catch (e) { if (e && e.name === 'SyntaxError') add(ln, 'CSS', `The selector "${sel.replace(/\s+/g, ' ').slice(0, 60)}" is not valid.`, { tech: e.message }); }
      }
      types.push(type); buf = ''; bufLine = 0; i++; continue;
    }
    if (c == ';') { checkDecl(buf, bufLine || line); buf = ''; bufLine = 0; i++; continue; }
    if (c == '}') {
      if (!types.length) add(line, 'CSS', 'Extra "}" with no matching "{".');
      else { if (buf.trim()) checkDecl(buf, bufLine || line); types.pop(); }
      buf = ''; bufLine = 0; i++; continue;
    }
    if (!bufLine && !/\s/.test(c)) bufLine = line;
    buf += c; i++;
  }
  if (types.length) {
    const unclosed = brackets(code, 'css').filter(b => b.close);
    if (unclosed.length) unclosed.forEach(b => er.push({ ...b, kind: 'CSS', line: b.line + lineOffset, text: lineText(source, b.line) }));
    else add(line, 'CSS', 'A "{" is never closed. Add "}".', { close: '}' });
  } else if (buf.trim()) add(bufLine || line, 'CSS', `"${buf.trim().slice(0, 40)}" at the end is not complete (missing { } or ;).`);
  return er;
}

/* ---------------- Python ---------------- */
export function pyBasic(code) {
  const er = brackets(code, 'python').map(e => ({ ...e, kind: 'Python', text: lineText(code, e.line) }));
  code.split('\n').forEach((l, i) => {
    const s = l.replace(/#.*/, '').trimEnd();
    if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(s) && !/:$/.test(s) && !/[(\[{,\\]$/.test(s))
      er.push({ line: i + 1, kind: 'Python', msg: 'Missing ":" at the end of the line. def, if, for, while, class and similar statements need it.', fixLine: 1, text: l.trimEnd() });
  });
  return er;
}
const PY_HELP = [
  [/expected ':'/, 'A ":" is missing at the end of this line (def, if, for, while, class, else, try need it).'],
  [/was never closed/, 'A bracket or parenthesis was opened and never closed.'],
  [/unterminated string literal/, 'A string was opened with a quote but never closed on the same line.'],
  [/unterminated triple-quoted/, 'A """ string was opened and never closed.'],
  [/unexpected indent/, 'This line is indented more than the lines around it. Remove the extra spaces.'],
  [/expected an indented block/, 'After a line ending with ":" the next line must be indented (usually 4 spaces).'],
  [/unindent does not match|inconsistent use of tabs/, 'The indentation does not line up with any earlier block. Use the same number of spaces everywhere (do not mix tabs and spaces).'],
  [/unmatched '.'/, 'There is a closing bracket with no opening bracket.'],
  [/Missing parentheses in call to 'print'/, 'In Python 3 print needs parentheses: print("text").'],
  [/invalid syntax\. Perhaps you forgot a comma/, 'A comma is probably missing between two items.'],
  [/cannot assign to|invalid syntax\. Maybe you meant '==' or ':=' instead of '='/, 'You used "=" where a comparison "==" was meant, or assigned to something that cannot hold a value.'],
  [/'return' outside function/, '"return" can only be used inside a def.'],
  [/invalid decimal literal|invalid character/, 'A name starts with a number, or there is a character Python does not accept (often a curly quote).'],
  [/invalid syntax/, 'Python could not understand this line. Look for a missing operator, comma, colon or bracket here (or on the line just above).']
];
const PY_SNIPPET = `
import json
def __cl_check(src):
    try:
        compile(src, '<code>', 'exec')
        return json.dumps(None)
    except SyntaxError as e:
        return json.dumps({"line": e.lineno or 0, "col": e.offset or 0, "msg": e.msg or str(e), "text": (e.text or '').rstrip('\\n'), "type": type(e).__name__})
`;
let pyPromise = null;
export function loadPython(onStatus) {
  if (!pyPromise) {
    pyPromise = (async () => {
      onStatus && onStatus('Loading the real Python checker (first time only, about 10 MB)...');
      const base = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
      const mod = await import(base + 'pyodide.mjs');
      const py = await mod.loadPyodide({ indexURL: base });
      py.runPython(PY_SNIPPET);
      return py;
    })().catch(e => { pyPromise = null; throw e; });
  }
  return pyPromise;
}
export async function pyReal(code, onStatus) {
  const py = await loadPython(onStatus);
  const fn = py.globals.get('__cl_check');
  const r = JSON.parse(fn(code));
  fn.destroy && fn.destroy();
  if (!r) return [];
  const help = (PY_HELP.find(x => x[0].test(r.msg)) || [0, 'Python reported a syntax problem at this line.'])[1];
  const er = [{ line: r.line, col: r.col, kind: r.type, msg: help, tech: `${r.type}: ${r.msg}`, text: r.text || lineText(code, r.line) }];
  if (/expected ':'/.test(r.msg)) er[0].fixLine = 1;
  return er;
}

/* ---------------- main entry ---------------- */
export async function analyzeCode(code, lang, onStatus) {
  const out = { errors: [], notes: [] };
  if (lang == 'html') out.errors = htmlCheck(code);
  else if (lang == 'css') out.errors = cssCheck(code);
  else if (lang == 'python') {
    try { out.errors = await pyReal(code, onStatus); out.notes.push('Checked with the real Python compiler (Pyodide).'); }
    catch (e) { out.errors = pyBasic(code); out.notes.push('The real Python checker could not be loaded (' + (e && e.message ? e.message : e) + '). Only basic checks were done, so some errors may be missed. Check the internet connection.'); }
  } else {
    out.errors = jsSyntax(code);
    if (out.errors.length) out.notes.push('JavaScript stops at the first syntax error it meets. Fix it, then press Analyze again to find the next one.');
  }
  out.errors.sort((a, b) => (a.line || 0) - (b.line || 0));
  return out;
}
