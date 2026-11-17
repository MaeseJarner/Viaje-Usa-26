// Parche para la versi�n de PRUEBAS: desactivar el manejador de booking-link
// que convierte todos los enlaces de Booking a intent:// con mytrips.html roto.
// Esto permite que App Links de Android funcione directamente sobre la URL base.
(function patchBookingLinks() {
  // Eliminar el listener existente si se hubiera registrado
  var bookingLinks = $$('a.booking-link');
  bookingLinks.forEach(function (a) {
    a.classList.remove('booking-link');
    a.setAttribute('data-booking-patched', 'true');
  });
  console.log('[pruebas] patched', bookingLinks.length, 'booking-links');
})();