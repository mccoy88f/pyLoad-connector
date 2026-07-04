# pyLoad Connector

Estensione Chrome (Manifest V3) per inviare link a un server [pyLoad](https://pyload.net/) — un'alternativa a Yape. Compatibile con **pyLoad 0.5.0 (pyload-ng)**: usa l'endpoint `/json/add_package` con la sessione del browser e il token CSRF, perché i vecchi endpoint `/api/login` e `/api/addPackage` su 0.5.0 rispondono 404 "Obsolete API".

*A Chrome extension to send links to a pyLoad 0.5.0 server (alternative to Yape), using the `/json/add_package` endpoint with browser session + CSRF token.*

## Funzionalità

- **Menù contestuale** — tasto destro su un link, un'immagine, un video, del testo selezionato o sulla pagina → **"Scarica con pyLoad"**. Dal testo selezionato vengono estratti automaticamente tutti gli URL.
- **Intercetta download** (opzionale) — quando Chrome avvia un download normale, l'estensione lo mette in pausa e chiede se:
  - scaricarlo con **pyLoad** (il download di Chrome viene annullato),
  - continuare con **Chrome**,
  - annullarlo del tutto.
- **Popup** — invia l'URL della scheda corrente o una lista di link incollati; interruttore rapido per l'intercettazione dei download.
- **Notifiche** di conferma o di errore dopo ogni invio.

## Installazione

1. Scarica o clona questo repository.
2. Apri Chrome e vai su `chrome://extensions`.
3. Attiva la **Modalità sviluppatore** (in alto a destra).
4. Clicca **"Carica estensione non pacchettizzata"** e seleziona la cartella del repository.

## Configurazione

Apri le **Opzioni** dell'estensione (tasto destro sull'icona → Opzioni, oppure dal link nel popup) e imposta:

| Campo | Descrizione |
|---|---|
| Protocollo | `http` o `https` |
| Indirizzo | Host o IP del server pyLoad (es. `192.168.1.10`, anche con percorso per reverse proxy: `nas.local/pyload`) |
| Porta | Porta dell'interfaccia web (default pyLoad: `8000`; lasciala vuota dietro reverse proxy) |
| Destinazione | Coda (avvia subito) o Collector (aggiungi senza avviare) |
| Nome pacchetto fisso | Se vuoto, il nome del pacchetto è ricavato dal nome file o dal sito del link |
| Intercetta i download | Abilita la richiesta prima di ogni download di Chrome |

Il pulsante **"Prova connessione"** verifica che il server risponda e che la sessione sia attiva.

## Autenticazione

pyLoad 0.5.0 non espone più un login API: l'estensione **riusa la sessione del browser**.

1. Accedi normalmente all'interfaccia web di pyLoad in una scheda del browser.
2. L'estensione riusa quel cookie di sessione e ricava il token CSRF dalla pagina `/dashboard` prima di ogni invio.
3. Se la sessione manca o è scaduta, l'estensione mostra un link per riaprire l'interfaccia web e rifare il login.

Nessuna credenziale viene salvata nell'estensione.

## API utilizzata

- `GET /dashboard` — verifica della sessione ed estrazione del token CSRF dal tag `<meta name="csrf-token">`
- `POST /json/add_package` — body `multipart/form-data` con `add_name`, `add_links` (URL separati da newline) e `add_dest` (0 = Collector, 1 = Coda); header `X-CSRFToken` e `X-Requested-With: XMLHttpRequest`, cookie di sessione inclusi (nomi dei campi come da sorgente pyload-ng `json_blueprint.py`)

Nota: gli endpoint documentati `/api/*` di pyLoad 0.5.0 (es. `/api/add_package`) non accettano l'autenticazione a sessione usata dal frontend web; l'estensione usa gli stessi endpoint `/json/*` dell'interfaccia web.

## Nota sulle icone

Le icone incluse sono una ricreazione in stile pyLoad (freccia di download su cerchio blu). Per usare il logo ufficiale, sostituisci i file in `icons/` (`icon16.png`, `icon48.png`, `icon128.png`) con il PNG ufficiale ridimensionato.
