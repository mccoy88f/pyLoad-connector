// Client per l'API JSON di pyLoad (compatibile con pyLoad 0.4.x e pyload-ng).
// Tutte le chiamate usano l'endpoint /api/<metodo> con parametri form-encoded
// in cui ogni valore è serializzato in JSON, come richiesto da pyLoad.
// La sessione è gestita tramite cookie (credentials: "include").

export const DEFAULT_SETTINGS = {
  protocol: "http",
  host: "127.0.0.1",
  port: "8000",
  username: "pyload",
  password: "",
  interceptDownloads: false,
  packageName: ""
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

// Costruisce l'URL base del server a partire da protocollo, host e porta.
// L'host può contenere anche un percorso (es. reverse proxy: nas.local/pyload).
function normalizeBase(settings) {
  let host = (settings.host || "").trim();
  if (!host) {
    throw new Error("Indirizzo del server pyLoad non configurato");
  }
  // Se l'utente incolla un URL completo nel campo host, rispetta quel valore.
  host = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const protocol = settings.protocol === "https" ? "https" : "http";
  const port = String(settings.port || "").trim();
  if (port && !/^\d+$/.test(port)) {
    throw new Error(`Porta non valida: "${port}"`);
  }
  // Aggiunge la porta solo se non è già presente nell'host.
  const [hostname, ...pathParts] = host.split("/");
  const authority =
    port && !hostname.includes(":") ? `${hostname}:${port}` : hostname;
  return [`${protocol}://${authority}`, ...pathParts].join("/");
}

// Login: a differenza degli altri metodi, /api/login accetta i parametri
// come semplici valori form (non serializzati in JSON).
async function login(settings) {
  const base = normalizeBase(settings);
  const body = new URLSearchParams({
    username: settings.username || "",
    password: settings.password || ""
  });
  let response;
  try {
    response = await fetch(`${base}/api/login`, {
      method: "POST",
      body,
      credentials: "include"
    });
  } catch (err) {
    throw new Error(`Server pyLoad non raggiungibile (${base})`);
  }
  if (!response.ok) {
    throw new Error(`Login fallito: HTTP ${response.status}`);
  }
  const data = await response.json().catch(() => null);
  if (data === false || data === null) {
    throw new Error("Login fallito: nome utente o password errati");
  }
  return data;
}

async function rawApiCall(base, method, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    body.set(key, JSON.stringify(value));
  }
  return fetch(`${base}/api/${method}`, {
    method: "POST",
    body,
    credentials: "include"
  });
}

// Chiama un metodo dell'API; se la sessione è scaduta (401/403)
// effettua il login e riprova una volta.
export async function apiCall(method, params, settings) {
  const config = settings || (await getSettings());
  const base = normalizeBase(config);

  let response;
  try {
    response = await rawApiCall(base, method, params);
  } catch (err) {
    throw new Error(`Server pyLoad non raggiungibile (${base})`);
  }

  if (response.status === 401 || response.status === 403) {
    await login(config);
    response = await rawApiCall(base, method, params);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`pyLoad ha risposto HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json().catch(() => null);
}

// Aggiunge un pacchetto alla coda di pyLoad tramite addPackage(name, links).
// Restituisce l'id del pacchetto creato.
export async function addPackage(name, links, settings) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error("Nessun link da inviare");
  }
  return apiCall("addPackage", { name, links }, settings);
}

// Verifica la connessione: login + lettura versione del server.
export async function testConnection(settings) {
  const config = settings || (await getSettings());
  await login(config);
  const version = await apiCall("getServerVersion", {}, config);
  return version;
}

// Deriva un nome pacchetto leggibile da un URL (nome file o host),
// a meno che l'utente non abbia impostato un nome fisso nelle opzioni.
export function packageNameFor(url, settings) {
  if (settings && settings.packageName) {
    return settings.packageName;
  }
  try {
    const parsed = new URL(url);
    const fileName = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || ""
    );
    return fileName || parsed.hostname || "pyLoad Connector";
  } catch (err) {
    return "pyLoad Connector";
  }
}

// Estrae gli URL http/https/ftp presenti in un testo (es. testo selezionato).
export function extractLinks(text) {
  if (!text) return [];
  const matches = text.match(/(?:https?|ftps?):\/\/[^\s"'<>]+/gi) || [];
  return [...new Set(matches)];
}
