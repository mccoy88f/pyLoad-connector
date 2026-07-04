// Localizza gli elementi della pagina in base agli attributi data-i18n:
//   data-i18n             → textContent
//   data-i18n-placeholder → placeholder
//   data-i18n-title       → title (tooltip)
// Il testo statico nell'HTML è in inglese e fa da fallback se una chiave manca.

export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || "";
}

export function localizePage() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const text = t(el.dataset.i18n);
    if (text) el.textContent = text;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const text = t(el.dataset.i18nPlaceholder);
    if (text) el.placeholder = text;
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    const text = t(el.dataset.i18nTitle);
    if (text) el.title = text;
  }
}
