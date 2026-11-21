# VoltaNorma
https://nicolasardila2002.github.io/VoltaNorma/

 
Herramienta web para la materia **Generación y Transporte de Energía**. Reúne dos calculadoras en una sola página:
 
1. **Transformadores:** compara tres hipótesis de instalación (poste, pedestal e interior) frente a la normativa colombiana y da consejos para mejorar la conexión.
2. **Vano y flecha:** resuelve el cambio de estado de un conductor aéreo, con temperatura, viento, hielo y desnivel entre apoyos.
No necesita servidor ni instalación: es HTML, CSS y JavaScript puro, y funciona abriendo `index.html`.
 
---
 
## Contenido
 
- [Qué hace](#qué-hace)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Cómo ejecutarlo](#cómo-ejecutarlo)
- [Cómo se usa](#cómo-se-usa)
- [Fórmulas implementadas](#fórmulas-implementadas)
- [Base normativa](#base-normativa)
- [Cómo ampliarlo](#cómo-ampliarlo)
- [Limitaciones](#limitaciones)
---
 
## Qué hace
 
### Pestaña Transformadores
- Entradas con barras sincronizadas con casillas numéricas: potencia, demanda, peso, distancia a la edificación, tensiones, fases, dieléctrico y condiciones del sitio.
- Calcula corriente primaria y secundaria, fusible tipo K y porcentaje de utilización, con alertas de sobrecarga o subutilización.
- Evalúa **3 hipótesis** contra las normas ESSA NTT-01, NTT-02 y NTT-03, con cuatro estados:
  - ✔ cumple
  - ▲ cumple con condiciones
  - ✖ no cumple
  - ◆ requisito que hay que construir
- Puntúa cada hipótesis, marca la recomendada y dibuja un **esquema del montaje**.
- **Asesor normativo:** consejos con la referencia de dónde salen (RETIE, NTC 2050, NTC 2663, NTC 818/819).
### Pestaña Vano y flecha
- Resuelve la ecuación de cambio de estado por método numérico (bisección).
- La tensión conocida puede ser la del estado 1 o la del estado 2.
- Incluye viento (½·ρ·V²·Cd·d), hielo, desnivel Δh, diámetro o área del conductor.
- Entrega tabla comparativa de los dos estados: carga, H, flecha, x₀, y₀, pendientes, tensiones T_A y T_B y altura mínima.
- Muestra el **paso a paso**, el **perfil del vano** y las **curvas de flecha y tensión** entre 0 y 80 °C.
- Botones con los ejercicios de clase precargados.
- Avisos si los datos no son realistas.
### Informe imprimible
Desplegable arriba con **nombre**, **institución** y una casilla opcional **Incluir materia**. Genera una hoja con los datos de entrada, resultados, gráficos y consejos de la pestaña activa, lista para imprimir o guardar como PDF.
 
---
 
## Estructura del proyecto
 
```
voltanorma/
├── index.html   → estructura de la página y pestañas
├── style.css    → diseño responsive, modo claro/oscuro e impresión
├── app.js       → datos normativos, cálculos, gráficos e informe
└── README.md
```
 
Los tres archivos deben estar **en la misma carpeta** y con esos nombres.
 
### Mapa de `app.js`
 
| Bloque | Contenido |
|---|---|
| 1 | Datos normativos: tablas de poste, fusibles, locales |
| 2 | Formulario de transformadores (se genera desde `FIELDS`) |
| 3 | Cálculos eléctricos de la subestación |
| 4 | Hipótesis: `evalPoste`, `evalPedestal`, `evalInterior` |
| 5 | Render de resultados |
| 6 | Módulo de vano: `FIELDS_VANO`, `PRESETS`, `calcVano`, `updateVano` |
| 6b | Perfil, curvas, esquemas e informe |
| 7 | Arranque y pestañas |
 
---
 
## Cómo ejecutarlo
 
1. Descarga la carpeta con los tres archivos.
2. Abre `index.html` en el navegador (doble clic).
**Opción recomendada en VS Code:** instala la extensión **Live Server**, clic derecho sobre `index.html` y *Open with Live Server*. La página se actualiza sola al guardar.
 
Solo necesita internet para cargar las tipografías de Google Fonts. Sin conexión funciona igual con las del sistema.
 
---
 
## Cómo se usa
 
1. Elige la pestaña.
2. Mueve las barras o escribe los valores.
3. Los resultados se recalculan al instante.
4. En *Vano y flecha* puedes pulsar un ejercicio precargado y modificar cualquier dato.
5. Para entregar: abre **Informe imprimible**, llena tus datos y pulsa **Descargar informe**.
---
 
## Fórmulas implementadas
 
**Subestación**
 
- Corriente: `I = S / (√3 · V)` (trifásico) o `I = S / V` (monofásico)
- Capacidad con sobrecarga residencial: `1,25 · S` durante 4 h (NTT-01 5.f)
- Puntaje de hipótesis: `100 − 40 · incumplimientos − 10 · condicionados`
**Conductor**
 
- Peso: `w = m · g`
- Viento: `w_v = ½ · ρ · V² · Cd · d`
- Carga resultante: `w₂ = √((w + hielo)² + w_v²)`
- Rigidez axial: `EA = E · A`
- Cambio de estado:
  `(H₂ − H₁)/EA + α·Δt = (L²/24) · (w₂²/H₂² − w₁²/H₁²)`
- Flecha: `f = w · L² / (8 · H)`
- Parábola: `x₀ = L/2 − H·Δh/(w·L)`, `y₀ = −w·x₀²/(2H)`
- Pendientes: `S_A,B = Δh/L ∓ w·L/(2H)`
- Tensión en apoyos: `T = H · √(1 + S²)`
- Altura mínima: `h_min = h_A + y₀`
---
 
## Base normativa
 
- ESSA **NTT-01** Transformador tipo poste (v01, 2021)
- ESSA **NTT-02** Transformador tipo pedestal, pad mounted (v01, 2021)
- ESSA **NTT-03** Transformador tipo interior (v01, 2021)
- **RETIE**, **NTC 2050**, **NTC 2663**, **NTC 818 y 819**, según las citan esas normas
El módulo de vano se basa en los apuntes de clase de la materia.
 
---
 
## Cómo ampliarlo
 
Casi todo se toca en `app.js`, sin reescribir la lógica:
 
- **Nueva tabla normativa:** agrégala en el bloque 1.
- **Nuevo dato de entrada:** añade una línea en `FIELDS` (transformadores) o `FIELDS_VANO` (vano). El formulario se genera solo.
- **Nueva regla de la norma:** suma una línea `chk(...)` o `req(...)` dentro de la hipótesis que corresponda.
- **Nuevo ejercicio precargado:** agrega una entrada en `PRESETS`.
---
 
## Limitaciones
 
- Es una **ayuda académica**: verifica siempre la versión vigente del RETIE y de las NTC antes de usarla en un diseño real.
- Solo contiene lo que traen los tres PDF de ESSA y los apuntes de clase. Otras normas no están incluidas.
- Con desnivel se usa la misma ecuación de cambio de estado con `L²`, como en los apuntes; no se aplica corrección por inclinación.
- El hielo se suma como carga vertical y no modifica el diámetro del conductor. No se aplican factores de ráfaga ni de altura al viento.
- El criterio de usar hasta el 80 % de la potencia para sugerir el siguiente tamaño es de diseño, no una norma.
- El botón de informe usa la impresión del navegador. En algunos entornos incrustados puede estar bloqueado; en el archivo local funciona.
---
 
## Autor
 
Nombre · Institución · Materia: Generación y Transporte de Energía
 
