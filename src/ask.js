import { localizePage, t } from "./i18n.js";

localizePage();

const params = new URLSearchParams(location.search);
const interceptId = params.get("id") || "";
const url = params.get("url") || "";
const filename = params.get("filename") || "";

const status = document.getElementById("status");
document.getElementById("fileInfo").textContent = filename
  ? `${filename}\n${url}`
  : url;

let answered = false;

function setButtonsDisabled(disabled) {
  for (const button of document.querySelectorAll("button")) {
    button.disabled = disabled;
  }
}

// Messaggio di sessione scaduta con link che apre l'interfaccia web
// di pyLoad in una nuova scheda per il re-login manuale.
function setSessionExpired(loginUrl) {
  status.className = "error";
  status.textContent = t("sessionExpiredPrefix");
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = t("sessionExpiredLink");
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: loginUrl });
  });
  status.appendChild(link);
  status.append(t("sessionExpiredSuffix"));
}

async function choose(choice) {
  if (answered) return;
  answered = true;
  setButtonsDisabled(true);
  if (choice === "pyload") {
    status.textContent = t("statusSending");
    status.className = "";
  }
  const result = await chrome.runtime.sendMessage({
    action: "intercept-choice",
    interceptId,
    choice
  });
  if (result && result.ok === false) {
    if (result.code === "session_expired" && result.loginUrl) {
      setSessionExpired(result.loginUrl);
    } else {
      status.textContent = result.error || t("statusFailed");
      status.className = "error";
    }
    answered = false;
    setButtonsDisabled(false);
    return;
  }
  window.close();
}

document.getElementById("pyload").addEventListener("click", () => choose("pyload"));
document.getElementById("chrome").addEventListener("click", () => choose("chrome"));
document.getElementById("abort").addEventListener("click", () => choose("abort"));

// Il download è già stato annullato alla creazione: se l'utente chiude la
// finestra senza scegliere, non parte nulla. Si notifica solo l'annullo
// per rimuovere lo stato pendente.
window.addEventListener("beforeunload", () => {
  if (!answered) {
    chrome.runtime.sendMessage({
      action: "intercept-choice",
      interceptId,
      choice: "abort"
    });
  }
});
