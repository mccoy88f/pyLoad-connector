// Client per pyLoad 0.5.0 (pyload-ng).
//
// Gli endpoint storici /api/login e /api/addPackage rispondono 404
// "Obsolete API" su pyLoad 0.5.0. Il frontend web usa invece gli endpoint
// /json/* con questa autenticazione:
//   1. cookie di sessione del browser (l'utente deve essere loggato
//      manualmente nell'interfaccia web di pyLoad su quel dominio);
//   2. token CSRF estratto dall'HTML di una pagina autenticata
//      (/dashboard), inviato nell'header X-CSRFToken;
//   3. header X-Requested-With: XMLHttpRequest;
//   4. body multipart/form-data (FormData), non JSON.
// L'estensione quindi NON fa login autonomo e non salva credenziali:
// se la sessione manca o è scaduta segnala "session_expired" e l'utente
// deve riaccedere all'interfaccia web.

export const DEFAULT_SETTINGS = {
  protocol: "http",
  host: "127.0.0.1",
  port: "8000",
  dest: "1", // 0 = Collector, 1 = Coda
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
export function baseUrl(settings) {
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

export function loginUrlFor(settings) {
  return `${baseUrl(settings)}/dashboard`;
}

function sessionExpiredError(base) {
  const err = new Error(
    "Sessione pyLoad assente o scaduta: accedi all'interfaccia web e riprova"
  );
  err.code = "session_expired";
  err.loginUrl = `${base}/dashboard`;
  return err;
}

// Cerca il token CSRF nell'HTML di una pagina autenticata di pyLoad.
// Prova più pattern per tollerare variazioni tra i template.
function extractCsrfToken(html) {
  const patterns = [
    /<meta[^>]+name=["']csrf[-_]token["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf[-_]token["']/i,
    /<input[^>]+name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i,
    /csrf[-_]?token["']?\s*[:=]\s*["']([^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Recupera il token CSRF da /dashboard usando il cookie di sessione del
// browser. Lancia session_expired se si finisce sulla pagina di login o
// se il token non è presente nella pagina.
async function fetchCsrfToken(base) {
  let response;
  try {
    response = await fetch(`${base}/dashboard`, {
      credentials: "include",
      cache: "no-store"
    });
  } catch (err) {
    throw new Error(`Server pyLoad non raggiungibile (${base})`);
  }

  if (response.status === 401 || response.status === 403) {
    throw sessionExpiredError(base);
  }
  if (!response.ok) {
    throw new Error(`pyLoad ha risposto HTTP ${response.status} su /dashboard`);
  }
  // Redirect alla pagina di login = sessione assente/scaduta.
  if (response.redirected && /\/login/i.test(response.url)) {
    throw sessionExpiredError(base);
  }

  const html = await response.text();
  const token = extractCsrfToken(html);
  if (!token) {
    throw sessionExpiredError(base);
  }
  return token;
}

// Aggiunge un pacchetto tramite POST /json/add_package.
// Nomi e formato dei campi come da sorgente pyload-ng 0.5.0
// (webui/app/blueprints/json_blueprint.py, add_package):
//   add_name  = nome pacchetto
//   add_links = URL separati da newline (il server fa splitlines())
//   add_dest  = 0 (Collector) o 1 (Coda)
export async function addToPyload(name, links, settings) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error("Nessun link da inviare");
  }
  const config = settings || (await getSettings());
  const base = baseUrl(config);
  const token = await fetchCsrfToken(base);

  const form = new FormData();
  form.set("add_name", name);
  form.set("add_links", links.join("\n"));
  form.set("add_dest", String(config.dest === "0" ? 0 : 1));

  let response;
  try {
    response = await fetch(`${base}/json/add_package`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: {
        "X-CSRFToken": token,
        "X-Requested-With": "XMLHttpRequest"
      }
    });
  } catch (err) {
    throw new Error(`Server pyLoad non raggiungibile (${base})`);
  }

  if (response.status === 401 || response.status === 403) {
    throw sessionExpiredError(base);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `pyLoad ha risposto HTTP ${response.status} ${text.slice(0, 200)}`
    );
  }
  return response.json().catch(() => null);
}

// Verifica la connessione: il server risponde e la sessione è attiva
// (il token CSRF è recuperabile da /dashboard).
export async function testConnection(settings) {
  const config = settings || (await getSettings());
  const base = baseUrl(config);
  await fetchCsrfToken(base);
  return true;
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
