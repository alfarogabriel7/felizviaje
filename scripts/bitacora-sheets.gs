/* Bitácora de cotizaciones — Google Apps Script.
   Este archivo NO se ejecuta en Vercel: se pega en la hoja de Google (Extensiones > Apps Script)
   y se publica como "Aplicación web". La URL que entrega se pone en SHEETS_URL dentro de index.html.
   Cada solicitud del cotizador agrega una fila en la pestaña "Cotizaciones". */

const HOJA = 'Cotizaciones';
const COLUMNAS = ['Fecha de solicitud', 'Servicio', 'Transporte', 'Ciudad de salida', 'Destino', 'Salida', 'Regreso',
  'Adultos', 'Menores', 'Edades de menores', 'Nombre', 'Teléfono', 'Detalles'];
const CAMPOS = ['servicio', 'transporte', 'origen', 'destino', 'salida', 'regreso',
  'adultos', 'menores', 'edades', 'nombre', 'tel', 'detalles'];

/* el formulario es público: se recorta el texto y se evita que algo que empiece con = + - @ se guarde como fórmula */
function limpia(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
    if (hoja.getLastRow() === 0) {
      hoja.appendRow(COLUMNAS);
      hoja.setFrozenRows(1);
      hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
    }
    hoja.appendRow([new Date()].concat(CAMPOS.map(function (k) { return limpia(d[k]); })));
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

/* abrir la URL en el navegador sirve para comprobar que quedó publicada */
function doGet() {
  return ContentService.createTextOutput('Bitácora de cotizaciones activa');
}
