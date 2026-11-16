# Road Trip · app privada para el móvil

App web instalable (PWA) con la guía de un viaje. La versión publicada (`docs/`) está cifrada con AES-256-GCM:
sin la contraseña no se puede leer nada. Funciona sin conexión una vez abierta.

## Estructura
- `src/datos.cifrados.json`: datos del viaje, cifrados con la misma contraseña.
- `src/data/` (no se publica): datos en claro; se recuperan con `node tools/descifrar-datos.js`.
- `build.js`: genera la app sin cifrar en `dist/` (no se publica).
- `publish.js`: genera `docs/` (pantalla de acceso + app cifrada + service worker + iconos) y actualiza los datos cifrados.
- `src/lock.html`: pantalla de acceso; recuerda la clave en el móvil (IndexedDB, clave no extraíble).
- `tools/check.js`: comprueba ids duplicados, enlaces internos y teléfonos de `dist/index.html`.

## Actualizar
```
RT26_CLAVE='…' node tools/descifrar-datos.js   # solo en una copia nueva del repositorio
RT26_CLAVE='…' node publish.js && node tools/check.js
```
La contraseña también puede ir en un archivo `.clave` (está en `.gitignore`). Sin ella no se pueden actualizar los datos.

## Publicar en GitHub Pages
Settings → Pages → «Deploy from a branch» → rama con `docs/` → carpeta `/docs`.
