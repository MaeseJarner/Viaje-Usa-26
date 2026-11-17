# Guía rápida: Bóveda de enlaces privados (Pruebas)

## Abrir desde tu Samsung

1. Sirve la carpeta `pruebas/dist/` mediante HTTPS. Opciones:
   - **VS Code + Live Server** (`http://localhost:5500/pruebas/dist`) — solo en el mismo dispositivo WiFi que el PC.
   - **npx serve** en ese directorio y luego acceder vía IP local (ej. `http://192.168.1.X:3000`).
   - Subirlo al servidor de pruebas existente que ya aloja `/pruebas/`.

2. Abre Chrome → abre DevTools → marca "Simular pantalla de apagado" si quieres ver PWA real.  
   Al tocar **"Añadir a la pantalla principal"** aparece como app independiente (PWA).

## Crear contraseña por primera vez

1. Ve a cualquier día del itinerario → toca un hotel (H1–H12).
2. Bajo los botones normales verás **"Añadir enlace privado"** si aún no hay URL cifrada.
3. Toca ese botón → se abre un panel emergente con un campo *"Contraseña maestra"* y un botón **Crear bóveda**.
4. Escribe una contraseña larga (mínimo 8 caracteres; cuanto más larga, más segura). Repítela para confirmar.
5. Pulsa **Crear bóveda**. La app te avisa: *"Bóveda creada. Ya puedes añadir tus reservas."*

Si prefieres entrar directamente por el menú:
- Toca **Más** (ícono ☰) → **Enlaces privados Booking** → te pedirá crear o desbloquear.

## Añadir la URL de una reserva

1. Entra en Booking.com → inicio de sesión → *Mis reservas*.
2. Abre cada reserva y copia la **URL completa** (incluye `auth_key=...`; es lo único que necesitas).
3. En la bóveda pulsa **Añadir enlace** junto al hotel correspondiente.
4. Se abre un modal donde pegas la URL y pulsas **Guardar enlace**.
5. Ahora en la ficha del hotel aparecerá el botón verde **"Ver mi reserva"** que abre la URL cifrada.

También puedes abrir la lista completa de hoteles (`#bodega` en la URL o desde Más) y añadir desde ahí.

## Probar las funciones avanzadas

| Función | Cómo |
|---|---|
| **Cambiar contraseña** | Desde el panel de bóveda > **Cambiar contraseña** > nueva y repetida. |
| **Exportar copia cifrada** | Desde el panel de bóveda > **Exportar datos** → descarga `reservas-enc.txt` (JSON cifrado). Úsalo en otro dispositivo para restaurar sin compartir contraseñas en texto plano. |
| **Importar desde copia** | Desde el panel > **Importar datos** > selecciona el archivo exportado. |
| **Bloquear manualmente** | Desde el panel > **Bloquear bóveda**. |
| **Timeout 15 min** | Cierra pestaña o espera 15 min sin actividad; al volver a abrir pide contraseña de nuevo. |
| **Eliminar reserva** | En el listado de hoteles > botón rojo **Eliminar** junto a la fila. |

## Prueba cruzada de seguridad (lo deseable que debería pasar)

- **Producción vs. pruebas**: en `dist/index.html` no debe haber ninguna `auth_key` (verificado). Si abres la versión de producción (`src/`) sigue sin estar.
- **IndexedDB aislada**: el nombre de DB es `rt26-bodega-test`; la producción usa `rt26` → no hay mezcla.
- **Ningún elemento del DOM muestra la contraseña ni la clave**. El atributo `key` solo vive en memoria.
- **Si recargas la página y vuelves en <15 min**, la bóveda permanece desbloqueada (persistencia en RAM durante sesión).
