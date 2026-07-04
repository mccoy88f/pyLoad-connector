const params = new URLSearchParams(location.search);
const downloadId = Number(params.get("id"));
const url = params.get("url") || "";
const filename = params.get("filename") || "";

const status = document.getElementById("status");
const shortName = filename.split(/[\\/]/).pop();
document.getElementById("fileInfo").textContent = shortName
  ? `${shortName}\n${url}`
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
  status.textContent = "Sessione pyLoad assente o scaduta. ";
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = "Accedi all'interfaccia web";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: loginUrl });
  });
  status.appendChild(link);
  status.append(" poi riprova.");
}

async function choose(choice) {
  if (answered) return;
  answered = true;
  setButtonsDisabled(true);
  if (choice === "pyload") {
    status.textContent = "Invio a pyLoad…";
    status.className = "";
  }
  const result = await chrome.runtime.sendMessage({
    action: "intercept-choice",
    downloadId,
    url,
    choice
  });
  if (result && result.ok === false) {
    if (result.code === "session_expired" && result.loginUrl) {
      setSessionExpired(result.loginUrl);
    } else {
      status.textContent = result.error || "Operazione non riuscita";
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

// Se l'utente chiude la finestra senza scegliere, il download resta in pausa:
// meglio riprenderlo con Chrome per non lasciarlo bloccato.
window.addEventListener("beforeunload", () => {
  if (!answered) {
    chrome.runtime.sendMessage({
      action: "intercept-choice",
      downloadId,
      url,
      choice: "chrome"
    });
  }
});
