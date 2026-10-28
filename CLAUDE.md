# Contexto del proyecto: cuentas de cobro Binaria Media Group

Resumen para retomar el trabajo. Actualizado: 2026-10-27.

## Qué es
Herramienta de Binaria Media Group (agencia 360: BTL, publicidad, marketing, audiovisual, desarrollo) para que los
contratistas generen sus **cuentas de cobro** en un formato estándar y contabilidad las registre automáticamente en una
Google Sheet sin que se pierda ninguna. El usuario (Jairo Massard) es líder de desarrollo de Binaria; habla español.

- **Sitio:** https://cuentas-cobro-binaria.vercel.app (instructivo en `/instructivo`)
- **Repo:** https://github.com/jairomassard/gen_cta_cobros_binaria_aut_recibidos (público, cuenta personal del usuario)
- **Vercel:** equipo `binaria2` de Binaria (plan Hobby), **Root Directory = `vercel`**, preset Other, sin build.
  Cada `git push` a `main` despliega solo (~20 s).

## Archivos
| Archivo | Rol |
|---|---|
| `vercel/index.html` | **Única fuente del formulario** (HTML + CSS + JS en un archivo, estilo compacto/minificado). |
| `vercel/instructivo.html` | Instructivo para contratistas. **Actualizarlo en el mismo commit cada vez que cambie el formulario.** |
| `vercel/logo-binaria-blanco.png` | Logo blanco (recortado de `Logo/Logo binaria.png`). Solo en encabezados de pantalla, **nunca en las cuentas de cobro**. |
| `vercel/vercel.json` | Cabeceras: CSP estricta (scripts solo de `'self'` y cdnjs), nosniff, no-referrer, etc. |
| `apps-script/CuentasCobro.gs` | Script de la Google Sheet de contabilidad@binariamedia.co (se pega a mano en Extensiones → Apps Script). |
| `README.md` | Documentación para personas. |
| `Cuenta_de_Cobro_Binaria_Empleados_v1_original.html` | Versión original del colaborador (solo referencia). |
| `Logo/`, `*.docx` | Ignorados en git (fuentes del logo; documento interno de requerimientos). |

## Requerimientos de origen (documento interno del usuario)
1. Asunto estandarizado `Cuenta de Cobro – #Cuenta – NOMBRES APELLIDOS – IDENTIFICACIÓN`.
2. Texto del correo sugerido por el formulario ("Con la presente yo, …, presento mi cuenta de cobro … por los servicios …").
3. PDF en formato estándar adjunto.
4. Nota DIAN al final de la descripción: *(Declaro que NO he contratado o vinculado dos (2) o más trabajadores asociados a la actividad.)*
5. **Una cuenta de cobro por cliente / evento**, cada una con su propio número; pueden llegar en un mismo correo con
   PDF separados a contabilidad@binariamedia.co y hr.binariamedia@gmail.com.
6. La auxiliar contable registra cada cuenta como documento soporte en Siigo con su centro de costo.
7. Script en Google Sheets que cargue las cuentas a medida que llegan.

## Cómo funciona el formulario (`vercel/index.html`)
- Secciones: 1 identificación (prefijo + consecutivo, fecha emisión, ciudad, periodo) · 2 contratante (fijo) ·
  3 trabajador · 4 servicios · 5 gastos · 6 pago · 7 declaración y firma · 8 envío (aparece tras validar).
- **Agrupación:** servicios con el mismo `cliente + evento` (normalizado: mayúsculas, espacios) = una cuenta. Gastos se
  asignan a una cuenta con un select.
- **Numeración:** `prefijo` libre (por defecto `CC-AAAA-`, letras/números/`.-_`, sin espacios) + `consecutivo` que
  conserva los ceros a la izquierda (`015` → `015`, `016`). Se recuerda en `localStorage` (`binaria_cc_numeracion`).
  Unicidad = **identificación + número** (como factura); el mismo número entre personas distintas no es duplicado.
- **Servicio:** fecha inicio y fin opcional (rango ≤ 31 días, mismo horario diario, dentro del periodo), cliente,
  evento, **tipo de actividad** (constante `TIPOS_ACTIVIDAD`, agrupada por línea de negocio, con `Otro`),
  **descripción** obligatoria (≥ 10 caracteres), horas inicio/fin, descanso, valor total de la fila.
  Botón **Duplicar al día siguiente**. Horas totales = horas por día × días.
- **Se quitó** el "concepto general del cobro" (podía describir servicios no prestados): la descripción sale de tipo +
  descripción + cliente + evento.
- **Firma:** dibujada en canvas o imagen subida (queda en el PDF), o modo "imprimir, firmar a mano y escanear"
  (PDF con línea en blanco). **No es firma electrónica certificada** (decisión del usuario) y **no se guarda en
  borradores**.
- **PDF:** jsPDF 2.5.1 + jspdf-autotable 3.8.2 desde cdnjs con SRI; texto real, compresión activada (~11 KB).
  Fuentes estándar solo Latin-1 → `pdfText()` normaliza comillas/guiones. Si la librería no carga, cae a `window.print()`
  con la sección `#paper` (el `document.title` define el nombre sugerido del archivo).
- **Nombre del PDF:** `CuentaCobro_<NUMERO>_<NOMBRE>_<DOCUMENTO>.pdf` (el script lo usa para asociar el PDF).
- **Correo:** botones Gmail (`mail.google.com/?view=cm`) y `mailto:`; en celular se destaca `mailto`. Los PDF se
  adjuntan a mano.
- Borradores JSON (`version_esquema: '2.0'`, también lee '1.0'). Exportación JSON/CSV existe (`exportData`) pero **sin
  botones** por decisión del usuario (comentario en el código indica cómo reactivarlos).

## Contrato entre formulario y script (no romper)
Asunto: `Cuenta de Cobro – NUM1, NUM2 – NOMBRE EN MAYÚSCULAS – IDENTIFICACIÓN` (separador ` – `; números separados por coma).
Bloque al final del cuerpo:
```
--- DATOS PARA REGISTRO AUTOMATICO (no modificar) ---
TRABAJADOR|tipoDoc|identificación|NOMBRE|fecha_emisión|periodo
CUENTA|numero|valor_servicios|valor_gastos|total|cliente|evento
TIPOS|numero|tipo1; tipo2
--- FIN DATOS ---
```
Si se agregan campos, usar **líneas nuevas** (el parser ignora las desconocidas); no agregar columnas a `CUENTA`.

## Script de contabilidad (`apps-script/CuentasCobro.gs`)
- Menú en la hoja; disparador cada hora; busca `subject:"Cuenta de Cobro"` de los últimos 7 días.
- Una fila por cuenta en la hoja "Cuentas de cobro"; guarda el PDF en la carpeta de Drive "Cuentas de cobro recibidas"
  (asociado por el número como palabra completa en el nombre del archivo).
- Observaciones automáticas: posible duplicado (misma identificación + número), PDF faltante o sobrante, totales que no
  cuadran, asunto y cuerpo que no coinciden, correo sin bloque.
- Hoja "Por revisar": correos con PDF que mencionan "cuenta de cobro" sin el asunto estándar.
- Etiquetas Gmail `Cuentas de cobro/Registrada` y `Cuentas de cobro/Por revisar`; ignora correos de la propia cuenta.
- `hoja_()` migra hojas existentes insertando columnas nuevas en su posición. "ID mensaje" debe ser siempre la última columna.
- **Tras cambiar el script, el usuario debe pegarlo de nuevo en Apps Script** (no se despliega con git).

## Cómo probar (no hay pruebas en el repo)
Se probó con Node + jsdom en un directorio temporal: cargar `vercel/index.html` quitando los `<script src>` e inyectando
jspdf/autotable descargados de cdnjs; simular el canvas de firma (`getContext`/`toDataURL`); llenar campos, llamar
`generate()`, `buildPdf(i)` y revisar el PDF. El `.gs` se probó con `eval` y objetos simulados de Gmail/Drive
(`filasDeMensaje_`, `leerBloque_`, `hoja_`). Verificar sintaxis rápido:
`node -e "new Function(require('fs').readFileSync('vercel/index.html','utf8').split('<script>')[1].split('</script>')[0])"`
(el script principal es el que sigue a `<script>` sin `src`). Tras el push, comprobar con `curl` el sitio publicado.

## Convenciones
- Mantener el estilo compacto del JS existente; comentarios breves solo donde algo no es obvio.
- Todo texto visible en español. CSS ya tiene tokens en `:root`.
- Commits en español con `Co-Authored-By` según indique el sistema.
- No subir el `.docx` ni la carpeta `Logo/` (repo público).

## Pendientes / preguntas abiertas
- Confirmar si el Apps Script ya está instalado en contabilidad@ y con la última versión (columna "Tipo de actividad").
- Prueba real desde celular (firma con el dedo, descarga del PDF, `mailto`) y envío de un correo de prueba end-to-end.
- Instructivo: confirmar con el usuario la política ante errores ya enviados (hoy dice "avisa a contabilidad") y el
  correo de contacto para dudas (hoy contabilidad@binariamedia.co).
- Revisar con el equipo la lista `TIPOS_ACTIVIDAD` (propuesta inicial).
- Opcional: dominio propio (p. ej. `cuentas.binariamedia.co`); evaluar plan Pro de Vercel (Hobby es no comercial).
