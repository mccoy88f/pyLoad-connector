import {
  addToPyload,
  extractLinks,
  getSettings,
  packageNameFor,
  saveSettings,
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
// Click sull'icona = attiva/disattiva l'intercettazione dei download.
// Lo stato è mostrato dal badge "ON" e dal tooltip dell'icona.
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(async () => {
  const settings = await getSettings();
  await saveSettings({ interceptDownloads: !settings.interceptDownloads });
});

async function updateActionBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
  await chrome.action.setTitle({
    title: enabled
      ? "pyLoad Connector – intercettazione download ATTIVA (clicca per disattivare)"
      : "pyLoad Connector – intercettazione download disattivata (clicca per attivare)"
  });
}

// Tiene il badge allineato anche quando l'opzione cambia dalla pagina opzioni.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.interceptDownloads) {
    updateActionBadge(Boolean(changes.interceptDownloads.newValue));
  }
});

// Allinea il badge a ogni avvio del service worker.
getSettings().then((settings) =>
  updateActionBadge(Boolean(settings.interceptDownloads))
);

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
//
// Il download appena creato viene ANNULLATO subito, così non parte e non
// compare nella barra dei download finché l'utente non sceglie. La scelta
// avviene in un modale iniettato nella pagina attiva (o, dove non si può
// iniettare, in una piccola finestra centrata). Con "Continua con Chrome"
// il download viene riavviato da zero, saltando la re-intercettazione.
// Lo stato pendente vive in chrome.storage.session per sopravvivere ai
// riavvii del service worker.
// ---------------------------------------------------------------------------

const INTERCEPT_PREFIX = "intercept:";
const BYPASS_KEY = "bypassUrls";

async function getBypassUrls() {
  const stored = await chrome.storage.session.get({ [BYPASS_KEY]: [] });
  return stored[BYPASS_KEY];
}

async function setBypassUrls(urls) {
  await chrome.storage.session.set({ [BYPASS_KEY]: urls });
}

chrome.downloads.onCreated.addListener(async (item) => {
  const settings = await getSettings();
  if (!settings.interceptDownloads) return;

  const url = item.finalUrl || item.url;
  // Solo download da rete: blob:, data:, file: ecc. non hanno senso su pyLoad.
  if (!/^(https?|ftps?):\/\//i.test(url)) return;

  // I download riavviati da "Continua con Chrome" non vanno re-intercettati.
  const bypass = await getBypassUrls();
  const bypassIndex = bypass.indexOf(url);
  if (bypassIndex !== -1) {
    bypass.splice(bypassIndex, 1);
    await setBypassUrls(bypass);
    return;
  }

  // Ferma subito il download: niente deve partire finché l'utente non sceglie.
  try {
    await chrome.downloads.cancel(item.id);
  } catch (err) {
    // già terminato/annullato
  }
  try {
    await chrome.downloads.erase({ id: item.id });
  } catch (err) {
    // ignora
  }

  const interceptId = `${Date.now()}-${item.id}`;
  const info = {
    url,
    filename: (item.filename || "").split(/[\\/]/).pop() || ""
  };
  await chrome.storage.session.set({ [INTERCEPT_PREFIX + interceptId]: info });

  const shownInPage = await showModalInActiveTab(interceptId, info);
  if (!shownInPage) {
    await openAskWindow(interceptId, info);
  }
});

// Prova a mostrare il modale nella scheda attiva. Fallisce (→ false) su
// pagine dove non si può iniettare (chrome://, Web Store, nessuna scheda).
async function showModalInActiveTab(interceptId, info) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    if (!tab || tab.id === undefined || tab.id < 0) return false;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showInterceptModal,
      args: [interceptId, info.url, info.filename]
    });
    return true;
  } catch (err) {
    return false;
  }
}

// Finestra di ripiego, centrata rispetto alla finestra corrente.
async function openAskWindow(interceptId, info) {
  const width = 560;
  const height = 400;
  const options = {
    url: chrome.runtime.getURL(
      `src/ask.html?${new URLSearchParams({
        id: interceptId,
        url: info.url,
        filename: info.filename
      })}`
    ),
    type: "popup",
    width,
    height
  };
  try {
    const win = await chrome.windows.getLastFocused();
    options.left = Math.max(0, Math.round(win.left + (win.width - width) / 2));
    options.top = Math.max(0, Math.round(win.top + (win.height - height) / 2));
  } catch (err) {
    // senza coordinate Chrome centra da solo
  }
  await chrome.windows.create(options);
}

// Eseguita NELLA PAGINA via chrome.scripting.executeScript: deve essere
// autosufficiente (niente riferimenti a variabili del service worker).
// Usa Shadow DOM per non subire il CSS del sito.
function showInterceptModal(interceptId, url, filename) {
  const host = document.createElement("div");
  host.style.cssText =
    "all:initial; position:fixed; inset:0; z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const style = document.createElement("style");
  style.textContent = `
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.45);
    }
    .dialog {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      width: min(440px, calc(100vw - 48px));
      box-sizing: border-box;
      background: ${dark ? "#26292e" : "#fff"};
      color: ${dark ? "#e8eaed" : "#1f2328"};
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.35);
      padding: 20px;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    h2 { font-size: 16px; margin: 0 0 10px; }
    .file {
      background: ${dark ? "#1c1e22" : "#f2f4f6"};
      border: 1px solid ${dark ? "#44494f" : "#d5dadf"};
      border-radius: 8px;
      padding: 8px 10px;
      margin: 0 0 14px;
      font-size: 12px;
      word-break: break-all;
      max-height: 84px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
    button {
      display: block; width: 100%;
      margin-top: 8px; padding: 9px 14px;
      border-radius: 8px;
      border: 1px solid ${dark ? "#4a5058" : "#c9ced4"};
      background: ${dark ? "#2f3339" : "#f2f4f6"};
      color: inherit;
      font: inherit; font-weight: 600;
      cursor: pointer;
    }
    button.primary { background: #2d6ca2; border-color: #24567f; color: #fff; }
    button.primary:hover { background: #24567f; }
    button.danger { color: #d9604a; }
    button:disabled { opacity: .55; cursor: default; }
    .status { min-height: 1.4em; margin: 10px 0 0; font-weight: 600; }
    .status.ok { color: #4caf50; }
    .status.error { color: #d9604a; }
    .status a { color: #6aa8d8; cursor: pointer; text-decoration: underline; }
  `;

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const dialog = document.createElement("div");
  dialog.className = "dialog";

  const title = document.createElement("h2");
  title.textContent = "Download intercettato — come vuoi scaricare?";

  const file = document.createElement("div");
  file.className = "file";
  file.textContent = filename ? `${filename}\n${url}` : url;

  const statusLine = document.createElement("p");
  statusLine.className = "status";

  const buttons = {};
  for (const [key, label, cls] of [
    ["pyload", "Scarica con pyLoad", "primary"],
    ["chrome", "Continua con Chrome", ""],
    ["abort", "Annulla download", "danger"]
  ]) {
    const button = document.createElement("button");
    button.textContent = label;
    if (cls) button.className = cls;
    buttons[key] = button;
  }

  dialog.append(title, file, buttons.pyload, buttons.chrome, buttons.abort, statusLine);
  shadow.append(style, backdrop, dialog);
  document.documentElement.appendChild(host);

  const onKeydown = (event) => {
    if (event.key === "Escape") choose("abort");
  };
  document.addEventListener("keydown", onKeydown, true);

  const close = () => {
    document.removeEventListener("keydown", onKeydown, true);
    host.remove();
  };

  const setStatus = (text, cls) => {
    statusLine.textContent = text;
    statusLine.className = `status ${cls || ""}`;
  };

  const setDisabled = (disabled) => {
    for (const button of Object.values(buttons)) button.disabled = disabled;
  };

  let busy = false;
  function choose(choice) {
    if (busy) return;
    busy = true;
    setDisabled(true);
    if (choice === "pyload") setStatus("Invio a pyLoad…", "");
    chrome.runtime.sendMessage(
      { action: "intercept-choice", interceptId, choice },
      (result) => {
        if (result && result.ok === false) {
          busy = false;
          setDisabled(false);
          if (result.code === "session_expired" && result.loginUrl) {
            setStatus("Sessione pyLoad assente o scaduta. ", "error");
            const link = document.createElement("a");
            link.textContent = "Accedi all'interfaccia web";
            link.addEventListener("click", () =>
              window.open(result.loginUrl, "_blank")
            );
            statusLine.appendChild(link);
            statusLine.append(" poi riprova.");
          } else {
            setStatus(result.error || "Operazione non riuscita", "error");
          }
          return;
        }
        if (choice === "pyload") {
          setStatus("Inviato a pyLoad ✓", "ok");
          setTimeout(close, 1200);
        } else {
          close();
        }
      }
    );
  }

  buttons.pyload.addEventListener("click", () => choose("pyload"));
  buttons.chrome.addEventListener("click", () => choose("chrome"));
  buttons.abort.addEventListener("click", () => choose("abort"));
  backdrop.addEventListener("click", () => choose("abort"));
}

async function resolveInterceptedDownload(interceptId, choice) {
  const key = INTERCEPT_PREFIX + interceptId;
  const stored = await chrome.storage.session.get(key);
  const info = stored[key];
  if (!info) {
    return { ok: false, error: "Download non più disponibile" };
  }

  if (choice === "pyload") {
    const result = await sendToPyload([info.url]);
    // In caso di errore il download resta pendente: l'utente può ancora
    // riprovare o scegliere Chrome dallo stesso modale.
    if (result.ok) {
      await chrome.storage.session.remove(key);
    }
    return result;
  }

  if (choice === "chrome") {
    await chrome.storage.session.remove(key);
    const bypass = await getBypassUrls();
    bypass.push(info.url);
    await setBypassUrls(bypass);
    try {
      await chrome.downloads.download({ url: info.url });
    } catch (err) {
      return {
        ok: false,
        error: "Impossibile riavviare il download con Chrome"
      };
    }
    return { ok: true };
  }

  // "abort": il download era già stato annullato alla creazione.
  await chrome.storage.session.remove(key);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messaggi da opzioni, modale e finestra di intercettazione
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "send-links") {
    sendToPyload(message.links).then(sendResponse);
    return true;
  }
  if (message.action === "intercept-choice") {
    resolveInterceptedDownload(message.interceptId, message.choice)
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
