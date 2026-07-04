import { getSettings, saveSettings } from "./api.js";

const fields = ["protocol", "host", "port", "username", "password", "packageName"];
const status = document.getElementById("status");

function setStatus(text, ok) {
  status.textContent = text;
  status.className = ok ? "ok" : "error";
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
    setStatus(`Connesso! Versione server pyLoad: ${result.version}`, true);
  } else {
    setStatus(result.error, false);
  }
});

load();
