import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import * as authm from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import * as fire from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig, OWNER } from "../config.js";

import { ensureWelcome } from "./welcome.js";

import {
  $,
  $$,
  esc,
  toast,
  render
} from "./chrome.js";

export {
  authm,
  fire,
  $,
  $$,
  esc,
  toast,
  OWNER
};

// Firebase initialization
export const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = authm.getAuth(app);
export const db = fire.getFirestore(app);

// User information
export let user = null;
export let isOwner = false;
export let ownerExists = false;

export const ownerErr = false;
export const ownerReady = Promise.resolve();

// Authentication error messages
export const errMsg = (e) => {
  const messages = {
    "auth/popup-closed-by-user":
      "Sign-in window was closed.",

    "auth/invalid-credential":
      "Wrong email or password.",

    "auth/email-already-in-use":
      "That email is already registered.",

    "auth/weak-password":
      "Password must be at least 6 characters.",

    "auth/unauthorized-domain":
      "Add \"" + location.hostname + "\" in Firebase Console > Authentication > Settings > Authorized domains, then try again.",

    "auth/operation-not-allowed":
      "Enable this sign-in method in Firebase Console > Authentication.",

    "auth/popup-blocked":
      "Your browser blocked the Google window. Allow pop-ups for this site and try again.",

    "auth/cancelled-popup-request":
      "Sign-in was cancelled. Please try again.",

    "auth/network-request-failed":
      "Network problem. Check your internet connection and try again.",

    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",

    "auth/user-not-found":
      "No account with that email. Sign up first.",

    "auth/wrong-password":
      "Wrong email or password.",

    "auth/invalid-email":
      "That email address is not valid.",

    "auth/user-disabled":
      "This account has been disabled.",

    "auth/account-exists-with-different-credential":
      "This email is already registered with another sign-in method.",

    "permission-denied":
      "Permission denied. Make sure firestore.rules is published in Firebase and you are signed in with the correct account."
  };

  if (e.code === "auth/configuration-not-found" || e.code === "auth/operation-not-allowed")
    return "Google sign-in is not enabled. Firebase Console > Authentication > Sign-in method > Google > Enable > Save.";
  return messages[e.code] || e.message || "An unexpected error occurred.";
};

// Check owner account
const isOwnerUser = (u) => {
  return (
    !!u &&
    !!u.email &&
    !!OWNER?.email &&
    u.email.toLowerCase() === OWNER.email.toLowerCase() &&
    u.emailVerified === true
  );
};

// Save user profile
async function saveProfile(u) {
  if (!u) return;

  try {
    await fire.setDoc(
      fire.doc(db, "users", u.uid),
      {
        name:
          u.displayName ||
          (u.email ? u.email.split("@")[0] : "User"),
        email: u.email || "",
        photo: u.photoURL || "",
        last: fire.serverTimestamp()
      },
      { merge: true }
    );
  } catch (e) {
    console.error("Profile save failed:", e);
  }
}

// Welcome email (EmailJS). Sent once per account, to the real email of the logged-in user.
// The register form holds it for a moment so the typed name is already saved when the email goes out.
export const welcomeGate = { hold: false };
let welcomeToasted = false;
export const welcomeFor = (u) =>
  ensureWelcome(u, db, fire).then((r) => {
    if (!welcomeToasted && r) {
      if (r.sent) { welcomeToasted = true; toast("Welcome email sent to " + r.email + ". Check your inbox (and Spam)."); }
      else if (!r.ok && !r.skipped) { welcomeToasted = true; console.error("Welcome email failed:", r.error); toast("Welcome email NOT sent: " + r.error); }
      else if (!r.ok) { console.warn("Welcome email skipped:", r.error); }
    }
    return r;
  });

// Authentication state
export const ready = new Promise((resolve) => {
  let firstCheck = true;

  authm.onAuthStateChanged(
    auth,
    async (u) => {
      user = u;
      isOwner = isOwnerUser(u);

      try {
        render(user, isOwner);
      } catch (e) {
        console.error("Render failed:", e);
      }

      if (firstCheck) {
        firstCheck = false;
        resolve(u);
      }

      if (u) {
        saveProfile(u).then(() => { if (!welcomeGate.hold) welcomeFor(u); });
      }
    },
    (error) => {
      console.error("Authentication error:", error);

      if (firstCheck) {
        firstCheck = false;
        resolve(null);
      }
    }
  );
});

// Logout
document.addEventListener("cl-logout", async () => {
  try {
    await authm.signOut(auth);
    location.href = "index.html";
  } catch (e) {
    console.error("Logout failed:", e);
    toast("Unable to log out. Please try again.");
  }
});

// Require login
export const needLogin = () => {
  if (user) return true;

  toast("Please log in first");

  setTimeout(() => {
    const page =
      location.pathname.split("/").pop() || "index.html";

    location.href =
      "login.html?next=" + encodeURIComponent(page);
  }, 700);

  return false;
};

// Halt pending operation
export const halt = () => new Promise(() => {});

// Download purchased product
export async function downloadOrder(o) {
  if (!o || !o.lid) {
    throw new Error("Invalid order or product ID.");
  }

  toast("Preparing your files...");

  let downloadUrl = null;

  try {
    const JSZip = (
      await import(
        "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"
      )
    ).default;

    const zip = new JSZip();

    const filesSnapshot = await fire.getDocs(
      fire.collection(db, "listings", o.lid, "files")
    );

    if (filesSnapshot.empty) {
      throw new Error("This product has no files yet.");
    }

    for (const f of filesSnapshot.docs) {
      const m = f.data();

      if (
        !m.name ||
        !Number.isInteger(m.chunks) ||
        m.chunks < 0
      ) {
        throw new Error("Invalid file information: " + f.id);
      }

      let base64Data = "";

      for (let i = 0; i < m.chunks; i++) {
        const chunkId = f.id + "_" + i;

        const chunkSnapshot = await fire.getDoc(
          fire.doc(
            db,
            "listings",
            o.lid,
            "chunks",
            chunkId
          )
        );

        if (!chunkSnapshot.exists()) {
          throw new Error(
            "Missing chunk " + chunkId
          );
        }

        const chunkData = chunkSnapshot.data();

        if (
          !chunkData ||
          typeof chunkData.d !== "string"
        ) {
          throw new Error(
            "Invalid chunk data: " + chunkId
          );
        }

        base64Data += chunkData.d;
      }

      zip.file(m.name, base64Data, {
        base64: true
      });
    }

    // License file
    const licenseText =
      "CodeLens License\n" +
      "Product: " + (o.title || "Unknown") + "\n" +
      "Licensed to: " + (o.bemail || "") + "\n" +
      "License key: " + (o.key || "") + "\n" +
      "Do not resell, redistribute or claim as your own.\n" +
      "Verify at verify.html\n";

    zip.file("LICENSE-KEY.txt", licenseText);

    const blob = await zip.generateAsync({
      type: "blob"
    });

    downloadUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = downloadUrl;
    a.download =
      (o.title || "CodeLens_Product").replace(/\W+/g, "_") +
      ".zip";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    }, 2000);

    toast("Download ready!");
  } catch (e) {
    console.error("Download failed:", e);

    toast(
      e.message || "Unable to download product files."
    );

    throw e;
  }
}
