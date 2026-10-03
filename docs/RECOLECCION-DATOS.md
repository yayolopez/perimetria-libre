# Recolección de datos en Google Sheets

Cada examen con consentimiento se envía, **anonimizado**, a una hoja de cálculo de **su** cuenta de Google. Así se van juntando datos de todos los equipos del consultorio (visores, computadoras) para construir la base normativa y hacer estudios de validación.

## Qué se envía y qué no

| Se envía | No se envía nunca |
|---|---|
| Edad, ojo, diagnóstico (si se eligió), si es sujeto normal | Nombre, ID o iniciales del paciente |
| Resultados: umbrales por punto o datos de la prueba | Observaciones de texto libre |
| Confiabilidad, duración, estrategia, patrón | Registro estímulo por estímulo (queda en el equipo) |
| Equipo: modo (visor o pantalla), perfil de luminancia, resolución | |
| Nombre del consultorio o equipo (el que usted configure) | |

- Solo se envían los exámenes con la casilla **"El paciente autorizó usar sus datos anonimizados para investigación"** marcada. Las simulaciones nunca se envían.
- Además, el script rechaza cualquier registro que traiga nombre u observaciones.

> **Consentimiento:** en México los datos de salud son *datos personales sensibles* (LFPDPPP) y requieren consentimiento expreso y por escrito, además de un aviso de privacidad. Aunque se envíen anonimizados, conviene tener un formato de consentimiento firmado y, si es un estudio, la aprobación de un comité de ética.

## Instalación (una vez, unos 5 minutos)

1. Entre a [sheets.new](https://sheets.new) con su cuenta de Google y póngale nombre a la hoja, por ejemplo "Perimetría Libre – datos".
2. Menú **Extensiones → Apps Script**.
3. Borre lo que haya y pegue el contenido de [`tools/google-sheets/Codigo.gs`](../tools/google-sheets/Codigo.gs).
4. En la línea `const CLAVE = 'CAMBIE-ESTA-CLAVE';` ponga una clave propia, larga y sin espacios (por ejemplo `ojo-2026-k8p3x9`). Guarde con el ícono del disquete.
5. **Implementar → Nueva implementación**. En el engranaje elija **Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier persona**

   Presione **Implementar** y autorice cuando Google lo pida. Aparece "Esta app no está verificada": entre a *Configuración avanzada → Ir a … (no seguro)*. Es normal en scripts propios.
6. Copie la **URL de la aplicación web** (termina en `/exec`).

## Configurar la app

1. En Perimetría Libre: **Base normativa → Recolección de datos**.
2. Pegue la URL y la clave, escriba un nombre para el equipo (por ejemplo `consultorio-1-pico`) y presione **Guardar**.
3. Presione **Probar conexión**: debe decir "Conexión correcta ✓".

### Configurar el visor sin escribir

Escribir una URL larga en un visor es incómodo. En la computadora ya configurada presione **Copiar enlace para configurar otro equipo**, envíese ese enlace (por correo o mensaje) y ábralo en el navegador del visor: queda configurado al instante. Cambie después el nombre del equipo si quiere distinguirlo.

## Uso diario

- Marque la casilla de consentimiento y, si lo sabe, el diagnóstico.
- Al guardar el examen se envía solo. En el **Historial** se ve **☁ enviado** o **⏳ pendiente**.
- Sin internet, los exámenes quedan en cola y se envían al volver la conexión o al abrir la app. También puede usar **Enviar pendientes**.
- **Enviar pendientes** también sube los exámenes con consentimiento que se hicieron antes de configurar el envío.

## La hoja de cálculo

Cada examen es una fila. Las columnas de resumen (tipo, ojo, edad, diagnóstico, resultado, confiabilidad) sirven para filtrar, y la columna `json` tiene el examen completo para analizarlo después: con la propia app, R, Python o Excel.

Para construir la base normativa con datos de varios equipos, descargue la hoja y use las filas con `normal = sí` del mismo tipo de equipo y patrón.

## Seguridad

- La clave evita que cualquiera escriba en su hoja, pero viaja dentro del enlace de configuración: compártalo solo con su equipo. Si se filtra, cámbiela en el script y publíquela con **Implementar → Gestionar implementaciones → Editar (lápiz) → Versión: nueva versión**; así la URL no cambia.
- La hoja es privada de su cuenta: solo usted (y quien usted invite) puede leerla.
- Para un estudio multicéntrico más grande conviene migrar a una base de datos con usuarios por centro (por ejemplo Supabase); el formato de los registros es el mismo.
