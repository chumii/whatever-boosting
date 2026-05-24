export function installGate({ password, onUnlock } = {}) {
  const gate    = document.getElementById("gate");
  const content = document.getElementById("content");

  function unlock() {
    if (gate)    gate.style.display    = "none";
    // display:contents makes sidebar + main flow directly into the body CSS grid
    if (content) content.style.display = "contents";
    onUnlock?.();
  }

  if (sessionStorage.getItem("offi-auth") === "1") {
    unlock();
    return;
  }

  const input = document.getElementById("pw-input");
  const btn   = document.getElementById("pw-btn");
  const error = document.getElementById("pw-error");

  input?.focus();

  function attempt() {
    if (input.value === password) {
      sessionStorage.setItem("offi-auth", "1");
      unlock();
    } else {
      if (error) error.textContent = "Falsches Passwort.";
      input.value = "";
      input.focus();
    }
  }

  btn?.addEventListener("click", attempt);
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
}
