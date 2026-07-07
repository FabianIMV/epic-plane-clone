# ✈️ Epic Plane Evolution — Clon

Clon libre del juego móvil *Epic Plane Evolution*, hecho desde cero en HTML5 + Canvas + JavaScript puro (sin dependencias, sin build). Todo el código y los gráficos son originales; solo se recrea la mecánica de juego.

## 🎮 Cómo se juega

1. **Catapulta**: arrastra hacia atrás con el mouse o el dedo para cargar potencia y ángulo, y suelta para lanzar (o presiona **ESPACIO** para un lanzamiento rápido a máxima potencia).
2. **Vuelo**: mantén presionado (click, toque o **ESPACIO**) para encender el motor y levantar la nariz. Suelta para planear.
3. **Recoge** 🪙 monedas, ⛽ combustible y 💍 anillos de impulso.
4. **Aterriza**, cobra las monedas + bono por distancia, y **mejora** tu avión en el hangar: catapulta, motor, tanque y alas.
5. Al acumular mejoras, el avión **evoluciona**: avión de papel → planeador → avioneta → jet → cohete.

El progreso se guarda automáticamente en `localStorage`.

## ⚙️ Panel de ajustes (lo tuyo)

Toca el botón **⚙️** (arriba a la derecha) para abrir el panel de ajustes en vivo. Puedes cambiar en cualquier momento, incluso en pleno vuelo:

- **Velocidad del juego** (0.25× a 4×)
- **Gravedad**
- **Potencia de catapulta y motor**
- **Combustible y sustentación (planeo)**
- **Valor de las monedas**
- Trucos: **+1000 monedas** y **combustible infinito**

Los ajustes se guardan solos. Para agregar más parámetros, edita el arreglo `TUNING_DEFS` al inicio de `game.js` — cada entrada genera su slider automáticamente. Los valores base del avión (potencias, costos de mejoras, etc.) están en las funciones `stats()` y `UPGRADE_DEFS` del mismo archivo.

## 🚀 Jugar en local

No necesita servidor: abre `index.html` en el navegador. Si prefieres servirlo:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 🌐 Publicar en GitHub Pages

El repo incluye un workflow de GitHub Actions (`.github/workflows/deploy.yml`) que publica el juego automáticamente. Solo hay que activarlo una vez:

1. En GitHub, ve a **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Haz push a `main` (o corre el workflow a mano desde la pestaña **Actions** → "Deploy a GitHub Pages" → *Run workflow*).

El juego quedará disponible en `https://<tu-usuario>.github.io/epic-plane-clone/`.

## 📁 Estructura

```
index.html   # UI: hangar, HUD, resultados y panel de ajustes
style.css    # estilos
game.js      # motor completo: física, render, mejoras, guardado
.github/workflows/deploy.yml  # despliegue a GitHub Pages
```
