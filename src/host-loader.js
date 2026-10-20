// Native Windows installation is entirely local. Only the legacy web add-in
// needs Office.js from Microsoft's CDN; keep its script loading synchronous.
if (!window.__FORMULA_NATIVE__) {
  document.write('<script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"><\/script>');
}
