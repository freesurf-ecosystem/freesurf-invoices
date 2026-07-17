import { getSupabaseClient, isSupabaseConfigured } from "./supabase-client.js";
import { setSharedSession } from "./cnxt-auth.js";

const POST_AUTH_RETURN_KEY = "cnxt-invoices-post-auth-return";
const POST_AUTH_ACTION_KEY = "cnxt-invoices-post-auth-action";
const signInForm = document.querySelector("#sign-in-form");
const signUpForm = document.querySelector("#sign-up-form");
const signInTab = document.querySelector("#show-sign-in");
const signUpTab = document.querySelector("#show-sign-up");
const feedback = document.querySelector("#auth-feedback");

function setFeedback(message = "", mode = "idle") {
  feedback.textContent = message;
  feedback.dataset.mode = mode;
  feedback.classList.toggle("is-visible", Boolean(message));
}

function setActiveTab(mode) {
  const signInActive = mode === "sign-in";
  signInTab.classList.toggle("auth-tab-active", signInActive);
  signUpTab.classList.toggle("auth-tab-active", !signInActive);
  signInForm.classList.toggle("auth-form-hidden", !signInActive);
  signUpForm.classList.toggle("auth-form-hidden", signInActive);
}

function redirectAfterAuth() {
  const nextUrl = localStorage.getItem(POST_AUTH_RETURN_KEY);
  if (!nextUrl) {
    return false;
  }

  window.location.href = nextUrl;
  return true;
}

async function getClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    return await getSupabaseClient();
  } catch {
    setFeedback("Sign-in is temporarily unavailable. Please try again shortly.", "error");
    return null;
  }
}

async function refreshSessionStatus() {
  const client = await getClient();
  if (!client) {
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    setFeedback(error.message, "error");
    return;
  }

  const session = data.session;
  if (!session?.user) {
    setFeedback("", "idle");
    return;
  }

  setFeedback(`Signed in as ${session.user.email}.`, "success");
}

signInTab.addEventListener("click", () => setActiveTab("sign-in"));
signUpTab.addEventListener("click", () => setActiveTab("sign-up"));

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = await getClient();
  if (!client) {
    return;
  }

  const formData = new FormData(signInForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  setFeedback("Checking your credentials.", "idle");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    setFeedback(error.message, "error");
    return;
  }

  // Persist to shared .cnxt.to cookie for cross-domain auth
  await setSharedSession();

  signInForm.reset();
  if (!redirectAfterAuth()) {
    window.location.href = "./index.html";
  }
});

signUpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const client = await getClient();
  if (!client) {
    return;
  }

  const formData = new FormData(signUpForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 6) {
    setFeedback("Use at least 6 characters.", "warning");
    return;
  }

  if (password !== confirmPassword) {
    setFeedback("Enter the same password twice.", "warning");
    return;
  }

  setFeedback("Submitting your sign-up request.", "idle");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    setFeedback(error.message, "error");
    return;
  }

  signUpForm.reset();
  if (data.session?.user) {
    await setSharedSession();
    await refreshSessionStatus();
    redirectAfterAuth();
    return;
  }

  setFeedback("Check your email to finish creating your account.", "success");
});

(async function initialize() {
  setActiveTab("sign-in");

  // Synchronous check: if a Supabase session already exists in localStorage,
  // redirect immediately without waiting for the async client to load.
  // This prevents the loop where a signed-in user lands on auth.html and
  // gets bounced straight back to index.html after a visible flash.
  try {
    const raw = localStorage.getItem("sb-jstojewashwoswsskwjk-auth-token");
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token || parsed?.session?.access_token;
      if (token) {
        if (!redirectAfterAuth()) {
          window.location.href = "./index.html";
        }
        return;
      }
    }
  } catch {
    // ignore — fall through to normal auth flow
  }

  const client = await getClient();
  if (client) {
    // When Supabase parses an #access_token from the URL (e.g. email confirmation),
    // onAuthStateChange fires with SIGNED_IN. Redirect into the app immediately.
    client.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        setSharedSession();
        if (!redirectAfterAuth()) {
          window.location.href = "./index.html";
        }
      }
    });

    await refreshSessionStatus();
  }
})();
