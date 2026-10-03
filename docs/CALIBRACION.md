# Calibración del visor

Sin calibración, la app supone un panel genérico (gamma 2.2, 100 cd/m²) y los dB son solo aproximados. Para obtener resultados comparables entre equipos, calibre cada visor.

## Qué se necesita

- Un fotómetro o colorímetro de luminancia que mida en cd/m² y que pueda apoyarse en la lente del visor (por ejemplo, uno de los usados para calibrar monitores).
- Un soporte que mantenga fijos el visor y el fotómetro.
- El brillo del visor fijo. Desactive el brillo automático y anote el nivel usado: **cualquier cambio de brillo invalida el perfil**.

## Procedimiento

1. Abra la app en el visor: **Calibración → Mostrar niveles en el visor**.
2. Coloque el fotómetro mirando por la lente del ojo derecho, hacia el centro del campo.
3. Para cada nivel (0, 16, 32 … 240, 255), espere a que la lectura se estabilice, anótela y presione el gatillo para pasar al siguiente.
4. En **Nuevo perfil**, escriba las mediciones (`nivel, cd/m²`), póngale un nombre que identifique el equipo y su nivel de brillo, y guárdelo.
5. Seleccione ese perfil en **Nuevo examen**. La app muestra el rango en dB realizable con ese visor.

## Recomendaciones

- Repita la calibración cada pocos meses y siempre que se actualice el sistema del visor.
- Mida también el ojo izquierdo; si hay diferencias de más del 10 %, informe un *issue*.
- Comparta su perfil (archivo JSON) en el repositorio para que otros con el mismo modelo tengan un punto de partida. El perfil compartido nunca reemplaza la calibración propia.
