# pyLoad Connector

Estensione Chrome (Manifest V3) per inviare link a un server [pyLoad](https://pyload.net/) — un'alternativa a Yape. Usa direttamente l'API JSON di pyLoad (`/api/addPackage`), quindi è compatibile sia con pyLoad "classico" (0.4.x) sia con **pyload-ng**.

*A Chrome extension to send links to a pyLoad server (alternative to Yape), using pyLoad's `addPackage` JSON API.*

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
| Porta | Porta dell'interfaccia web (default pyLoad: `8000`) |
| Nome utente / Password | Credenziali di accesso a pyLoad |
| Nome pacchetto fisso | Se vuoto, il nome del pacchetto è ricavato dal nome file o dal sito del link |
| Intercetta i download | Abilita la richiesta prima di ogni download di Chrome |

Il pulsante **"Prova connessione"** effettua il login e mostra la versione del server.

Le credenziali sono salvate solo in locale (`chrome.storage.local`), mai sincronizzate.

## API utilizzata

L'estensione parla con l'endpoint JSON di pyLoad:

- `POST /api/login` — autenticazione (sessione via cookie)
- `POST /api/addPackage` — con `name` e `links` serializzati in JSON, aggiunge il pacchetto alla coda
- `POST /api/getServerVersion` — usato dal test di connessione

## Nota sulle icone

Le icone incluse sono una ricreazione in stile pyLoad (freccia di download su cerchio blu). Per usare il logo ufficiale, sostituisci i file in `icons/` (`icon16.png`, `icon48.png`, `icon128.png`) con il PNG ufficiale ridimensionato.
