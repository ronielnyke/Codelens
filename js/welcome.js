// Welcome / thank-you email through EmailJS (REST API, no extra library needed).
// Sent once per account, to the real email of the user who just logged in.
import { EMAILJS, SITE_DOMAIN } from '../config.js';

const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const CLAIM_MS = 60 * 1000;      // another tab/page is already sending: wait
const RETRY_MS = 20 * 1000;      // after a failure do not retry more often than this

export const emailjsMissing = () =>
  ['publicKey', 'serviceId', 'templateId'].filter(k => !EMAILJS[k] || /^YOUR_/i.test(EMAILJS[k]));

// Turns whatever EmailJS / the network returned into the real, readable reason.
function explain(status, body) {
  const t = String(body || '').trim();
  const hints = [
    [/public key is invalid|user_id.*invalid|The user_id parameter/i, 'The EmailJS Public Key in config.js is wrong. Copy it again from EmailJS > Account > General.'],
    [/service id not found|service_id.*not found|The service ID/i, 'The EmailJS Service ID in config.js is wrong or that service was deleted.'],
    [/template id not found|template_id.*not found|The template ID/i, 'The EmailJS Template ID in config.js is wrong or that template was deleted.'],
    [/recipients address is empty|recipient.*empty/i, 'The template "To Email" field is empty. In EmailJS > Email Templates > Settings tab set To Email to {{to_email}}.'],
    [/Invalid grant|reconnect|Gmail_API|authentication/i, 'The Gmail connection expired. In EmailJS > Email Services click your Gmail service and Reconnect it.'],
    [/insufficient authentication scopes/i, 'When connecting Gmail in EmailJS you must tick the permission "Send email on your behalf". Reconnect the service and tick it.'],
    [/limit|quota|exceeded/i, 'The EmailJS monthly/daily email limit was reached. Check your EmailJS plan usage.'],
    [/non-browser|API calls are disabled/i, 'EmailJS is blocking this call. Check EmailJS > Account > Security settings.'],
    [/origin|domain.*not allowed|forbidden/i, 'EmailJS rejected this website domain. Check EmailJS > Account > Security and allow ' + SITE_DOMAIN + '.']
  ];
  const h = hints.find(x => x[0].test(t));
  return `EmailJS error ${status}: ${t || '(no message)'}${h ? ' — ' + h[1] : ''}`;
}

export async function sendEmailJS(params) {
  const missing = emailjsMissing();
  if (missing.length) {
    throw new Error('EmailJS is not set up yet. Missing in config.js: ' + missing.join(', ') + '. Follow SETUP-EMAILJS.md.');
  }
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id: EMAILJS.publicKey,
        template_params: params
      }),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? 'EmailJS did not answer within 20 seconds. Check the internet connection.'
      : 'Could not reach EmailJS (' + e.message + '). Check the internet connection and turn off ad-blockers / VPN / private DNS that block api.emailjs.com.');
  } finally { clearTimeout(timer); }
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(explain(res.status, text));
  return text || 'OK';
}

const inflight = new Map();

/**
 * Sends the welcome email once for this user. Safe to call many times / from many pages:
 * a Firestore flag (users/{uid}.welcomeSent) makes sure it is sent only once, on any device.
 * Resolves to { ok, skipped?, error?, email }. Never throws.
 */
export function ensureWelcome(u, db, fire) {
  if (!u) return Promise.resolve({ ok: false, skipped: true, error: 'Not signed in.' });
  if (!inflight.has(u.uid)) inflight.set(u.uid, run(u, db, fire));
  return inflight.get(u.uid);
}

async function run(u, db, fire) {
  const email = (u.email || '').trim();
  if (!email) return { ok: false, skipped: true, error: 'This account has no email address, so no welcome email can be sent.' };
  const miss = emailjsMissing();
  if (miss.length) {
    return { ok: false, email, error: 'EmailJS is not set up yet. Missing in config.js: ' + miss.join(', ') + '. Follow SETUP-EMAILJS.md.' };
  }
  const ref = fire.doc(db, 'users', u.uid);
  try {
    // 1) Claim the job so two tabs / two pages never send two emails.
    const claimed = await fire.runTransaction(db, async tx => {
      const s = await tx.get(ref);
      const d = s.exists() ? s.data() : {};
      if (d.welcomeSent) return 'done';
      const now = Date.now();
      if (d.welcomeClaimAt?.toMillis && now - d.welcomeClaimAt.toMillis() < CLAIM_MS) return 'busy';
      if (d.welcomeErrorAt?.toMillis && now - d.welcomeErrorAt.toMillis() < RETRY_MS) return 'cooldown';
      tx.set(ref, { welcomeClaimAt: fire.Timestamp.now() }, { merge: true });
      return 'claimed';
    });
    if (claimed === 'done') return { ok: true, skipped: true, email };
    if (claimed !== 'claimed') return { ok: true, skipped: true, email };

    // 2) Send to the real address of this account (taken from the signed-in user, not from a form).
    const name = (u.displayName || email.split('@')[0]).trim();
    try {
      await sendEmailJS({
        to_email: email,
        to_name: name,
        reply_to: email,
        app_name: 'CodeLens AI Pro',
        site_url: 'https://' + SITE_DOMAIN,
        message: 'Thank you for joining CodeLens AI Pro!'
      });
    } catch (e) {
      await fire.setDoc(ref, {
        welcomeClaimAt: fire.deleteField(),
        welcomeError: String(e.message).slice(0, 400),
        welcomeErrorAt: fire.serverTimestamp()
      }, { merge: true }).catch(() => {});
      return { ok: false, email, error: e.message };
    }

    // 3) Remember it forever (Firestore = same on every phone / laptop).
    await fire.setDoc(ref, {
      welcomeSent: true,
      welcomeSentAt: fire.serverTimestamp(),
      welcomeClaimAt: fire.deleteField(),
      welcomeError: fire.deleteField(),
      welcomeErrorAt: fire.deleteField()
    }, { merge: true }).catch(e => console.error('Could not save welcomeSent flag:', e));
    return { ok: true, email, sent: true };
  } catch (e) {
    const code = e && e.code ? ' [' + e.code + ']' : '';
    return { ok: false, email, error: 'Could not check/save the welcome-email status in Firestore: ' + (e.message || e) + code +
      (e.code === 'permission-denied' ? ' — publish firestore.rules in Firebase Console > Firestore Database > Rules.' : '') };
  }
}
