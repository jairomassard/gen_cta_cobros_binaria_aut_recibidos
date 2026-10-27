# Cuentas de cobro — Binaria Media Group

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `vercel/index.html` | **El formulario** que usan los contratistas (única versión; es la que se publica en Vercel). |
| `vercel/vercel.json` | Configuración de Vercel con cabeceras de seguridad. |
| `apps-script/CuentasCobro.gs` | Script de la Google Sheet de contabilidad que registra las cuentas que llegan al correo. |
| `Cuenta_de_Cobro_Binaria_Empleados_v1_original.html` | Respaldo de la primera versión del formulario (referencia). |

## Publicar en Vercel

Repositorio: <https://github.com/jairomassard/gen_cta_cobros_binaria_aut_recibidos>

1. En Vercel: *Add New → Project → Import* el repositorio.
2. **Root Directory:** `vercel` · **Framework Preset:** Other · sin comando de build.
3. Cada `git push` a `main` publica automáticamente la nueva versión; las otras ramas generan URLs de prueba.

Solo se publica la carpeta `vercel/`; el script, el respaldo y este LEEME no quedan expuestos en el sitio
(aunque sí son visibles en GitHub, porque el repositorio es público).

La página no guarda datos en el servidor: todo se procesa en el navegador del contratista. El PDF se genera en el
navegador con jsPDF (cargado desde cdnjs con verificación de integridad); si no carga, el botón cae a "Imprimir".

## Cómo funciona el formulario (trabajadores)

1. Abrir el enlace de Vercel (o `vercel/index.html` en Chrome o Edge) y diligenciar los datos.
2. En cada servicio se indica el **cliente** y el **evento**. Cada combinación distinta de cliente y evento genera
   **una cuenta de cobro aparte con su propio número**.
   - Número = **prefijo** (libre; por defecto `CC-AAAA-`, o el que el contratista ya use, p. ej. `JP-`) + **consecutivo**
     (respeta los ceros que escriba: `015` → `015`, `016`…). El navegador recuerda el prefijo y el último número.
   - Como en las facturas, el número solo debe ser único **por persona**: una cuenta se identifica por
     **identificación + número**. Que dos contratistas usen el mismo número no es un problema.
   - El script no depende de la forma del número: detecta las cuentas por el asunto
     (`Cuenta de Cobro – … – NOMBRE – IDENTIFICACIÓN`) y el bloque de datos del correo.
3. **Validar y generar cuentas** muestra:
   - un botón **Descargar PDF** por cuenta (el archivo se llama con el número de la cuenta);
   - **firma**: el contratista firma en el formulario (dedo, lápiz o mouse, o sube una imagen de su firma) y la firma
     queda en el PDF; o elige imprimir, firmar a mano y escanear. La firma no se guarda en los borradores;
   - el correo listo para enviar a `contabilidad@binariamedia.co` y `hr.binariamedia@gmail.com`:
     - Asunto: `Cuenta de Cobro – CC-2026-0007, CC-2026-0008 – NOMBRES APELLIDOS – IDENTIFICACIÓN`
     - Texto: el saludo y la presentación de cada cuenta, y al final un bloque `DATOS PARA REGISTRO AUTOMATICO`
       que el script lee.
4. El trabajador adjunta los PDF (no se adjuntan solos) y envía el correo.

Cada PDF incluye, al final de la descripción de la actividad, la nota:
*(Declaro que NO he contratado o vinculado dos (2) o más trabajadores asociados a la actividad.)*

## Instalar el registro automático (contabilidad)

1. Con la cuenta **contabilidad@binariamedia.co**, crear una Google Sheet nueva (por ejemplo, "Registro cuentas de cobro").
2. Abrir **Extensiones → Apps Script**, borrar el contenido de `Código.gs` y pegar el contenido de `apps-script/CuentasCobro.gs`. Guardar.
3. Volver a la hoja y recargarla. Aparece el menú **Cuentas de cobro**.
4. Ejecutar **Cuentas de cobro → Activar revisión automática (cada hora)** y aceptar los permisos (Gmail, Drive y Hojas de cálculo).
5. Opcional: ejecutar **Procesar correos ahora** para cargar los correos de los últimos 7 días.

### Qué hace

- **Hoja "Cuentas de cobro"**: una fila por cuenta, con número, trabajador, cliente, evento, valores, enlace al PDF
  (guardado en la carpeta de Drive "Cuentas de cobro recibidas"), **Estado** (Pendiente revisión / Verificada /
  Registrada en Siigo / Rechazada), **Observaciones**, y columnas para que la auxiliar contable diligencie el
  **centro de costo** y el **N.º de documento soporte de Siigo**.
- **Observaciones automáticas**: posibles duplicados (misma identificación y número), PDF faltante o sin asociar,
  totales que no cuadran, asunto y cuerpo que no coinciden, correo sin bloque de datos.
- **Hoja "Por revisar"**: correos con PDF que mencionan "cuenta de cobro" pero no tienen el asunto estandarizado,
  para que ninguna cuenta se quede sin registrar.
- Etiqueta los correos en Gmail como `Cuentas de cobro/Registrada` o `Cuentas de cobro/Por revisar`.
- No procesa dos veces el mismo correo ni los correos que envía la propia cuenta de contabilidad.
