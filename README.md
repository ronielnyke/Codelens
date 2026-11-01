# CodeLens

## Deploy to Vercel
1. Upload/push the contents of this `codelens` folder to your GitHub repository.
2. Import the repository into Vercel. Set the **Root Directory** to `codelens` only if the repository has the folder `codelens` at its top level; otherwise leave it as `./`.
3. In Vercel, open **Project Settings → Environment Variables**.
4. Add `GEMINI_API_KEY` and paste your new Gemini API key as its value. Select **Production** (and Preview too if you want preview deployments to use Gemini).
5. Save, then redeploy the project.
6. Test the CodeLens AI explanation and Gemini voice. If you see a missing-key message, confirm the variable name is exactly `GEMINI_API_KEY` and redeploy.

The Gemini key is read only by `api/gemini.js` on Vercel's server. Do not put it in `config.js` or any browser JavaScript file. If a key was previously shared publicly, revoke it and create a replacement in Google AI Studio.

## Welcome email on login (EmailJS)
Every account gets one welcome / thank-you email in its real inbox right after the first login (Google or email/password). Setup takes 5 minutes: read `SETUP-EMAILJS.md`, then open `/check.html` and press **Send a test email**.

## Local development
The `/api/gemini` endpoint requires Vercel's server runtime; opening the HTML file directly will not run the backend API. For local testing, use the Vercel CLI (`vercel dev`) after installing the Vercel CLI.

## Domain: codelens-ai-pro.vercel.app (do these once)
1. Vercel > Project > Settings > Domains: make sure `codelens-ai-pro.vercel.app` is added (or rename the project to `codelens-ai-pro`).
2. Firebase Console > Authentication > Settings > Authorized domains > Add `codelens-ai-pro.vercel.app`.
3. Google Cloud Console (project code-4630c) > APIs & Services > Credentials > the "Web client (auto created by Google Service)" OAuth client:
   - Authorized JavaScript origins: add `https://codelens-ai-pro.vercel.app`
   - Authorized redirect URIs: add `https://codelens-ai-pro.vercel.app/__/auth/handler`
4. Redeploy, then open https://codelens-ai-pro.vercel.app/check.html. Every line must say PASS. The Google account screen shows codelens-ai-pro.vercel.app only when you open the site from that domain.
Important: `index.html`, `vercel.json` and the `api` folder must be at the TOP LEVEL of your GitHub repository (not inside another folder).

## Firebase setup (project code-4630c)
1. Authentication > Sign-in method: enable Google and Email/Password.
2. Authentication > Settings > Authorized domains: add localhost and your hosting domain.
3. Firestore Database: create a database, then paste `firestore.rules` into the Rules tab and Publish.

## How payment works (GCash reference)
The seller sets their GCash number. The buyer sends the money, then pastes the GCash reference number. The seller checks the payment in their own GCash app and clicks Approve in My Orders. Only then the code unlocks and a license key is issued. A reference can only be used once.

The system cannot check GCash by itself (GCash has no public API for this). For automatic verification use PayMongo or a similar gateway.

## Owner-only selling
The owner email is `ronielnyke@gmail.com` (Roniel Nyke Gonzales). Sign in with Google using that email, then open Owner Panel from the navbar to upload products, images and files and to approve GCash payments. Everyone else can only browse, view display images or the live demo, and buy.

## Troubleshooting (read this if something does not work)
- **Google sign-in shows "unauthorized domain"**: Firebase Console > Authentication > Settings > Authorized domains > add your Vercel domain (for example `your-app.vercel.app`) and your custom domain if you have one.
- **Google sign-in does nothing**: allow pop-ups for the site (the app falls back to a redirect automatically if the pop-up is blocked). Also make sure Google is enabled under Authentication > Sign-in method.
- **Publish says "Permission denied"**: open Firestore Database > Rules, paste the whole `firestore.rules` file and click Publish. Then log in with Google using `ronielnyke@gmail.com` (only that verified account can publish).
- **Products must show on every device**: they are stored in Firestore, not in the browser, so any phone or laptop that opens the same link sees them.
- **Welcome email not arriving**: open `/check.html`. It shows the real EmailJS error (wrong key, Gmail needs reconnect, blocked by ad-blocker, limit reached). Also look in Spam.
- **Gemini explanation/voice fails**: add `GEMINI_API_KEY` in Vercel Environment Variables and redeploy.
