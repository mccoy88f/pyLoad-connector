import {
  addToPyload,
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
    await addToPyload(name, links, settings);
    const label = links.length === 1 ? "1 link inviato" : `${links.length} link inviati`;
    notify("Aggiunto a pyLoad", `${label} nel pacchetto "${name}".`);
    return { ok: true };
  } catch (err) {
    if (err.code === "session_expired") {
      notify(
        "Sessione pyLoad scaduta",
        "Clicca qui per accedere all'interfaccia web di pyLoad, poi riprova.",
        err.loginUrl
      );
    } else {
      notify("Errore pyLoad", err.message);
    }
    return {
      ok: false,
      error: err.message,
      code: err.code || null,
      loginUrl: err.loginUrl || null
    };
  }
}

// Notifiche: se viene passato un URL, il click sulla notifica lo apre
// in una nuova scheda (usato per il re-login manuale su pyLoad).
const notificationLinks = new Map();

function notify(title, message, url) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message
    },
    (id) => {
      if (url) notificationLinks.set(id, url);
    }
  );
}

chrome.notifications.onClicked.addListener((id) => {
  const url = notificationLinks.get(id);
  if (url) {
    chrome.tabs.create({ url });
    notificationLinks.delete(id);
    chrome.notifications.clear(id);
  }
});

chrome.notifications.onClosed.addListener((id) => notificationLinks.delete(id));

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
    // Invia prima il link a pyLoad; il download di Chrome viene annullato
    // solo se l'invio riesce, così in caso di errore (es. sessione scaduta)
    // resta in pausa e l'utente può ancora continuare con Chrome.
    const result = await sendToPyload([url]);
    if (result.ok) {
      try {
        await chrome.downloads.cancel(downloadId);
        await chrome.downloads.erase({ id: downloadId });
      } catch (err) {
        // Il download potrebbe essere già stato annullato: ignora.
      }
    } else {
      pendingDownloads.add(downloadId);
    }
    return result;
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
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err.message,
          code: err.code || null,
          loginUrl: err.loginUrl || null
        })
      );
    return true;
  }
  return false;
});
