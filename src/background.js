import {
  addPackage,
  extractLinks,
  getSettings,
  packageNameFor,
  testConnection
} from "./api.js";

const MENU_ID = "pyload-send";

// ---------------------------------------------------------------------------
// Menù contestuale
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Scarica con pyLoad",
    contexts: ["link", "image", "video", "audio", "selection", "page"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;

  let links = [];
  if (info.linkUrl) {
    links = [info.linkUrl];
  } else if (info.srcUrl) {
    links = [info.srcUrl];
  } else if (info.selectionText) {
    links = extractLinks(info.selectionText);
  } else if (info.pageUrl) {
    links = [info.pageUrl];
  }

  if (links.length === 0) {
    notify("Nessun link trovato", "La selezione non contiene URL validi.");
    return;
  }
  sendToPyload(links);
});

// ---------------------------------------------------------------------------
// Invio a pyLoad
// ---------------------------------------------------------------------------

async function sendToPyload(links) {
  const settings = await getSettings();
  const name = packageNameFor(links[0], settings);
  try {
    await addPackage(name, links, settings);
    const label = links.length === 1 ? "1 link inviato" : `${links.length} link inviati`;
    notify("Aggiunto a pyLoad", `${label} nel pacchetto "${name}".`);
    return { ok: true };
  } catch (err) {
    notify("Errore pyLoad", err.message);
    return { ok: false, error: err.message };
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message
  });
}

// ---------------------------------------------------------------------------
// Intercettazione dei download di Chrome (opzionale)
// ---------------------------------------------------------------------------

// Download per cui è già stata aperta la finestra di scelta.
const pendingDownloads = new Set();

chrome.downloads.onCreated.addListener(async (item) => {
  const settings = await getSettings();
  if (!settings.interceptDownloads) return;
  if (item.state !== "in_progress") return;

  const url = item.finalUrl || item.url;
  // Solo download da rete: blob:, data:, file: ecc. non hanno senso su pyLoad.
  if (!/^(https?|ftps?):\/\//i.test(url)) return;
  if (pendingDownloads.has(item.id)) return;
  pendingDownloads.add(item.id);

  // Mette in pausa il download di Chrome mentre l'utente decide.
  try {
    await chrome.downloads.pause(item.id);
  } catch (err) {
    // Download già completato o non più in pausa: lascialo a Chrome.
    pendingDownloads.delete(item.id);
    return;
  }

  const params = new URLSearchParams({
    id: String(item.id),
    url,
    filename: item.filename || ""
  });
  chrome.windows.create({
    url: chrome.runtime.getURL(`src/ask.html?${params}`),
    type: "popup",
    width: 460,
    height: 320
  });
});

chrome.downloads.onErased.addListener((id) => pendingDownloads.delete(id));

async function resolveInterceptedDownload(downloadId, url, choice) {
  pendingDownloads.delete(downloadId);
  if (choice === "pyload") {
    // Annulla il download di Chrome, lo rimuove dalla cronologia
    // e invia il link a pyLoad.
    try {
      await chrome.downloads.cancel(downloadId);
      await chrome.downloads.erase({ id: downloadId });
    } catch (err) {
      // Il download potrebbe essere già stato annullato: ignora.
    }
    return sendToPyload([url]);
  }
  if (choice === "chrome") {
    try {
      await chrome.downloads.resume(downloadId);
    } catch (err) {
      return { ok: false, error: "Impossibile riprendere il download" };
    }
    return { ok: true };
  }
  // Scelta "annulla": elimina del tutto il download.
  try {
    await chrome.downloads.cancel(downloadId);
    await chrome.downloads.erase({ id: downloadId });
  } catch (err) {
    // ignora
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messaggi da popup, opzioni e finestra di intercettazione
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "send-links") {
    sendToPyload(message.links).then(sendResponse);
    return true;
  }
  if (message.action === "intercept-choice") {
    resolveInterceptedDownload(message.downloadId, message.url, message.choice)
      .then(sendResponse);
    return true;
  }
  if (message.action === "test-connection") {
    testConnection()
      .then((version) => sendResponse({ ok: true, version }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});
