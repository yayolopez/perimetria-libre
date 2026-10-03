# Perimetría Libre

Campimetría (perimetría estática automatizada) **de código abierto** para visores de realidad virtual.
Funciona en el navegador, sin instalar nada: Pico, Meta Quest y otros visores con WebXR. También corre en computadora y celular en modo demostración.

> ⚠️ **Prototipo de investigación. No es un dispositivo médico certificado.** No debe usarse para diagnóstico ni para decisiones clínicas hasta que esté validado contra un perímetro de referencia.

## Qué hace (versión 0.3)

| Función | Estado |
|---|---|
| Patrones 24-2, 30-2, 10-2 (OD/OI) y umbral foveal | ✅ |
| Estímulos Goldmann I–V, duración 100/200/300 ms, velocidad normal/lenta/rápida | ✅ |
| Estrategias ZEST (bayesiana), umbral completo 4-2 y tamizaje supraumbral | ✅ |
| Fijación: punto, rombo (escotoma central) o cruz | ✅ |
| Visor VR: estímulo solo en el ojo examinado, anclado a la cabeza | ✅ |
| Pantalla: calibración con tarjeta, distancia recomendada y adición de cerca | ✅ |
| Controles: fijación (mancha ciega), falsos positivos y negativos | ✅ |
| Vigilancia de mirada con cámara web (modo pantalla) | 🧪 experimental |
| Monitor del operador: cronómetro, progreso, mapa en vivo, pausa/detener, en otra ventana o equipo | ✅ |
| Informe: umbrales, grises, desviación total y patrón, mapas de probabilidad, MD, PSD, gráfica de mirada | ✅ |
| Herramienta para construir la base normativa propia por edad | ✅ |
| Recolección de exámenes anonimizados (con consentimiento) en Google Sheets, con cola sin conexión | ✅ ver [docs/RECOLECCION-DATOS.md](docs/RECOLECCION-DATOS.md) |
| Base normativa validada para cada visor | ⏳ hay que recolectarla (ver [docs/BASE-NORMATIVA.md](docs/BASE-NORMATIVA.md)) |
| Seguimiento ocular dentro del visor | ⏳ el navegador no lo ofrece; requiere app nativa (OpenXR) |
| **Otras pruebas:** agudeza visual, sensibilidad al contraste, Amsler, estereopsis, visión de colores, foria (Maddox), Hess-Lancaster | ✅ ver [docs/OTRAS-PRUEBAS.md](docs/OTRAS-PRUEBAS.md) |
| GHT, VFI, perimetría cinética, FDT, Esterman | ⏳ |
| Pupilometría, cover test objetivo, motilidad objetiva, nistagmografía | ⏳ requieren seguimiento ocular (app nativa) |

## Probarlo en la computadora

```bash
python3 -m http.server 8765
```

Abra http://localhost:8765. Las pruebas automáticas del núcleo están en http://localhost:8765/tests/.

## Usarlo en un visor

WebXR exige **HTTPS**. La forma más simple es publicarlo gratis en GitHub Pages:

1. Suba esta carpeta a un repositorio de GitHub.
2. En *Settings → Pages*, elija la rama `main` y la carpeta raíz.
3. Abra `https://<usuario>.github.io/<repositorio>/` desde el navegador del visor (Pico Browser, Meta Quest Browser…).
4. Opcional: "Añadir a la pantalla de inicio" para usarlo como app y sin conexión.

Sirve cualquier otro hosting estático con HTTPS (Netlify, Cloudflare Pages, el servidor del consultorio, etc.).

### Visores compatibles

Cualquier visor cuyo navegador soporte WebXR: **Meta Quest 2/3/3S/Pro** (Meta Quest Browser), **Pico 4/4 Ultra/Neo 3** (Pico Browser), **HTC Vive Focus 3/XR Elite** (VIVE Browser), visores de PC con SteamVR (Chrome/Edge en Windows) y **Apple Vision Pro** (Safari; sin palanca, por ahora solo sirven las pruebas que se responden con el gatillo). Cada modelo necesita su propio perfil de luminancia y su base normativa.

### Durante el examen

- **Gatillo**: el paciente responde cuando ve la luz.
- **Botón lateral (agarre)**: pausa / reanuda.
- **Monitor del operador**: active "Monitor en otro equipo" en el visor; en la tablet o PC abra la misma página → *Abrir monitor* → escriba el código de 6 dígitos. Desde ahí ve el cronómetro, el progreso y los controles, y puede iniciar, pausar o detener.
- Al terminar, el informe aparece en el visor y también en el monitor, desde donde se imprime o se guarda.

## Usarlo en un monitor

Vea [docs/PANTALLA.md](docs/PANTALLA.md): calibración con una tarjeta bancaria, distancia, adición de cerca y vigilancia de mirada con la cámara.

## Estructura

```
src/core/          Lógica pura, sin dependencias (probada con tests/)
  patterns.js        Coordenadas 24-2, 30-2, 10-2
  luminance.js       Escala dB ↔ cd/m², perfil del visor, cuantización
  strategies/        ZEST y umbral completo 4-2
  procedure.js       Sesión: orden de estímulos y controles de confiabilidad
  normative.js       Base normativa: TD, PD, MD, PSD, probabilidades
  screenGeometry.js  Proyección en pantalla plana, distancia, adición
  options.js         Tamaños Goldmann, velocidades, fijación
  results.js         Resumen y exportación
  simulator.js       Paciente simulado y base sintética
  adaptive.js        Escalera bayesiana (QUEST) para elección forzada
  tests/             Lógica de las otras pruebas (agudeza, contraste, …)
src/app/           Navegador
  xr-renderer.js     Visor VR (WebXR + three.js)
  screen-renderer.js Pantalla común (demo)
  runner.js          Tiempos, pausas, mirada y eventos del monitor
  report.js          Informe
  gaze.js            Mirada con cámara web (MediaPipe)
  canvas-*.js        Dibujo de las otras pruebas (pantalla y anaglifo)
  xr-canvas-renderer.js  Otras pruebas en el visor (un lienzo por ojo)
  tests/             Dibujo, controles e informe de cada prueba
  monitor-*.js       Monitor del operador (BroadcastChannel / WebRTC)
docs/              Métodos, calibración y política de sala limpia
```

## Limitaciones conocidas

- **Rango dinámico**: un visor típico (~100 cd/m²) no alcanza los 10 000 asb del Humphrey. Con fondo de 10 cd/m² el estímulo más brillante ronda los 15–16 dB; los defectos profundos se informan como `<16`. Ver [docs/METODOS.md](docs/METODOS.md).
- **Sin calibrar, los dB son aproximados.** Calibre cada visor ([docs/CALIBRACION.md](docs/CALIBRACION.md)).
- **MD/PSD necesitan una base normativa del mismo tipo de equipo.** La app trae la herramienta para construirla, pero los datos hay que recolectarlos. La base "sintética" del modo simulación es solo para demostración.
- **La fijación** se controla con la mancha ciega en una ubicación nominal (15°, −1.5°); en pantalla se puede sumar la cámara (precisión de varios grados).
- **El monitor remoto** usa el servidor público de PeerJS solo para que los equipos se encuentren; los datos viajan cifrados entre ellos. Requiere internet en ambos equipos.

## Origen y política de sala limpia

Este proyecto se escribe desde cero a partir de literatura científica publicada. **No contiene código, binarios, recursos ni datos de ningún producto comercial**, ni derivados de ellos. Lea [docs/SALA-LIMPIA.md](docs/SALA-LIMPIA.md) antes de contribuir.

## Contribuir

Se buscan oftalmólogos, optometristas, investigadores y desarrolladores. Lo más valioso hoy:

1. Perfiles de calibración medidos de distintos visores.
2. Estudios de validación contra Humphrey u Octopus.
3. Datos normativos por edad (con consentimiento y anonimizados).

## Licencia

[MIT](LICENSE).
