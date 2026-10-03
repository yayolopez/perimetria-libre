# Base normativa

## Por qué hace falta una propia

MD, PSD, desviación total y desviación patrón comparan al paciente con sujetos sanos **de su edad, examinados en el mismo tipo de equipo**. No sirven las tablas del Humphrey ni del Octopus porque:

- el visor o el monitor tienen otro brillo máximo, otro fondo y otra pantalla;
- el rango en dB es más corto (los defectos profundos quedan como `<16`);
- la óptica del visor y la distancia del monitor cambian la respuesta.

Tampoco existe hoy una base pública de sujetos sanos para visores VR con licencia libre. La idea es construirla entre todos los centros que usen el programa.

## Cómo recolectarla

1. **Sujetos:** sin enfermedad ocular ni neurológica que afecte el campo, agudeza corregida de 20/25 o mejor, refracción entre −5 y +5 D, PIO normal y fondo de ojo normal. Excluir a quien tenga antecedentes de glaucoma en la familia directa, si se quiere ser estricto.
2. **Edades:** de 20 a 80 años o más, idealmente **10 o más por década**. Con menos de 60 sujetos los límites de probabilidad son poco confiables.
3. **Un ojo por sujeto,** elegido al azar. El programa refleja los ojos izquierdos para compararlos con los derechos.
4. **Mismo equipo y configuración:** mismo modelo de visor (o monitor y distancia), mismo perfil de luminancia, patrón y tamaño de estímulo. Cada combinación es una base distinta.
5. **Experiencia:** hacer una prueba de práctica antes, porque el primer campo de la vida suele salir peor (efecto aprendizaje). Guardar solo el segundo.
6. **Confiabilidad:** descartar exámenes con más de 20 % de pérdidas de fijación o más de 15 % de falsos positivos.
7. Marcar cada examen como **Sujeto normal**, en el formulario o en el Historial.

## Cómo la calcula el programa

Para cada punto: `umbral esperado = intercepto + pendiente × (edad − 50)`.

- Con pocos datos se usa una **pendiente de edad común** a todos los puntos, más estable. Con 30 o más sujetos y un rango de edades de 30 años o más, cada punto tiene su propia pendiente.
- La **DE** por punto es la de los residuos. Con ella se calculan las probabilidades de cada punto (p < 5, 2, 1 y 0.5 %), suponiendo una distribución normal.
- **Altura general:** el 7.º mejor valor de desviación total en 52 puntos (percentil 85).
- **Desviación patrón:** desviación total − altura general. Su DE se estima en los mismos sujetos normales.
- **MD:** media de la desviación total, ponderada por 1/DE². **PSD:** dispersión ponderada alrededor de la MD. Sus valores de p salen de la distribución de MD y PSD en los propios sujetos normales.
- Los valores censurados (`<` o `≥`) no se usan para construir la base.

## Compartir

En **Base normativa → Exportar** se genera un archivo JSON **sin datos personales**: solo coeficientes por punto, número de sujetos y rango de edad. Súbalo al repositorio del proyecto para que otros centros con el mismo visor puedan usarlo y, más adelante, combinar los datos.

## Limitaciones actuales

- La suposición de normalidad es una aproximación; con muchos sujetos convendría usar percentiles empíricos.
- No se calculan todavía GHT ni VFI.
- Mientras no exista una base publicada y validada, los índices son para investigación.
