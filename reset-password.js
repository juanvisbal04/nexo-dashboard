import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = "https://ixewnbjndguchunwcuhf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";
const $ = (id) => document.getElementById(id);

const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.slice(1));
const isRecoveryLink = fragment.get("type") === "recovery" || query.has("code") || query.has("token_hash");
const auth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true },
});

let recoveryReady = false;
const message = (value, kind = "error") => {
  const node = $("recoveryMessage");
  node.textContent = value;
  node.className = "message " + kind;
  node.setAttribute("role", kind === "error" ? "alert" : "status");
};
const enableRecovery = () => {
  if (!isRecoveryLink) return;
  recoveryReady = true;
  $("recoveryHint").textContent = "Escribe tu nueva contraseña. Debe incluir al menos 10 caracteres, una mayúscula, una minúscula y un número.";
  $("recoveryForm").classList.remove("hidden");
  // Remove single-use tokens from the address bar after Supabase consumed the callback.
  window.history.replaceState({}, document.title, window.location.pathname);
};
const rejectRecovery = (text) => {
  $("recoveryForm").classList.add("hidden");
  $("recoveryHint").textContent = "";
  message(text);
};

if (!isRecoveryLink || fragment.get("error") || query.get("error")) {
  rejectRecovery("Este enlace no es válido o ya expiró. Regresa al inicio de sesión y solicita uno nuevo.");
} else {
  const { data: subscription } = auth.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) enableRecovery();
  });

  // Automatic URL session detection can complete before a UI listener fires.
  const { data, error } = await auth.auth.getSession();
  if (!error && data?.session && isRecoveryLink) {
    enableRecovery();
  } else if (!recoveryReady) {
    rejectRecovery("No pudimos validar el enlace. Solicita uno nuevo desde la pantalla de inicio de sesión.");
  }

  window.addEventListener("pagehide", () => subscription?.subscription?.unsubscribe(), { once: true });
}

$("recoveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!recoveryReady) return;
  const password = $("newPassword").value;
  const confirm = $("confirmPassword").value;

  if (password !== confirm) return message("Las contraseñas no coinciden.");
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return message("Usa mínimo 10 caracteres e incluye mayúscula, minúscula y número.");
  }

  const button = $("recoverySubmit");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const { error } = await auth.auth.updateUser({ password });
    if (error) throw error;
    recoveryReady = false;
    $("recoveryForm").classList.add("hidden");
    $("recoveryHint").textContent = "";
    $("recoveryTitle").textContent = "¡Contraseña actualizada!";
    // Force a fresh login after successful reset.
    await auth.auth.signOut();
    message("Tu contraseña se cambió correctamente. Ya puedes volver a NEXO e ingresar con tu nueva clave.", "ok");
  } catch (_) {
    message("No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.");
  } finally {
    button.disabled = false;
    button.textContent = "Guardar nueva contraseña";
  }
});
