# Otras pruebas

Todas funcionan en el visor VR y en pantalla. Las que necesitan que cada ojo vea algo distinto (estereopsis, foria, Hess) usan en pantalla **lentes rojo/verde, con el rojo en el ojo derecho**, como el Lancaster clásico. Cada prueba trae un modo **Simular** para ver el informe sin paciente.

Las escaleras adaptativas son bayesianas, tipo QUEST (Watson & Pelli, 1983), con elección forzada. El umbral es el punto medio de la curva psicométrica: 62.5 % de aciertos con 4 alternativas y 75 % con 2. Las pruebas de contraste, color y estereopsis empiezan con 1 o 2 ensayos fáciles para que el paciente entienda qué buscar.

## Agudeza visual

- E de Snellen ("tumbling E") de 5 × 5 trazos, en 4 orientaciones. El paciente indica hacia dónde apuntan las patas.
- Resultado en logMAR, Snellen (20/x y 6/x) y decimal.
- **Límite del equipo:** el trazo no puede ser menor que 1 píxel. Un visor de unos 20 px/° no baja de logMAR ≈ 0.5 (20/63); **no mide 20/20**, y el informe lo avisa si el paciente llega a ese límite. En pantalla, con distancia suficiente (por ejemplo 3 m) sí se mide 20/20; el formulario indica la mejor agudeza medible a la distancia elegida.

## Sensibilidad al contraste

- Parches de Gabor (σ = 1.2°) a 4° a la izquierda o a la derecha del punto de fijación, con elección forzada de 2 alternativas.
- Frecuencias de 1.5, 3, 6, 12 y 18 ciclos/°: solo se usan las que el equipo puede dibujar con al menos 4 píxeles por ciclo. En un visor suelen quedar 1.5 y 3 c/°.
- La luminancia se linealiza con el perfil de calibración y se aplica *dithering* aleatorio, para lograr contrastes menores que un paso de 8 bits.
- Resultado: curva de log CS por frecuencia.

## Rejilla de Amsler

- 20 × 20 cuadros de 1° con un punto central.
- El paciente marca los cuadros **torcidos** o **faltantes o borrosos**: con la palanca y el gatillo en el visor, o con las flechas, la barra espaciadora o un clic en pantalla. El botón A/X o la tecla M cambian el tipo de marca; el botón B/Y o la tecla F terminan.
- El informe muestra la rejilla marcada y el conteo por cuadrante: temporal y nasal según el ojo, y dentro de 2.5° del centro.

## Estereopsis

- Estereogramas de puntos aleatorios: un disco con disparidad cruzada aparece en una de 4 posiciones. Sin visión binocular no se ve, así que no hay pistas monoculares.
- Resultado en segundos de arco; como referencia clínica habitual, 60″ o menos es normal en adultos.
- **Límite del equipo:** se supone que el suavizado permite desplazar los puntos un cuarto de píxel. En un visor eso da un mínimo de unos 45″.

## Visión de colores

- Una C de Landolt formada por puntos que se distingue **solo por el color**. El color cambia la estimulación de un tipo de cono a la vez: L (protan), M (deutan) o S (tritan). El brillo de cada punto varía al azar para quitar pistas de luminancia.
- Se mide el umbral de contraste de cono de cada eje. La lectura es **orientativa**: compara los ejes entre sí, porque no hay base normativa todavía.
- No usa láminas de Ishihara, que tienen derechos de autor.
- Los colores suponen una pantalla sRGB. Sin calibración de color, los valores absolutos son aproximados.

## Foria (Maddox)

- Un ojo ve una luz y el otro una línea. Sin estímulo de fusión, los ojos van a su posición de reposo.
- Se mide en dirección horizontal (línea vertical) y vertical (línea horizontal), 2 veces cada una, de lejos (6 m) y de cerca (40 cm) en el visor, o a la distancia de la pantalla.
- Resultado en dioptrías prismáticas: exoforia, endoforia o hiperforia derecha/izquierda, más la dispersión entre repeticiones.
- **En el visor la acomodación no cambia** con la distancia simulada: la foria de cerca puede diferir de la medida con prismas.

## Hess-Lancaster

- 9 posiciones de mirada a 15°. El ojo fijador ve una marca roja y el otro una cruz verde que el paciente superpone. Después se cambia el ojo fijador.
- Como la imagen está anclada a la cabeza, el paciente mueve solo los ojos.
- El informe muestra el gráfico de cada ojo (cuadro de referencia y cuadro medido) y la desviación en posición primaria y máxima, en dioptrías prismáticas.
- Requiere correspondencia retiniana normal, igual que el examen clásico.

## Pruebas de Oculera que todavía no están

| Prueba | Por qué |
|---|---|
| Pupilometría, cover test objetivo, foria objetiva, motilidad objetiva, videonistagmografía, seguimiento circular | Necesitan medir el ojo directamente (seguimiento ocular); el navegador del visor no lo permite. Requieren una app nativa con OpenXR. |
| Perimetría cinética, FDT | Pendientes; son factibles en el navegador. |
| Lectura, atención continua, clasificación de tarjetas, dislexia, discalculia | Fuera de la oftalmología básica; se pueden agregar después con materiales propios. |
