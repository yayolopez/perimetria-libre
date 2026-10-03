# Campimetría en un monitor

## 1. Calibrar la pantalla (una vez por equipo)

**Calibración → Calibración de la pantalla.** Apoye una tarjeta bancaria (85.6 × 54 mm) sobre el rectángulo y mueva el control hasta que coincidan. Con eso el programa sabe cuántos píxeles hay por milímetro.

Para que la luminancia sea correcta también conviene medir el monitor con un fotómetro ([CALIBRACION.md](CALIBRACION.md)). Mantenga fijo el brillo y desactive el brillo automático y el modo nocturno.

## 2. Distancia

El programa calcula la **mayor distancia** a la que el patrón entra completo en la pantalla, con un máximo de 50 cm. La fijación se corre del centro para aprovechar todo el monitor; por ejemplo, en el 24-2 se corre hacia el lado temporal, porque el escalón nasal llega a 27°.

Referencias aproximadas para el 24-2:

| Monitor | Distancia máxima |
|---|---|
| 24″ (53 × 30 cm) | ~36 cm |
| 27″ (60 × 34 cm) | ~41 cm |
| 32″ (71 × 40 cm) | ~48 cm |
| Laptop 14″ (31 × 17 cm) | ~20 cm: demasiado cerca; use el 10-2 |

El 10-2 entra en casi cualquier pantalla a 30–50 cm.

**Use una mentonera o apoyo de frente** para mantener la distancia. Si el paciente se acerca o se aleja, los ángulos cambian. La cámara puede estimar la distancia y mostrarla en el monitor.

## 3. Corrección óptica

A esa distancia el paciente necesita su corrección de lejos **más una adición de cerca**. El programa sugiere la adición según la edad (`1/distancia − amplitud de acomodación disponible`), por ejemplo +3.00 D a 33 cm para mayores de 60 años. Use lentes de prueba de montura completa, bien centrados, para no generar escotomas por el aro.

En el **visor VR** no hace falta adición, porque la imagen se enfoca a 1–2 m: solo se usa la corrección de lejos.

## 4. Tapar el otro ojo

En pantalla los dos ojos ven lo mismo, así que **hay que ocluir el ojo no examinado** con un parche translúcido. En el visor no hace falta.

## 5. Vigilancia de mirada con la cámara (experimental)

Active **Vigilar mirada con la cámara** en las opciones. Con la cámara web, el programa:

- calibra la posición del ojo mientras el paciente mira la fijación;
- en cada estímulo mide si el ojo se desvió más de 6°, si parpadeó o si no se detecta el ojo; en esos casos **descarta el estímulo y lo repite más tarde**;
- estima la distancia ojo-cámara por el tamaño del iris;
- grafica todo en el informe, como el *gaze tracker* de un campímetro.

Funciona con MediaPipe dentro del navegador: **las imágenes no salen del equipo**. Su precisión es de varios grados: detecta pérdidas de fijación groseras, pero no reemplaza un seguimiento ocular profesional. La cámara debe estar centrada arriba del monitor y la cara bien iluminada.

## 6. Monitor del operador

Abra **Abrir monitor** en otra ventana o en un segundo monitor del mismo equipo, o en otro equipo usando el código. Desde ahí ve el cronómetro, el progreso, los controles y el mapa en vivo, y puede pausar o detener sin tocar la pantalla del paciente. Si la ventana del examen queda oculta, el examen se pausa solo.
