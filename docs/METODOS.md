# Métodos

## Escala de decibeles

Se usa la escala del Humphrey Field Analyzer: `dB = 10 · log10(10 000 asb / ΔL)`, donde ΔL es el incremento de luminancia del estímulo sobre el fondo, en apostilbs (1 cd/m² = π asb). El fondo estándar es de 31.5 asb ≈ 10 cd/m².

### Rango dinámico en un visor

Con un fondo de 10 cd/m² y un panel de unos 100 cd/m², el incremento máximo es de unos 90 cd/m² ≈ 283 asb, es decir **≈ 15.5 dB**. Ningún estímulo puede ser más brillante, así que los umbrales por debajo de ese valor se informan como `<16`. El estímulo más tenue depende de la resolución del panel (8 bits): con gamma 2.2 ronda los 40 dB. `Display.range()` calcula ambos límites a partir del perfil de calibración.

Opciones para ampliar el rango, pendientes de evaluar: un fondo más bajo (con otra escala de referencia), *dithering* espacial o temporal, y paneles de 10 bits.

## Patrones

Coordenadas en grados, `x` horizontal (positivo = temporal en OD) e `y` vertical. Para OI se refleja `x`.

- **24-2**: rejilla de 6° desplazada 3° de los meridianos, hasta 21° (27° en el escalón nasal). 54 puntos; 2 caen sobre la mancha ciega.
- **30-2**: rejilla de 6° hasta 27°. 76 puntos.
- **10-2**: rejilla de 2° desplazada 1°, puntos con x² + y² ≤ 82. 68 puntos.

## Estrategias

### ZEST
Estimación bayesiana (King-Smith et al., 1994). Parámetros equivalentes a los de OPI:
- Dominio de −5 a 45 dB, en pasos de 1 dB.
- Prior bimodal: 85 % normal, centrado en el valor esperado (DE 4 dB), y 15 % de daño, centrado en 0 dB (DE 6 dB).
- Función psicométrica gaussiana acumulada con pendiente (DE) de 1 dB, y 3 % de falsos positivos y de falsos negativos.
- Se presenta la media de la distribución a posteriori.
- Termina cuando la DE es menor de 1.5 dB, tras 10 presentaciones, o tras 2 respuestas iguales en un límite del rango.

### Umbral completo 4-2
Escalera con pasos de 4 dB hasta la primera inversión y de 2 dB hasta la segunda. El umbral es el último estímulo visto.

### Tamizaje supraumbral
Se presenta un estímulo 6 dB más brillante que el umbral esperado para la edad. Si se ve, el punto es normal. Si no se ve, se repite; si tampoco se ve, se presenta al máximo brillo: visto = defecto **relativo** (◧), no visto = defecto **absoluto** (■).

### Umbral foveal
Punto (0°, 0°) medido con ZEST mientras el paciente mira el centro de un rombo de 4 puntos a 2°. Se informa aparte y no entra en los índices.

### Valor inicial
Si hay una base normativa para el equipo, se parte del umbral esperado para la edad. Si no, se usa `33 − 0.25 × excentricidad`, una aproximación de la colina de visión **no normativa** que solo sirve para arrancar las estrategias.

## Índices globales

Ver [BASE-NORMATIVA.md](BASE-NORMATIVA.md).

## Confiabilidad

- **Pérdidas de fijación** (Heijl & Krakau, 1975): estímulo en la mancha ciega nominal (15°, −1.5°). Si el paciente lo ve, no estaba fijando. Probabilidad del 6 % por ensayo.
- **Falsos positivos**: ensayo sin estímulo; cualquier respuesta cuenta. 5 %.
- **Falsos negativos**: estímulo 9 dB más brillante que un umbral ya medido; si no lo ve, cuenta. 4 %.
- **Respuestas fuera de tiempo**: se registran aparte.
- **Mirada con cámara** (opcional, modo pantalla): si al encender el estímulo el ojo está desviado más de 6°, parpadeando o no detectado, el estímulo se descarta y se repite más tarde.
- Límites de aviso: 20 % de pérdidas de fijación, 15 % de falsos positivos y 33 % de falsos negativos.

## Tiempos

Estímulo de 200 ms (configurable: 100 o 300 ms) y ventana de respuesta de 1 500 ms desde el encendido (2 000 ms en velocidad lenta, 1 200 ms en rápida). Las respuestas antes de 150 ms se consideran anticipadas. El intervalo entre estímulos es aleatorio, de 400 a 1 000 ms en velocidad normal. Las pausas no cuentan en la duración del examen.

## Presentación en el visor

- Los estímulos se dibujan a 3 m virtuales y se anclan a la orientación de la cabeza y a la posición del ojo examinado. Así, girar la cabeza no cambia su ubicación en el campo visual, y se corrige el paralaje de la distancia interpupilar.
- El estímulo se dibuja solo en la capa del ojo examinado.
- No se aplica corrección de color: el valor escrito llega tal cual al panel, y la calibración lo traduce a cd/m².

## Referencias

- Heijl A, Krakau CET. An automatic static perimeter, design and pilot study. *Acta Ophthalmol*. 1975;53:293–310.
- King-Smith PE, Grigsby SS, Vingrys AJ, Benes SC, Supowit A. Efficient and unbiased modifications of the QUEST threshold method: theory, simulations, experimental evaluation and practical implementation. *Vision Res*. 1994;34:885–912.
- Turpin A, Artes PH, McKendrick AM. The Open Perimetry Interface: an enabling tool for clinical visual psychophysics. *J Vis*. 2012;12(11):22.
