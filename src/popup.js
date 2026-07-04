import { extractLinks, getSettings, saveSettings } from "./api.js";

const status = document.getElementById("status");
const interceptCheckbox = document.getElementById("interceptDownloads");

function setStatus(text, ok) {
  status.textContent = text;
  status.className = ok ? "ok" : "error";
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
  status.append(" e riprova.");
}

async function send(links) {
  if (links.length === 0) {
    setStatus("Nessun link valido da inviare.", false);
    return;
  }
  setStatus("Invio a pyLoad…", true);
  const result = await chrome.runtime.sendMessage({
    action: "send-links",
    links
  });
  if (result.ok) {
    const label = links.length === 1 ? "Link inviato" : `${links.length} link inviati`;
    setStatus(`${label} a pyLoad.`, true);
    document.getElementById("links").value = "";
  } else if (result.code === "session_expired" && result.loginUrl) {
    setSessionExpired(result.loginUrl);
  } else {
    setStatus(result.error, false);
  }
}

document.getElementById("sendTab").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  send(extractLinks(tab && tab.url ? tab.url : ""));
});

document.getElementById("sendLinks").addEventListener("click", () => {
  send(extractLinks(document.getElementById("links").value));
});

interceptCheckbox.addEventListener("change", async () => {
  await saveSettings({ interceptDownloads: interceptCheckbox.checked });
});

document.getElementById("openOptions").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

getSettings().then((settings) => {
  interceptCheckbox.checked = Boolean(settings.interceptDownloads);
});
