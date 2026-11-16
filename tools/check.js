// Comprobaciones estáticas del HTML generado: ids duplicados, enlaces internos rotos y URLs externas.
// Uso: node tools/check.js
'use strict';
const fs = require('fs');
const path = require('path');
// Se excluye el JS en línea: sus plantillas de texto no son HTML real.
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8').replace(/<script>[\s\S]*?<\/script>/g, '');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
const idSet = new Set(ids);
const internal = [...new Set([...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]))];
const broken = internal.filter((h) => h && !idSet.has(h));
const dataH = [...new Set([...html.matchAll(/data-h="#([^"]+)"/g)].map((m) => m[1]))].filter((h) => !idSet.has(h));
const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
const ALLOWED = [
  'illinoistollway.com/paybyplate',
  'www.platepay.com/',
  'budget.e-tolls.com/',
  'open-meteo.com/',
  'forecast.weather.gov/MapClick.php?',
  'www.booking.com/mytrips.html',
  'www.google.com/maps/dir/?api=1&',
  'www.google.com/maps/search/?api=1&',
  'www.ctabustracker.com/',
  'www.transitchicago.com/',
  'secure.booking.com/mytrips.html',
  'www.budget.com/en/locations/us/il/chicago/ord.html',
  'www.iberia.com/es/',
  'apps.apple.com/',
  'play.google.com/store/apps/details?id=',
  'wa.me/34600404606',
];
const badExt = external.filter((u) => !ALLOWED.some((p) => u.startsWith('https://' + p)));
const tels = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]);
const badTel = tels.filter((t) => !/^\+1\d{10}$/.test(t) && !/^\+34\d{9}$/.test(t) && t !== '911');
const leftovers = (html.match(/\*\*/g) || []).length;

console.log(`ids: ${ids.length} · duplicados: ${dup.length ? dup.join(', ') : 0}`);
console.log(`enlaces internos: ${internal.length} · rotos: ${broken.length ? broken.join(', ') : 0}`);
console.log(`data-h rotos: ${dataH.length ? dataH.join(', ') : 0}`);
console.log(`enlaces externos: ${external.length} · fuera de patrón: ${badExt.length ? badExt.slice(0, 5).join(' | ') : 0}`);
console.log(`teléfonos: ${tels.length} · mal formados: ${badTel.length ? badTel.join(', ') : 0}`);
console.log(`marcas ** sin convertir: ${leftovers}`);
if (dup.length || broken.length || dataH.length || badExt.length || badTel.length || leftovers) process.exit(1);
