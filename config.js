// Firebase web config (project: code-4630c)
// authDomain is your Vercel domain. vercel.json proxies /__/auth/* to Firebase, so Google
// sign-in shows "codelens-ai-pro.vercel.app" instead of code-4630c.firebaseapp.com.
// Your public domain. On this domain Google sign-in shows it instead of code-4630c.firebaseapp.com.
// On localhost or any other URL the original Firebase domain is used, so sign-in never breaks.
export const SITE_DOMAIN = "codelens-ai-pro.vercel.app";
export const firebaseConfig = {
  apiKey: "AIzaSyAjxurmFiqcgW9-lDgiXYpW2ANk6Uplbuw",
  authDomain: location.hostname === SITE_DOMAIN ? SITE_DOMAIN : "code-4630c.firebaseapp.com",
  projectId: "code-4630c",
  storageBucket: "code-4630c.firebasestorage.app",
  messagingSenderId: "314376209784",
  appId: "1:314376209784:web:c01b3613811dfb60b3f48d",
  measurementId: "G-VBJ781T4MK"
};
// The only account allowed to upload, edit and sell products.
// Must match the email inside firestore.rules.
export const OWNER = { email: "ronielnyke@gmail.com", name: "Roniel Nyke Gonzales" };
// EmailJS: sends the welcome / thank-you email to the REAL inbox of whoever logs in.
// Fill these 3 values from https://dashboard.emailjs.com (see SETUP-EMAILJS.md). Public Key is safe in the browser.
export const EMAILJS = {
  publicKey: "S3_XQI5mfn8MMdGhM",   // Account > General > Public Key
  serviceId: "service_djne9ym",   // Email Services > your Gmail service > Service ID
  templateId: "template_q5v9o8w"  // Email Templates > your template > Template ID
};
// Gemini voice + explanations. The secret key stays in Vercel Environment Variables.
export const GEMINI = {
  ttsModel: "gemini-3.8-flash-tts",
  textModel: "gemini-3.8-flash",
  voice: "Kore"
};
