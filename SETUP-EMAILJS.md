# EmailJS setup (5 minutes, do this once)

Welcome emails are sent by `js/welcome.js` when someone logs in. It needs 3 values in `config.js`.

## 1. Connect the sender email
1. Sign up at https://dashboard.emailjs.com (free).
2. **Email Services > Add New Service > Gmail** (or any other). Connect the Gmail you want the emails to come FROM.
   - Gmail: tick the permission **"Send email on your behalf"** when Google asks.
3. Copy the **Service ID** (looks like `service_xxxxxxx`).

## 2. Create the template
1. **Email Templates > Create New Template**.
2. **Settings** tab of the template:
   - **To Email:** `{{to_email}}`   <- this is what sends it to the user's real inbox
   - **Subject:** `Welcome to {{app_name}}, {{to_name}}!`
   - **From Name:** `CodeLens AI Pro`
   - **Reply To:** `{{reply_to}}`
3. **Content** tab: click the `</>` (code editor) button and paste everything from `emailjs-template.html`.
4. Save. Copy the **Template ID** (looks like `template_xxxxxxx`).

## 3. Public key
**Account > General > Public Key**. Copy it. (It is meant to be public; it is safe in the browser.)

## 4. Put the 3 values in `config.js`
```js
export const EMAILJS = {
  publicKey: "your public key",
  serviceId: "service_xxxxxxx",
  templateId: "template_xxxxxxx"
};
```
Upload to GitHub, Vercel redeploys.

## 5. Test
1. Open `https://codelens-ai-pro.vercel.app/check.html`. The "EmailJS settings" line must say PASS.
2. Press **Send a test email** on that page. It shows the real EmailJS answer or the real error.
3. Log in with a new account: you see "Welcome email sent to ..." and the email arrives (look in Spam the first time).

## How it behaves
- The email is sent **once per account** (a flag `welcomeSent` is saved in Firestore, so it is the same on every phone/laptop).
- It goes to the email of the account that logged in (Google or email/password), never to a typed-in address.
- Accounts that already existed get the welcome email the next time they log in (one time only).
- If sending fails, the REAL reason is shown on screen and saved in the user's `users/{uid}.welcomeError`, and it tries again on the next login.

## Limits you should know
- EmailJS free plan: about 200 emails per month and 1 request per second. If you grow, upgrade the plan.
- Anyone can create an email/password account with someone else's address, and that person would get one welcome email. Google sign-in does not have this problem. If you want to block it later, add Firebase email verification before sending.
