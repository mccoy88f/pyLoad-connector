import { getSettings, saveSettings } from "./api.js";

const fields = ["protocol", "host", "port", "dest", "packageName"];
const status = document.getElementById("status");

function setStatus(text, ok) {
  status.textContent = text;
  status.className = ok ? "ok" : "error";
}

// Messaggio di sessione scaduta con link cliccabile per il re-login.
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

async function load() {
  const settings = await getSettings();
  for (const field of fields) {
    document.getElementById(field).value = settings[field] || "";
  }
  document.getElementById("interceptDownloads").checked =
    Boolean(settings.interceptDownloads);
}

async function collectAndSave() {
  const settings = {};
  for (const field of fields) {
    settings[field] = document.getElementById(field).value.trim();
  }
  settings.interceptDownloads =
    document.getElementById("interceptDownloads").checked;
  await saveSettings(settings);
  return settings;
}

document.getElementById("save").addEventListener("click", async () => {
  await collectAndSave();
  setStatus("Impostazioni salvate.", true);
});

document.getElementById("test").addEventListener("click", async () => {
  await collectAndSave();
  setStatus("Connessione in corso…", true);
  const result = await chrome.runtime.sendMessage({ action: "test-connection" });
  if (result.ok) {
    setStatus("Connesso! Sessione pyLoad attiva.", true);
  } else if (result.code === "session_expired" && result.loginUrl) {
    setSessionExpired(result.loginUrl);
  } else {
    setStatus(result.error, false);
  }
});

load();
