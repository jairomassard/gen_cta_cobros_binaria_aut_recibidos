/**
 * Registro automático de cuentas de cobro — Binaria Media Group
 *
 * Se instala en una Google Sheet del Drive de contabilidad@binariamedia.co
 * (Extensiones > Apps Script). Revisa el correo cada hora y registra en la hoja
 * "Cuentas de cobro" una fila por cada cuenta recibida. Los correos que parecen
 * cuentas de cobro pero no cumplen el formato quedan en la hoja "Por revisar",
 * para que ninguna se quede sin registrar.
 *
 * Formato que genera el formulario HTML:
 *   Asunto: Cuenta de Cobro – CC-2026-0007, CC-2026-0008 – NOMBRES APELLIDOS – 1032456789
 *   (el número es libre: cada trabajador puede usar su propio prefijo, p. ej. JP-015. Una cuenta se
 *   identifica por identificación + número, como una factura; el mismo número de dos personas no es duplicado)
 *   Cuerpo: termina con el bloque
 *     --- DATOS PARA REGISTRO AUTOMATICO (no modificar) ---
 *     TRABAJADOR|CC|1032456789|NOMBRE|2026-10-27|2026-10
 *     CUENTA|CC-2026-0007|270000|0|270000|Cliente|Evento
 *     --- FIN DATOS ---
 *   Adjuntos: un PDF por cuenta, con el número de la cuenta en el nombre del archivo.
 */

const CONFIG = {
  HOJA_CUENTAS: 'Cuentas de cobro',
  HOJA_REVISAR: 'Por revisar',
  CARPETA_PDF: 'Cuentas de cobro recibidas', // carpeta de Drive donde se guardan los PDF
  DIAS_BUSQUEDA: 7,                          // ventana de búsqueda en Gmail en cada ejecución
  ETIQUETA_OK: 'Cuentas de cobro/Registrada',
  ETIQUETA_REVISAR: 'Cuentas de cobro/Por revisar',
  ESTADOS: ['Pendiente revisión', 'Verificada', 'Registrada en Siigo', 'Rechazada'],
};

const COLS_CUENTAS = [
  'Fecha recepción', 'Remitente', 'N.º cuenta de cobro', 'Tipo doc.', 'Identificación', 'Nombre',
  'Fecha emisión', 'Periodo', 'Cliente', 'Evento', 'Valor servicios', 'Valor gastos', 'Valor total',
  'PDF', 'Estado', 'Observaciones', 'Centro de costo', 'N.º documento soporte Siigo', 'Asunto', 'ID mensaje',
];
const COLS_REVISAR = ['Fecha recepción', 'Remitente', 'Asunto', 'Adjuntos PDF', 'Motivo', 'Enlace al correo', 'Revisado', 'ID mensaje'];

const RE_ASUNTO = /^\s*(?:(?:re|rv|fw|fwd|tr)\s*:\s*)*cuenta de cobro\s+[–—-]\s+(.+?)\s+[–—-]\s+(.+?)\s+[–—-]\s+([A-Za-z0-9.\-]+)\s*$/i;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cuentas de cobro')
    .addItem('Procesar correos ahora', 'procesarCuentasCobro')
    .addItem('Activar revisión automática (cada hora)', 'instalarDisparador')
    .addItem('Desactivar revisión automática', 'eliminarDisparadores')
    .addToUi();
}

function instalarDisparador() {
  eliminarDisparadores();
  ScriptApp.newTrigger('procesarCuentasCobro').timeBased().everyHours(1).create();
  prepararHojas_();
  SpreadsheetApp.getActive().toast('Revisión automática activada: cada hora.');
}

function eliminarDisparadores() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'procesarCuentasCobro')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function procesarCuentasCobro() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const { hojaCuentas, hojaRevisar } = prepararHojas_();
    const procesados = idsProcesados_(hojaCuentas, hojaRevisar);
    const yaRegistradas = cuentasRegistradas_(hojaCuentas);
    const etiquetaOk = etiqueta_(CONFIG.ETIQUETA_OK);
    const etiquetaRevisar = etiqueta_(CONFIG.ETIQUETA_REVISAR);
    const filasCuentas = [];
    const filasRevisar = [];
    const propio = Session.getEffectiveUser().getEmail().toLowerCase();
    const esPropio = msg => msg.getFrom().toLowerCase().indexOf(propio) >= 0;

    // 1) Correos con el asunto estandarizado.
    const consultaAsunto = `subject:"Cuenta de Cobro" newer_than:${CONFIG.DIAS_BUSQUEDA}d`;
    GmailApp.search(consultaAsunto).forEach(hilo => {
      hilo.getMessages().forEach(msg => {
        if (procesados.has(msg.getId()) || esPropio(msg)) return;
        const m = msg.getSubject().match(RE_ASUNTO);
        if (!m) return; // se evalúa en el paso 2
        const filas = filasDeMensaje_(msg, m, yaRegistradas);
        filas.forEach(f => filasCuentas.push(f));
        procesados.add(msg.getId());
        hilo.addLabel(etiquetaOk);
      });
    });

    // 2) Red de seguridad: correos que parecen cuentas de cobro pero no cumplen el formato.
    const consultaAmplia = `has:attachment filename:pdf ("cuenta de cobro" OR "cuentas de cobro" OR "cuenta cobro") newer_than:${CONFIG.DIAS_BUSQUEDA}d -in:sent`;
    GmailApp.search(consultaAmplia).forEach(hilo => {
      hilo.getMessages().forEach(msg => {
        if (procesados.has(msg.getId()) || esPropio(msg)) return;
        const pdfs = pdfsDe_(msg);
        if (!pdfs.length) return;
        filasRevisar.push([
          msg.getDate(), msg.getFrom(), msg.getSubject(), pdfs.map(a => a.getName()).join('\n'),
          'El asunto no tiene el formato "Cuenta de Cobro – N.º – NOMBRE – IDENTIFICACIÓN"',
          `https://mail.google.com/mail/u/0/#all/${msg.getId()}`, false, msg.getId(),
        ]);
        procesados.add(msg.getId());
        hilo.addLabel(etiquetaRevisar);
      });
    });

    escribir_(hojaCuentas, filasCuentas);
    escribir_(hojaRevisar, filasRevisar);
    if (filasRevisar.length) hojaRevisar.getRange(hojaRevisar.getLastRow() - filasRevisar.length + 1, 7, filasRevisar.length, 1).insertCheckboxes();
    if (filasCuentas.length || filasRevisar.length) {
      SpreadsheetApp.getActive().toast(`${filasCuentas.length} cuenta(s) registrada(s), ${filasRevisar.length} correo(s) por revisar.`);
    }
  } finally {
    lock.releaseLock();
  }
}

/** Convierte un correo con asunto válido en una fila por cuenta de cobro. */
function filasDeMensaje_(msg, m, yaRegistradas) {
  const asuntoNumeros = m[1].split(/\s*[,;]\s*/).map(n => n.trim().toUpperCase()).filter(Boolean);
  const asuntoNombre = m[2].trim();
  const asuntoId = m[3].trim();
  const datos = leerBloque_(msg.getPlainBody());
  const pdfs = pdfsDe_(msg);
  const usados = new Set();
  const obsGenerales = [];

  let cuentas;
  let trabajador = { tipo: '', id: asuntoId, nombre: asuntoNombre, fecha: '', periodo: '' };
  if (datos && datos.cuentas.length) {
    cuentas = datos.cuentas;
    if (datos.trabajador) trabajador = datos.trabajador;
    if (trabajador.id !== asuntoId) obsGenerales.push(`La identificación del asunto (${asuntoId}) no coincide con la del cuerpo (${trabajador.id}).`);
    const delCuerpo = cuentas.map(c => c.numero).sort().join(',');
    if (asuntoNumeros.length && asuntoNumeros.slice().sort().join(',') !== delCuerpo) obsGenerales.push('Los números del asunto no coinciden con los del cuerpo.');
  } else {
    // Sin bloque de datos: se registra igual a partir del asunto para no perder la cuenta.
    cuentas = asuntoNumeros.map(numero => ({ numero, servicios: '', gastos: '', total: '', cliente: '', evento: '' }));
    obsGenerales.push('Sin bloque "DATOS PARA REGISTRO AUTOMATICO": completar valores, cliente y evento manualmente.');
  }

  const filas = cuentas.map(c => {
    const obs = obsGenerales.slice();
    const llave = `${trabajador.id}|${c.numero}`;
    if (yaRegistradas.has(llave)) obs.push('POSIBLE DUPLICADO: esta cuenta ya estaba registrada.');
    yaRegistradas.add(llave);
    if (c.total !== '' && c.servicios !== '' && c.gastos !== '' && c.servicios + c.gastos !== c.total) obs.push('La suma de servicios y gastos no coincide con el total.');

    const pdf = pdfs.find(a => !usados.has(a) && nombreContieneNumero_(a.getName(), c.numero));
    let celdaPdf = 'NO ADJUNTO';
    if (pdf) {
      usados.add(pdf);
      const archivo = carpetaPdf_().createFile(pdf.copyBlob()).setName(`${c.numero}_${trabajador.id}_${pdf.getName()}`);
      celdaPdf = `=HYPERLINK("${archivo.getUrl()}","Ver PDF")`;
    } else {
      obs.push('No se encontró un PDF con el número de la cuenta en el nombre del archivo.');
    }
    return [
      msg.getDate(), msg.getFrom(), c.numero, trabajador.tipo, trabajador.id, trabajador.nombre,
      trabajador.fecha, trabajador.periodo, c.cliente, c.evento, c.servicios, c.gastos, c.total,
      celdaPdf, CONFIG.ESTADOS[0], obs.join('\n'), '', '', msg.getSubject(), msg.getId(),
    ];
  });

  const sobrantes = pdfs.filter(a => !usados.has(a));
  if (sobrantes.length && filas.length) {
    const col = COLS_CUENTAS.indexOf('Observaciones');
    filas[0][col] = [filas[0][col], `PDF adjuntos sin asociar: ${sobrantes.map(a => a.getName()).join(', ')}`].filter(Boolean).join('\n');
  }
  return filas;
}

/** Lee el bloque estructurado del final del correo. Tolera respuestas citadas ("> "). */
function leerBloque_(texto) {
  const ini = texto.indexOf('--- DATOS PARA REGISTRO AUTOMATICO');
  if (ini < 0) return null;
  const fin = texto.indexOf('--- FIN DATOS ---', ini);
  const lineas = texto.slice(ini, fin < 0 ? undefined : fin).split(/\r?\n/).map(l => l.replace(/^[>\s]+/, '').trim());
  const num = v => (v === undefined || v === '' ? '' : Number(String(v).replace(/[^\d-]/g, '')));
  const out = { trabajador: null, cuentas: [] };
  lineas.forEach(l => {
    const p = l.split('|').map(x => x.trim());
    if (p[0] === 'TRABAJADOR' && p.length >= 6) {
      out.trabajador = { tipo: p[1], id: p[2], nombre: p[3], fecha: p[4], periodo: p[5] };
    } else if (p[0] === 'CUENTA' && p.length >= 7) {
      out.cuentas.push({ numero: p[1].toUpperCase(), servicios: num(p[2]), gastos: num(p[3]), total: num(p[4]), cliente: p[5], evento: p.slice(6).join(' ') });
    }
  });
  return out;
}

/** El número debe aparecer como "palabra" completa: "15" no debe coincidir con "2015" ni "JP-15" con "JP-150". */
function nombreContieneNumero_(nombre, numero) {
  const escapado = numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escapado}([^A-Z0-9]|$)`, 'i').test(nombre);
}

function pdfsDe_(msg) {
  return msg.getAttachments({ includeInlineImages: false })
    .filter(a => a.getContentType() === 'application/pdf' || /\.pdf$/i.test(a.getName()));
}

function prepararHojas_() {
  const ss = SpreadsheetApp.getActive();
  const hojaCuentas = hoja_(ss, CONFIG.HOJA_CUENTAS, COLS_CUENTAS);
  const hojaRevisar = hoja_(ss, CONFIG.HOJA_REVISAR, COLS_REVISAR);
  const colEstado = COLS_CUENTAS.indexOf('Estado') + 1;
  const regla = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.ESTADOS, true).build();
  hojaCuentas.getRange(2, colEstado, hojaCuentas.getMaxRows() - 1, 1).setDataValidation(regla);
  return { hojaCuentas, hojaRevisar };
}

function hoja_(ss, nombre, columnas) {
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold').setBackground('#17263d').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.hideColumns(columnas.length); // ID mensaje: uso interno
  }
  return h;
}

function idsProcesados_(...hojas) {
  const ids = new Set();
  hojas.forEach(h => {
    const ult = h.getLastRow();
    if (ult < 2) return;
    h.getRange(2, h.getLastColumn(), ult - 1, 1).getValues().forEach(([id]) => id && ids.add(String(id)));
  });
  return ids;
}

function cuentasRegistradas_(h) {
  const llaves = new Set();
  const ult = h.getLastRow();
  if (ult < 2) return llaves;
  const cNum = COLS_CUENTAS.indexOf('N.º cuenta de cobro');
  const cId = COLS_CUENTAS.indexOf('Identificación');
  h.getRange(2, 1, ult - 1, COLS_CUENTAS.length).getValues().forEach(r => llaves.add(`${r[cId]}|${String(r[cNum]).toUpperCase()}`));
  return llaves;
}

function escribir_(h, filas) {
  if (!filas.length) return;
  h.getRange(h.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
}

function etiqueta_(nombre) {
  const padre = nombre.split('/')[0];
  if (padre !== nombre && !GmailApp.getUserLabelByName(padre)) GmailApp.createLabel(padre);
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

function carpetaPdf_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CARPETA_PDF_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* la carpeta fue borrada: se crea de nuevo */ }
  }
  const carpeta = DriveApp.createFolder(CONFIG.CARPETA_PDF);
  props.setProperty('CARPETA_PDF_ID', carpeta.getId());
  return carpeta;
}
