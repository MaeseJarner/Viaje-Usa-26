# Estado del Proyecto - Road Trip 2026 (Viaje USA)

Fecha: 2026-11-16
Rama actual: `web`

## 1. Estado Actual y Resumen de la Sesión
- Se ha analizado y verificado el funcionamiento técnico de la aplicación y su sistema de cifrado con AES-256-GCM y PBKDF2-SHA256.
- Se han auditado y validado de manera estática los enlaces internos y externos (`tools/check.js`), obteniendo **0 errores** (0 enlaces rotos, 0 IDs duplicados, 0 fallos de formato).
- Se ha preparado un entorno para pruebas locales mediante HTTPS (certificados OpenSSL y script de servidor seguro) para permitir el acceso desde dispositivos móviles en red local sin omitir las restricciones de contexto seguro (`ServiceWorker`, portapapeles, etc.).

## 2. Próximos Pasos Pendientes
- **Prueba en Dispositivo Móvil (Android / Samsung Galaxy):**
  - Levantar el servidor HTTPS local (`python /tmp/serve_https.py`).
  - Acceder desde el móvil a la dirección HTTPS local de desarrollo.
  - Comprobar específicamente el correcto funcionamiento de los **enlaces externos**:
    - Enlaces de **Google Maps** y navegación.
    - Acceso a reservas de **Booking**.
    - Enlaces de **Heymondo** / seguros.
    - Servicios meteorológicos y de peajes (Illinois Tollway / PlatePass).

## 3. Seguridad y Restricciones
- La rama activa es `web`. **No se ha hecho push** ni se ha modificado la rama `gh-pages` en producción.
- Archivos privados y sensibles (`.clave`, directorio `src/data/`, carpeta de compilación `dist/`) se mantienen estrictamente excluidos mediante `.gitignore`.
