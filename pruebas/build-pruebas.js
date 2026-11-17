#!/usr/bin/env node
// Build para la versión de PRUEBAS en /pruebas/
// Usa datos ficticios y corrige enlaces externos problemáticos
// NO modifica archivos de produccion (src/, build.js, etc.)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cargar datos de produccion (estructura) pero sobrescribir enlaces externos
const meta = require('../src/data/meta');
const days1 = require('../src/data/days1');
const days2 = require('../src/data/days2');
const annex = require('../src/data/annex');
const weather = require('../src/data/weather');
const artLib = require('../src/data/art');
const { drawIcon } = require('../src/icons');

const days = [...days1, ...days2];

// ---------- utilidades ----------
const esc = (s) => {
  const map = [['&', '&'], ['<', '<'], ['>', '>'], ['"', '"'], ["'", "'"]];
  for (const [c, r] of map) s = s.split(c).join(r);
  return s;
};
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const attr = (s) => esc(s);

const WD = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
const longDate = (iso) => {
  const p = parseISO(iso);
  return `${cap(WD[p.wd])} ${p.d} de ${MO[p.m - 1]}`;
}
const shortDate = (iso) => {
  const p = parseISO(iso);
  return `${cap(WD[p.wd].slice(0, 3))} ${p.d} ${MO[p.m - 1].slice(0, 3)}`;
}
const OFFSET_H = { CT: 6, ET: 5, ES: -1 };
function toUtc(iso, hh, mm, tz) {
  const p = parseISO(iso);
  return Date.UTC(p.y, p.m - 1, p.d, hh + OFFSET_H[tz], mm);
}
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const tel = (p) => 'tel:' + p.replace(/[^+\d]/g, '');
const dirUrl = (q, mode) =>
  'https://www.google.com/maps/dir/?api=1&destination=' +
  encodeURIComponent(q) +
  (mode === 'w' ? '&travelmode=walking' : mode === 't' ? '&travelmode=transit' : '');
const searchUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

// ===== CORRECCIONES DE ENLACES EXTERNOS PARA PRUEBAS =====
// Booking: URL valida para App Links (no mytrips.html que da 404)
// Usamos la home de booking.com que si tiene App Links configurados en Android
const BOOKING_URL = 'https://www.booking.com';
// bookingBtn SIN clase 'booking-link' para que NO sea interceptado por el intent de app.js
// Asi el SO Android gestiona el App Link nativamente
const bookingBtn = (label = 'Abrir Booking') => `<a class="btn" href="${BOOKING_URL}" target="_blank" rel="noopener">${label}</a>`;

// Heymondo: probar URL web que podria funcionar como App Link
// https://app.heymondo.com es su aplicacion web
const HEYMONDO_URL = 'https://app.heymondo.com';
const heymondoBtn = (label) => `<a class="btn" href="${HEYMONDO_URL}" target="_blank" rel="noopener">${label}</a>`;

// My CityPASS: probar URL web
// https://my.citypass.com es su portal web
const CITYPASS_URL = 'https://my.citypass.com';
const citypassBtn = (label) => `<a class="btn" href="${CITYPASS_URL}" target="_blank" rel="noopener">${label}</a>`;

const linkAttrs = (u) => (/^(tel:|#)/.test(u) ? '' : ' target="_blank" rel="noopener"');
const docHref = (u) => (u.startsWith('MAP:') ? searchUrl(u.slice(4)) : u === 'BOOKING' ? BOOKING_URL : u);
const copyBtn = (code) => `<button type="button" class="copy" data-copy="${attr(code)}">Copiar</button>`;

// Datos de documentos MODIFICADOS para pruebas (enlaces externos corregidos)
const docsPruebas = [
  {
    id: 'doc-vuelos',
    title: 'Vuelos · Iberia (Prueba)',
    rows: [
      ['Ida', '**IB341** · sabado 21/11 · sale 12:00 · llega 14:55'],
      ['Vuelta', '**IB342** · martes 08/12 · sale 17:40 · llega 08:50+1'],
      ['ESTA', 'Aprobadas (datos ficticios).'],
      ['Check-in', 'En app Iberia 24h antes.'],
    ],
    codes: [['Localizador', 'TEST123']],
    links: [['Abrir Iberia', 'https://www.iberia.com/es/']],
  },
  {
    id: 'doc-coche',
    title: 'Coche · Budget (Prueba)',
    rows: [
      ['Oficina', 'Chicago O\'Hare (ficticio)'],
      ['Recogida', 'Sabado 21/11, 16:15'],
      ['Devolucion', 'Martes 08/12, 12:30'],
    ],
    codes: [['Reserva', 'TEST-CAR-456']],
    links: [
      ['Oficina Budget', 'https://www.budget.com/'],
      ['Mapa', 'MAP:Chicago O\'Hare Airport, Chicago, IL'],
    ],
  },
  {
    id: 'doc-hoteles',
    title: 'Hoteles · Booking (Prueba)',
    rows: [
      ['Reservas', 'Todas en cuenta de prueba. Botón abre app/web Booking.'],
      ['Parking', 'Gratuito en hoteles de prueba.'],
    ],
    codes: [],
    // CORRECCION: Usa bookingBtn sin clase booking-link
    links: [['Abrir la app de Booking', 'BOOKING']],
  },
  {
    id: 'doc-entradas',
    title: 'Entradas · CityPASS (Prueba)',
    rows: [
      ['CityPASS', 'En app My CityPASS: atracciones de prueba.'],
      ['Reservadas', 'Museos y tours ficticios.'],
    ],
    codes: [],
    // CORRECCION: Usa citypassBtn en lugar de enlaces a store
    links: [
      ['My CityPASS (web)', CITYPASS_URL],
      ['My CityPASS para iPhone', 'https://apps.apple.com/us/app/1612279736/id1612279736'],
      ['My CityPASS para Android', 'https://play.google.com/store/apps/details?id=com.citypass.my'],
    ],
  },
  {
    id: 'doc-seguro',
    title: 'Seguro · Heymondo (Prueba)',
    rows: [
      ['Emergencia', 'Llamar 911 (EE.UU.) y avisar a Heymondo.'],
      ['Asistencia 24h', '+34 915 724 374 o chat en app.'],
      ['WhatsApp', '+34 600 40 46 06 (solo texto).'],
    ],
    codes: [['Poliza', 'TEST-POL-789']],
    // CORRECCION: Anade boton a web app de Heymondo
    links: [
      ['Llamar asistencia', 'tel:+34915724374'],
      ['Llamar 911', 'tel:911'],
      ['Heymondo (web app)', HEYMONDO_URL],
      ['Heymondo para iPhone', 'https://apps.apple.com/es/app/heymondo-seguros-de-viaje/id1461458343'],
      ['Heymondo para Android', 'https://play.google.com/store/apps/details?id=es.heymondo'],
    ],
  },
  {
    id: 'doc-datos',
    title: 'Datos moviles (Prueba)',
    rows: [['eSIM', '2 eSIM de prueba. Instalar antes de salir.']],
    codes: [],
    links: [],
  },
];

const hotelById = Object.fromEntries(annex.hotels.map((h) => [h.id, h]));
const gasById = Object.fromEntries(annex.gas.map((g) => [g.id, g]));
const hotelQuery = (h) => (h.address ? `${h.name}, ${h.address}` : h.mapQuery);
const gasQuery = (g) => `${g.name}, ${g.address}`;

function resolveMap(ref) {
  if (/^H\d+$/.test(ref)) {
    if (!hotelById[ref]) throw new Error('Hotel inexistente: ' + ref);
    return hotelQuery(hotelById[ref]);
  }
  if (/^G\d+$/.test(ref)) {
    if (!gasById[ref]) throw new Error('Gasolinera inexistente: ' + ref);
    return gasQuery(gasById[ref]);
  }
  return ref;
}

const ICON = {
  hoy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dias: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  hoteles: '<path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  sitios: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  mas: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  car: '<path d="M3 17v-4l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v4h-3v-2H6v2z"/><path d="M3 13h18"/><circle cx="7" cy="15" r=".6"/><circle cx="17" cy="15" r=".6"/>',
  walk: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7.5v5.5l-3 8M12 13l3 8M8 11l4-3 4 3"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 11h14M8 21v-3M16 21v-3"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>',
  swap: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  docs: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 5v12" stroke-dasharray="2 2"/>',
  tiempo: '<path d="M8 3v1.5M3.4 5.4l1 1M2 10h1.5M13.6 5.4l-1 1"/><path d="M5.6 10.6a3 3 0 0 1 5.6-2.4"/><path d="M8 20a4 4 0 0 1-.3-8 6 6 0 0 1 11.3 1.5A3.3 3.3 0 0 1 18.5 20z"/>',
};
const svg = (name, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const CHIP = { ok: 'Confirmado', pend: 'Sin confirmar', opt: 'Opcional' };
const chip = (tag) => (tag ? ` <span class="chip ${tag}">${CHIP[tag]}</span>` : '');
const ext = 'target="_blank" rel="noopener"';

// ---------- horarios ----------
function buildTimeline(day) {
  let ctx = day.tz;
  const items = day.schedule.map(([t, a, o = {}], i) => {
    const ms = [...t.matchAll(/(\d{1,2}):(\d{2})(?:\s*(CT|ET))?/g)];
    if (!ms.length) throw new Error(`Hora no valida en ${day.date}: ${t}`);
    const z1 = ms[0][3];
    const z2 = ms[1] && ms[1][3];
    const zs = o.tz || z1 || z2 || ctx;
    const ze = o.tz || z2 || z1 || ctx;
    if (!o.tz) ctx = ze;
    const shift = o.nextDay ? 86400000 : 0;
    const s = toUtc(day.date, +ms[0][1], +ms[0][2], zs) + shift;
    let e = ms[1] ? toUtc(day.date, +ms[1][1], +ms[1][2], ze) + shift : null;
    if (e !== null && e <= s) throw new Error(`Fin anterior al inicio en ${day.date}: ${t}`);
    if (o.tag && !CHIP[o.tag]) throw new Error('Etiqueta desconocida: ' + o.tag);
    return { i, t, a, o, s, e };
  });
  items.forEach((it, i) => {
    if (it.e === null) {
      const nx = items.slice(i + 1).find((n) => n.s > it.s);
      it.e = nx ? nx.s : it.s + 60 * 60000;
    }
  });
  return { items, endTz: ctx };
}

// ---------- vistas ----------
function renderTimeline(day, items) {
  const ctxLabel = shortDate(day.date);
  return (
    '<ol class="tl">' +
    items
      .map((it) => {
        const id = `d-${day.date}-${it.i + 1}`;
        const go = it.o.map
          ? `<a class="go" href="${attr(dirUrl(resolveMap(it.o.map), it.o.mode))}" ${ext} aria-label="Como llegar">Ir</a>`
          : '<span></span>';
        return (
          `<li class="ti srch${it.o.tag ? ' tag-' + it.o.tag : ''}" id="${id}" data-s="${it.s}" data-e="${it.e}" data-c="${attr(ctxLabel + ' · ' + it.t)}" data-h="#${id}">` +
          `<span class="tm">${esc(it.t)}</span><div class="ac st">${md(it.a)}${chip(it.o.tag)}</div>${go}</li>`
        );
      })
      .join('') +
    '</ol>'
  );
}

function renderRestaurant(r, idx, withDate) {
  const q = r.address ? `${r.name}, ${r.address}` : r.mapQuery;
  const where = r.address || r.where || '';
  return (
    `<div class="card rest srch" id="R${idx + 1}" data-c="${attr('Comer · ' + shortDate(r.date) + ' · ' + r.area)}" data-h="#R${idx + 1}">` +
    `<p class="eyebrow">${withDate ? esc(shortDate(r.date)) + ' · ' : ''}${esc(r.area)}</p>` +
    `<h4 class="st">${esc(r.name)}</h4>` +
    (where ? `<p class="addr">${esc(where)}</p>` : '') +
    `<dl class="kv"><dt>Que pedir</dt><dd>${md(r.order)}</dd><dt>Alternativa</dt><dd>${md(r.alt)}</dd>` +
    (r.fit ? `<dt>Encaje</dt><dd>${md(r.fit)}</dd>` : '') +
    `<dt>Reservar?</dt><dd>${md(r.reserve)}</dd></dl>` +
    (q ? `<div class="actions"><a class="btn" href="${attr(searchUrl(q))}" ${ext}>Mapa</a><a class="btn" href="${attr(dirUrl(q))}" ${ext}>Ruta</a></div>` : '') +
    '</div>'
  );
}

function renderGas(g, withLink) {
  return (
    `<div class="card gas srch" id="${withLink ? '' : 'x-'}${g.id}" data-c="${attr('Gasolinera · ' + shortDate(g.date))}" data-h="#${g.id}">` +
    `<p class="eyebrow">${g.id} · ${esc(shortDate(g.date))}</p><h4 class="st">${esc(g.name)}</h4>` +
    `<p class="addr">${esc(g.address)}</p><p><strong>Acceso:</strong> ${esc(g.access)}</p><p>${md(g.when)}</p>` +
    `<div class="actions"><a class="btn" href="${attr(searchUrl(gasQuery(g)))}" ${ext}>Mapa</a><a class="btn" href="${attr(dirUrl(gasQuery(g)))}" ${ext}>Ruta</a></div></div>`
  );
}

function renderHotel(h) {
  const q = hotelQuery(h);
  // Verificar enlace privado con __BV API (solo funciona cuando la bóveda está cargada y desbloqueada)
  const privLink = typeof __BV !== 'undefined' ? __BV.getLink(h.id) : null;
  const hasPriv = !!privLink;
  return (
    `<div class="card hotel srch${h.missing ? ' warn' : ''}" id="${h.id}" data-c="${attr('Hotel · noches ' + h.nights)}" data-h="#${h.id}">` +
    `<p class="eyebrow">${h.id} · Noches ${esc(h.nights)}</p><h3 class="st">${esc(h.name)}</h3>` +
    `<p class="addr">${esc(h.address || h.area)}</p>` +
    (h.missing ? '<p class="missing">Falta direccion exacta (datos de prueba).</p>' : '') +
    `<p>${md(h.info)}</p><div class="actions">` +
    (h.phone ? `<a class="btn" href="${tel(h.phone)}">Llamar ${esc(h.phone)}</a>` : '') +
    (h.noBooking
      ? ''
      : (hasPriv
          ? `<a class="btn" href="${attr(privLink)}" target="_blank" rel="noopener">Ver mi reserva</a>`
          : bookingBtn('Reserva en Booking'))) +
    (!h.noBooking
      ? `<button type="button" class="btn bv-link-btn" data-hotel-id="${attr(h.id)}">${hasPriv ? '✏ Cambiar enlace privado' : '🔗 Añadir enlace privado'}</button>`
      : ''),
    `<a class="btn" href="${attr(searchUrl(q))}" ${ext}>Mapa</a><a class="btn" href="${attr(dirUrl(q))}" ${ext}>Ruta</a></div></div>`
  );
}

const modeIcon = (m) => svg(/CTA|Shuttle|Tren/.test(m) ? 'bus' : /^Pie$/.test(m) ? 'walk' : /Coche/.test(m) ? 'car' : 'swap', 20);

function renderDocs() {
  return (
    '<section class="view" id="documentos" data-tab="mas" data-back="#mas" data-title="Documentos"><h2>Documentos y reservas (Prueba)</h2>' +
    '<p class="note">Version de prueba con enlaces externos corregidos. Toca \"Copiar\" para copiar codigos.</p>' +
    docsPruebas
      .map(
        (d) =>
          `<div class="card doc srch" id="${d.id}" data-c="Documentos" data-h="#${d.id}"><h3 class="st">${esc(d.title)}</h3>` +
          (d.codes.length
            ? '<ul class="codes">' +
              d.codes.map(([l, c]) => `<li><span>${esc(l)}</span><b class="code">${esc(c)}</b>${copyBtn(c)}</li>`).join('') +
              '</ul>'
            : '') +
          '<dl class="kv">' +
          d.rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${md(b)}</dd>`).join('') +
          '</dl><div class="actions">' +
          d.links
            .map(([l, u]) => {
              if (u === 'BOOKING') return bookingBtn(esc(l));
              if (u === HEYMONDO_URL) return heymondoBtn(esc(l));
              if (u === CITYPASS_URL) return citypassBtn(esc(l));
              return `<a class="btn" href="${attr(docHref(u))}"${linkAttrs(u)}>${esc(l)}</a>`;
            })
            .join('') +
          '</div></div>'
      )
      .join('') +
    '<div id="doc-resumen" hidden><ul class="codes">' +
    docsPruebas
      .flatMap((d) => d.codes.map(([l, c]) => `<li><span>${esc(d.title.split(' · ')[1] || d.title)} · ${esc(l)}</span><b class="code">${esc(c)}</b>${copyBtn(c)}</li>`))
      .join('') +
    '</ul></div></section>'
  );
}

function renderDay(day, idx, tl) {
  const dates = days.map((d) => d.date);
  const prev = dates[idx - 1];
  const next = dates[idx + 1];
  const h = day.hotel ? hotelById[day.hotel] : null;
  if (day.hotel && !h) throw new Error('Hotel inexistente: ' + day.hotel);
  const dayStart = Math.min(toUtc(day.date, 0, 0, day.tz), ...tl.items.map((it) => it.s));
  const dayEnd = Math.max(toUtc(day.date, 24, 0, tl.endTz), ...tl.items.map((it) => it.e));
  const rests = annex.restaurants.map((r, i) => [r, i]).filter(([r]) => r.date === day.date);
  const gas = annex.gas.filter((g) => g.date === day.date);
  return (
    `<section class="view day" id="d-${day.date}" data-tab="dias" data-back="#dias" data-title="${attr(shortDate(day.date))}" data-day="${day.date}" data-ds="${dayStart}" data-de="${dayEnd}" data-hotel="${day.hotel || ''}" data-n="${idx + 1}">` +
    `<header class="dh">${artLib.useArt(day.date, 'dh-art')}<div class="dh-text"><p class="eyebrow">Dia ${idx + 1} de ${days.length} · ${esc(longDate(day.date))}</p>` +
    `<h2>${esc(day.title)}</h2><p class="route">${esc(day.route)}</p>` +
    `<p class="night">Noche: ${h ? `<a href="#${h.id}">${esc(h.name)}</a>` : esc(day.nightLabel || '—')}</p>` +
    (day.tzNote ? `<p class="tznote">${esc(day.tzNote)}</p>` : '') +
    '</div></header>' +
    `<a class="wxlink" href="#tiempo" data-wx-day="${day.date}">El tiempo: ${esc((weather.days[day.date] || []).map((id) => weather.cities.find((c) => c.id === id).name.split(',')[0]).join(' · '))}</a>` +
    `<nav class="daynav">${prev ? `<a href="#d-${prev}">‹ ${esc(shortDate(prev))}</a>` : '<span></span>'}${next ? `<a href="#d-${next}">${esc(shortDate(next))} ›</a>` : '<span></span>'}</nav>` +
    '<h3>Horario</h3>' +
    renderTimeline(day, tl.items) +
    `<div class="late"><strong>Si vais retrasados:</strong> ${md(day.ifLate)}</div>` +
    '<h3>Claves y reservas</h3><ul class="keys">' +
    day.keys.map((k) => `<li>${md(k)}</li>`).join('') +
    '</ul>' +
    '<h3>Comidas del dia</h3><ul class="meals">' +
    day.meals.map(([l, t]) => `<li><strong>${esc(l)}:</strong> ${md(t)}</li>`).join('') +
    '</ul>' +
    (rests.length
      ? `<details class="more"><summary>Restaurantes: que pedir y reservas (${rests.length})</summary>${rests
          .map(([r, i]) => renderRestaurant(r, i, false).replace(/ id="R\d+"/, '').replace(' srch', ''))
          .join('')}</details>`
      : '') +
    `<h3>Combustible y descansos</h3><p>${md(day.fuel)}</p>` +
    (gas.length
      ? `<details class="more"><summary>Gasolineras del dia (${gas.map((g) => g.id).join(', ')})</summary>${gas
          .map((g) => renderGas(g, false).replace(' srch', ''))
          .join('')}</details>`
      : '') +
    '<h3>Traslados y tiempos aproximados</h3>' +
    (day.transfersNote ? `<p class="note">${md(day.transfersNote)}</p>` : '') +
    '<ul class="tr">' +
    day.transfers
      .map(
        ([od, m, dist, dur, obs]) =>
          `<li><span class="tr-i" aria-hidden="true">${modeIcon(m)}</span><div><strong>${esc(od)}</strong><span class="tr-m">${esc(m)} · ${esc(dist)} · ${esc(dur)}</span>${obs ? `<small>${esc(obs)}</small>` : ''}</div></li>`
      )
      .join('') +
    '</ul></section>'
  );
}

function renderDayList() {
  return (
    '<section class="view" id="dias" data-tab="dias" data-title="Itinerario"><h2>Itinerario dia a dia (Prueba)</h2><ol class="daylist">' +
    days
      .map((d, i) => {
        const p = parseISO(d.date);
        const h = d.hotel ? hotelById[d.hotel].name : d.nightLabel;
        return (
          `<li><a href="#d-${d.date}" data-day="${d.date}"><span class="dl-date">${artLib.useArt(d.date, 'dl-art')}<small>${WD[p.wd].slice(0, 3)}</small><b>${p.d}</b><small>${MO[p.m - 1].slice(0, 3)}</small></span>` +
          `<span class="dl-body"><b>${esc(d.title)}</b><small>${esc(d.route)}</small><small class="dl-night">${svg('hoteles', 14)} ${esc(h)}</small></span></a></li>`
        );
      })
      .join('') +
    '</ol></section>'
  );
}

function renderHotels() {
  return (
    '<section class="view" id="hoteles" data-tab="hoteles" data-title="Hoteles"><h2>Hoteles (Prueba)</h2>' +
    `<p class="note">${md(annex.hotelsNote)}</p><div class="actions">${bookingBtn('Abrir Booking (Mis viajes)')}</div>` +
    annex.hotels.map(renderHotel).join('') +
    '<h3>Aparcamientos relevantes</h3><ul class="keys">' +
    annex.parking
      .map(
        (p) =>
          `<li><strong>${esc(p.place)}:</strong> ${md(p.text)}${p.map ? ` <a href="${attr(searchUrl(p.map))}" ${ext}>Mapa</a>` : ''}</li>`
      )
      .join('') +
    '</ul></section>'
  );
}

const seg = (on) =>
  '<nav class="seg">' +
  [
    ['comer', 'Comer'],
    ['visitas', 'Visitas'],
    ['gasolina', 'Gasolina'],
  ]
    .map(([id, l]) => `<a href="#${id}"${id === on ? ' class="on"' : ''}>${l}</a>`)
    .join('') +
  '</nav>';

function groupByDate(list, render) {
  let out = '';
  let last = null;
  list.forEach((x, i) => {
    if (x.date !== last) {
      out += `<h3 class="dategrp"><a href="#d-${x.date}">${esc(longDate(x.date))}</a></h3>`;
      last = x.date;
    }
    out += render(x, i);
  });
  return out;
}

function renderSitios() {
  const comer =
    '<section class="view" id="comer" data-tab="sitios" data-title="Comer">' +
    seg('comer') +
    `<h2>Restaurantes por dia (Prueba)</h2><p class="note">${md(annex.restaurantsNote)}</p>` +
    groupByDate(annex.restaurants, (r, i) => renderRestaurant(r, i, false)) +
    '</section>';
  const visitas =
    '<section class="view" id="visitas" data-tab="sitios" data-title="Visitas">' +
    seg('visitas') +
    `<h2>Lugares, visitas y tiendas (Prueba)</h2><p class="note">${md(annex.placesNote)}</p>` +
    groupByDate(annex.places, (p, i) => {
      const q = p.mapQuery || `${p.name}, ${p.address}`;
      const st = p.status
        ? ` · <span class="pst${/NO CONFIRMADA/.test(p.status) ? ' pendc' : /CONFIRMADA|RESERVADA|evento/.test(p.status) ? ' okc' : ''}">${esc(p.status)}</span>`
        : '';
      return (
        `<div class="place srch" id="P${i + 1}" data-c="${attr('Visita · ' + shortDate(p.date) + ' · ' + p.time)}" data-h="#P${i + 1}">` +
        `<div><strong class="st">${esc(p.name)}</strong><small>${esc(p.time)}${st}</small><small class="addr">${esc(p.address)}</small></div>` +
        (p.noMap ? '' : `<a class="go" href="${attr(searchUrl(q))}" ${ext}>Mapa</a>`) +
        '</div>'
      );
    }) +
    '</section>';
  const gasolina =
    '<section class="view" id="gasolina" data-tab="sitios" data-title="Gasolina">' +
    seg('gasolina') +
    `<h2>Gasolineras y descansos (Prueba)</h2><p class="note">${md(annex.gasNote)}</p>` +
    '<h3>Estrategia de repostaje</h3><dl class="kv strat">' +
    annex.fuelStrategy.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${md(b)}</dd>`).join('') +
    `</dl><p class="note">${md(annex.fuelTip)}</p>` +
    groupByDate(annex.gas, (g) => renderGas(g, true)) +
    '</section>';
  return comer + visitas + gasolina;
}

function renderMas() {
  const items = [
    ['documentos', 'Documentos y reservas', 'Vuelos, coche, aparcamientos, Booking, entradas y seguro'],
    ['reservas', 'Reservas y horas confirmadas', 'Que esta confirmado y que no'],
    ['checklist', 'Lista de comprobacion', 'Pendientes antes de salir (se guarda en el movil)'],
    ['consejos', 'Consejos practicos', 'Gasolina, propinas, conducir, silla del bebe...'],
    ['peajes', 'Peajes', 'Autopistas sin cabinas y como se pagan'],
    ['guia', 'Como usar la guia', 'Husos horarios, margenes y normas'],
    ['noches', 'Resumen de noches', 'Donde dormis cada noche'],
    ['transporte', esc(annex.transit.menuTitle), esc(annex.transit.menuSub)],
    ['exclusiones', 'Cambios y exclusiones', 'Lo descartado, para no recuperarlo'],
    ['buscar', 'Buscar', 'En toda la guia'],
    ['bodega', 'Enlaces privados Booking', 'Accede a tus reservas con enlace individual cifrado', { 'data-no-nav': '' }],
  ];
  return (
    '<section class="view" id="mas" data-tab="mas" data-title="Mas"><h2>Mas (Prueba)</h2><ul class="menu">' +
    items.map(function ([id, t, s, attrs]) {
      var attrStr = attrs ? Object.entries(attrs).map(function ([k, v]) { return (v === '' ? k : k + '="' + v + '"'); }).join(' ') : '';
      return '<li><a href="#' + id + '"' + (attrStr ? ' ' + attrStr : '') + '><b>' + esc(t) + '</b><small>' + esc(s) + '</small></a></li>';
    }).join('') +
    '<li id="lock-item" hidden><a href="#mas" data-lock><b>Bloquear la app en este movil</b><small>Pedira la contrasena la proxima vez</small></a></li>' +
    `</ul><p class="note">${esc(meta.edition)}</p><p class="note">${esc(meta.disclaimer)}</p></section>`
  );
}

function renderReservas() {
  const sortKey = (x) => x.date + ' ' + ((x.time.match(/\d{2}:\d{2}/) || ['99:99'])[0]);
  const sorted = (list) => [...list].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const row = (x, cls) =>
    `<li class="${cls}" data-date="${x.date}"><a href="${days.some((d) => d.date === x.date) ? '#d-' + x.date : '#d-' + days[days.length - 1].date}"><span class="rv-d">${esc(shortDate(x.date))} · ${esc(x.time)}</span><span class="rv-w">${esc(x.what)}</span></a></li>`;
  return (
    '<section class="view" id="reservas" data-tab="mas" data-back="#mas" data-title="Reservas"><h2>Reservas y horas confirmadas (Prueba)</h2>' +
    '<h3>Confirmado</h3><ul class="rv">' +
    sorted(meta.confirmed).map((x) => row(x, 'okr')).join('') +
    '</ul><h3>Sin reserva o pendiente</h3><ul class="rv">' +
    sorted(meta.pending).map((x) => row(x, 'pendr')).join('') +
    '</ul></section>'
  );
}

function renderChecklist() {
  const remByItem = new Map((annex.reminders || []).map((r) => [r.item, r]));
  const item = (t, extra, i) => {
    const r = extra ? remByItem.get(i) : null;
    const rem = r
      ? ` data-rem-from="${Date.parse(r.from)}" data-rem-until="${Date.parse(r.until)}" data-rem-title="${attr(r.title)}" data-rem-label="${attr(r.action[0])}" data-rem-href="${attr(r.action[1])}"`
      : '';
    if (r && (isNaN(Date.parse(r.from)) || isNaN(Date.parse(r.until)))) throw new Error('Fecha de recordatorio no valida: ' + r.title);
    return `<li${rem}><label><input type="checkbox" data-k="c${hash(t)}"><span>${md(t)}${extra ? ' <em class="added">anadido</em>' : ''}</span></label></li>`;
  };
  for (const r of annex.reminders || []) if (!annex.checklistExtra[r.item]) throw new Error('Recordatorio sin tarea: ' + r.title);
  return (
    '<section class="view" id="checklist" data-tab="mas" data-back="#mas" data-title="Lista de comprobacion"><h2>Lista de comprobacion previa (Prueba)</h2>' +
    '<p class="note">Marca lo que vayas cerrando; se guarda en este movil. <span id="chk-count"></span></p><ul class="chk">' +
    annex.checklist.map((t, i) => item(t, false, i)).join('') +
    annex.checklistExtra.map((t, i) => item(t, true, i)).join('') +
    '</ul><p class="note">"anadido": tarea que no estaba en la lista original del PDF. Algunas aparecen como recordatorio en "Hoy" en su fecha.</p></section>'
  );
}

function renderPeajes() {
  const t = annex.tolls;
  return (
    '<section class="view" id="peajes" data-tab="mas" data-back="#mas" data-title="Peajes"><h2>Peajes (Prueba)</h2>' +
    `<p>${md(t.intro)}</p><h3>Donde</h3><dl class="kv">` +
    t.where.map(([a, b]) => `<dt>${esc(a)}</dt><dd class="srch" data-c="Peajes" data-h="#peajes"><span class="st">${md(b)}</span></dd>`).join('') +
    '</dl><h3>Que hacer</h3><ul class="keys">' +
    t.options.map((o) => `<li>${md(o)}</li>`).join('') +
    '</ul><h3>Enlaces</h3><div class="actions">' +
    t.links.map(([l, u]) => `<a class="btn" href="${attr(u)}" ${ext}>${esc(l)}</a>`).join('') +
    `</div><p class="note">${esc(t.source)}</p></section>`
  );
}

function renderConsejos() {
  return (
    '<section class="view" id="consejos" data-tab="mas" data-back="#mas" data-title="Consejos"><h2>Consejos practicos (Prueba)</h2>' +
    '<p class="note">Cosas que no venian en la guia y conviene tener presentes.</p>' +
    annex.tips.map(([a, b]) => `<div class="card srch" data-c="Consejos" data-h="#consejos"><h4 class="st">${esc(a)}</h4><p>${md(b)}</p></div>`).join('') +
    '</section>'
  );
}

function renderTiempo() {
  const visits = {};
  for (const [date, ids] of Object.entries(weather.days)) for (const id of ids) (visits[id] = visits[id] || []).push(date);
  const cities = weather.cities.map((c) => {
    if (!visits[c.id]) throw new Error('Ciudad sin fechas: ' + c.id);
    return { ...c, visits: visits[c.id] };
  });
  for (const ids of Object.values(weather.days)) for (const id of ids) if (!cities.find((c) => c.id === id)) throw new Error('Ciudad inexistente: ' + id);
  const json = JSON.stringify({ cities, days: weather.days }).replace(/</g, '\\u003c');
  return (
    '<section class="view" id="tiempo" data-tab="tiempo" data-title="El tiempo">' +
    `<header class="hero art-hero">${artLib.useArt('sky', 'hero-art')}<div class="hero-text"><p class="eyebrow">Prevision oficial</p><h2>El tiempo en ruta</h2>` +
    '<p>Ahora, hoy y manana en cada ciudad del viaje</p></div></header>' +
    '<div class="wx-bar"><span id="wx-status" class="note">Cargando...</span><button type="button" class="btn" id="wx-refresh">Actualizar</button></div>' +
    '<div id="wx-alerts"></div><div id="wx-groups"></div>' +
    '<div class="card wx-sources"><h4>Fuentes</h4><p><b>Hoy, manana y avisos:</b> Servicio Meteorologico Nacional de EE. UU. (NWS/NOAA), la prevision oficial del pais. ' +
    '<b>Ahora, amanecer/atardecer y dias mas lejanos:</b> modelo europeo ECMWF a traves de <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (datos con licencia CC BY 4.0). ' +
    'Si el NWS no responde, se muestra el ECMWF. Necesita conexion; sin ella veras los ultimos datos guardados.</p></div>' +
    `<script type="application/json" id="wx-data">${json}</script></section>`
  );
}

function renderGuia() {
  return (
    '<section class="view" id="guia" data-tab="mas" data-back="#mas" data-title="Como usar la guia"><h2>Como usar la guia (Prueba)</h2>' +
    meta.guide.map((g) => `<div class="card srch" data-c="Guia" data-h="#guia"><h4 class="st">${esc(g.title)}</h4><p>${md(g.text)}</p></div>`).join('') +
    `<div class="card"><h4>Regla editorial</h4><p>${md(meta.editorialRule)}</p></div>` +
    '<h3>Como interpretar distancias y duracion</h3><ul class="keys">' +
    annex.transit.interpret.map((t) => `<li>${md(t)}</li>`).join('') +
    '</ul></section>'
  );
}

function renderNoches() {
  return (
    '<section class="view" id="noches" data-tab="mas" data-back="#mas" data-title="Noches"><h2>Resumen de noches (Prueba)</h2><ul class="rv">' +
    meta.nights
      .map(
        (n) =>
          `<li><a href="#${n.hotel}"><span class="rv-d">${esc(n.dates)} · ${esc(n.city)}</span><span class="rv-w">${esc(hotelById[n.hotel].name)}</span>${n.note ? `<small>${esc(n.note)}</small>` : ''}</a></li>`
      )
      .join('') +
    '</ul></section>'
  );
}

function renderTransporte() {
  const t = annex.transit;
  return (
    `<section class="view" id="transporte" data-tab="mas" data-back="#mas" data-title="Transporte"><h2>${esc(t.title)} (Prueba)</h2>` +
    `<p class="note">${md(t.intro)}</p>` +
    t.lines
      .map(([a, b, c]) => `<div class="card srch" data-c="Transporte CTA" data-h="#transporte"><h4 class="st">${esc(a)}</h4><p>${md(b)}</p><p class="muted">${md(c)}</p></div>`)
      .join('') +
    '<h3>Tarifas</h3><dl class="kv">' +
    t.fares.map(([a, b, c]) => `<dt>${esc(a)}</dt><dd><strong>${esc(b)}</strong>. ${md(c)}</dd>`).join('') +
    `</dl><div class="late">${md(t.warning)}</div><h3>Enlaces</h3><ul class="keys">` +
    t.links.map(([l, u]) => `<li><a href="${attr(u)}" ${ext}>${esc(l)}</a></li>`).join('') +
    '</ul></section>'
  );
}

function renderExclusiones() {
  return (
    '<section class="view" id="exclusiones" data-tab="mas" data-back="#mas" data-title="Exclusiones"><h2>Control de cambios y exclusiones (Prueba)</h2>' +
    '<p class="note">Decisiones mas recientes del viaje. Lo descartado aparece solo aqui.</p><dl class="kv">' +
    annex.exclusions.map(([d, t]) => `<dt>${esc(d)}</dt><dd class="srch" data-c="Exclusiones · ${esc(d)}" data-h="#exclusiones"><span class="st">${md(t)}</span></dd>`).join('') +
    '</dl></section>'
  );
}

function renderBuscar() {
  return (
    '<section class="view" id="buscar" data-tab="mas" data-back="#mas" data-title="Buscar"><h2>Buscar (Prueba)</h2>' +
    '<input id="q" type="search" placeholder="Restaurante, hotel, ciudad, hora..." autocomplete="off" enterkeyhint="search">' +
    '<div id="results"></div><noscript><p class="note">La busqueda necesita JavaScript.</p></noscript></section>'
  );
}

function renderHoy() {
  return (
    '<section class="view" id="hoy" data-tab="hoy" data-title="Road Trip 2026 (Prueba)"><div id="hoy-live"></div>' +
    `<div class="nojs-art">${artLib.useArt('road', 'hero-art')}</div>` +
    `<div class="nojs"><h2>${esc(meta.title)} (Prueba)</h2><p class="route">${esc(meta.subtitle)}</p><p>${esc(meta.states)}</p>` +
    `<p class="note">${esc(meta.facts.join(' · '))}</p><p class="note">${esc(meta.disclaimer)}</p></div></section>`
  );
}

function renderToc() {
  return (
    '<nav class="toc"><h2>Indice</h2><ul>' +
    days.map((d, i) => `<li><a href="#d-${d.date}">Dia ${i + 1} · ${esc(shortDate(d.date))} · ${esc(d.title)}</a></li>`).join('') +
    '<li><a href="#hoteles">Hoteles</a></li><li><a href="#comer">Restaurantes</a></li><li><a href="#visitas">Visitas</a></li>' +
    '<li><a href="#gasolina">Gasolineras</a></li><li><a href="#documentos">Documentos</a></li><li><a href="#reservas">Reservas</a></li><li><a href="#checklist">Lista de comprobacion</a></li>' +
    '<li><a href="#consejos">Consejos practicos</a></li><li><a href="#peajes">Peajes</a></li>' +
    `<li><a href="#transporte">${esc(annex.transit.tocLabel)}</a></li><li><a href="#exclusiones">Exclusiones</a></li></ul></nav>`
  );
}

// ---------- composicion ----------
function build() {
  const OUT = path.join(__dirname, 'dist');
  fs.mkdirSync(OUT, { recursive: true });

  // Comprobaciones de coherencia
  days.forEach((d, i) => {
    if (i > 0) {
      const a = Date.UTC(...days[i - 1].date.split('-').map((n, k) => (k === 1 ? n - 1 : +n)));
      const b = Date.UTC(...d.date.split('-').map((n, k) => (k === 1 ? n - 1 : +n)));
      if (b - a !== 86400000) throw new Error('Fechas no consecutivas: ' + d.date);
    }
  });
  meta.nights.forEach((n) => {
    if (!hotelById[n.hotel]) throw new Error('Resumen de noches con hotel inexistente: ' + n.hotel);
  });

  const timelines = days.map(buildTimeline);
  const sprite =
    '<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">' +
    artLib.KEYS.map(artLib.symbol).join('') +
    artLib.wxSymbols() +
    '</svg>';

  const CSS = fs.readFileSync(path.join(__dirname, '../src/app.css'), 'utf8');
  const VAULT_CSS = [
    '.bv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(22,41,63,.92);display:flex;align-items:center;justify-content:center;padding:.8rem}',
    '.bv-form{background:var(--card);color:var(--ink);border-radius:18px;padding:1.2rem;width:100%;max-width:380px;display:flex;flex-direction:column;gap:.6rem}',
    '.bv-pwrow{display:flex;gap:6px}',
    '.bv-input{width:100%;padding:.6rem .7rem;border:1px solid var(--line);border-radius:10px;font-size:1rem;background:var(--bg);color:var(--ink)}',
    '.bv-go,.bv-submit{width:100%;padding:.7rem;border:0;border-radius:12px;background:var(--teal);color:#fff;font-size:1rem;font-weight:700;cursor:pointer;margin-top:.2rem}',
    '.bv-ver,.bv-cancel,.bv-close-m{padding:.45rem .7rem;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font-size:.85rem;cursor:pointer}',
    '.bv-delete{color:var(--warn,#b43c3c);background:transparent;border:1px solid var(--warn,#b43c3c);border-radius:10px;padding:.45rem .8rem;cursor:pointer;margin-top:.2rem}',
    '.bv-close-m{position:absolute;top:.8rem;right:.8rem;background:transparent;border:0;color:var(--muted);font-size:1.2rem;cursor:pointer}',
    '.bv-msg{min-height:1.3em;margin:.3rem 0;color:var(--warn,#b43c3c);font-weight:600;text-align:center;font-size:.88rem}',
    '.bv-panel{background:var(--card);border-radius:18px;padding:1.2rem;width:100%;max-width:420px;display:flex;flex-direction:column;gap:.6rem;overflow-y:auto}',
    '.bv-panel h2{margin:0;font-size:1.05rem;color:var(--ink)}',
    '.bv-row{display:flex;align-items:center;gap:.5rem;padding:.55rem .7rem;background:var(--chipbg,var(--line));border-radius:10px;margin:.25rem 0}',
    '.bv-row.bv-linked{border-left:3px solid var(--teal,#0d9488)}',
    '.bv-id{font-weight:700;color:var(--teal);font-size:.8rem;min-width:28px}',
    '.bv-name{flex:1;font-size:.9rem;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.bv-dot{width:8px;height:8px;border-radius:50%;background:var(--teal);flex:none}',
    '.bv-edit{padding:.3rem .6rem;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--link,#0d9488);font-size:.8rem;cursor:pointer;white-space:nowrap;flex:none}',
    '.bv-stats{margin:.4rem 0 0;font-size:.8rem;color:var(--muted);text-align:center}',
    '.bv-ctrls{display:flex;gap:.4rem;flex-wrap:wrap}',
    '.bv-exp-btn,.bv-imp-btn,.bv-lock-btn,.bv-unlock-btn{padding:.4rem .7rem;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:.82rem;cursor:pointer}',
    '.bv-add-btn{padding:.5rem 1rem;border-radius:10px;border:0;background:var(--teal);color:#fff;font-size:.88rem;font-weight:700;cursor:pointer}',
    '.bv-modal{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:var(--card);border-top:1px solid var(--line);border-radius:20px 20px 0 0;padding:1.4rem 1.2rem 2rem;display:flex;flex-direction:column;gap:.5rem;max-width:480px;margin:0 auto}',
    '.bv-card{display:flex;flex-direction:column;gap:.35rem}',
    '.bv-card-id{font-weight:800;color:var(--teal);font-size:1rem}',
    '.bv-rem{font-size:.78rem;color:var(--muted)}',
    '.bv-link-btn{border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:.8rem;padding:.3rem .6rem;border-radius:8px;cursor:pointer;white-space:nowrap}',
    '.bv-link-btn:hover{background:var(--teal);color:#fff;border-color:var(--teal)}',
  ].join('\n');
  const JS = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(__dirname, '../src/weather-client.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(__dirname, 'pruebas-patch.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(__dirname, 'bodega-viaje.js'), 'utf8');

  const body =
    sprite +
    `<header class="appbar"><a class="back" href="#dias" hidden aria-label="Volver">${svg('back')}</a>` +
    '<span class="apptitle">Road Trip 2026 (Prueba)</span>' +
    `<a class="docsbtn" href="#documentos" aria-label="Documentos y reservas">${svg('docs')}</a>` +
    `<a class="searchbtn" href="#buscar" aria-label="Buscar">${svg('search')}</a></header>` +
    '<main>' +
    renderToc() +
    renderHoy() +
    renderDayList() +
    days.map((d, i) => renderDay(d, i, timelines[i])).join('') +
    renderHotels() +
    renderSitios() +
    renderTiempo() +
    renderMas() +
    renderDocs() +
    renderReservas() +
    renderChecklist() +
    renderConsejos() +
    renderPeajes() +
    renderGuia() +
    renderNoches() +
    renderTransporte() +
    renderExclusiones() +
    renderBuscar() +
    '</main>' +
    '<nav class="tabbar">' +
    [
      ['hoy', 'Hoy', 'hoy'],
      ['dias', 'Dias', 'dias'],
      ['tiempo', 'Tiempo', 'tiempo'],
      ['hoteles', 'Hoteles', 'hoteles'],
      ['comer', 'Sitios', 'sitios'],
      ['mas', 'Mas', 'mas'],
    ]
      .map(([href, label, tab]) => `<a href="#${href}" data-tab="${tab}">${svg(tab)}<span>${label}</span></a>`)
      .join('') +
    '</nav>';

  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    `<title>${esc(meta.title)} (Prueba)</title>` +
    '<meta name="theme-color" content="#16293f">' +
    '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
    '<meta name="apple-mobile-web-app-title" content="Road Trip 26 Test">' +
    '<meta name="format-detection" content="telephone=no">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" href="icon-192.png">' +
    '<script>document.documentElement.className="js"</script>' +
    `<style>${CSS}</style><style>${VAULT_CSS}</style></head><body>${body}<script>${JS}</script></body></html>`;

  const version = hash(html);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(
    path.join(OUT, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'USA Road Trip 2026 (Prueba)',
        short_name: 'Road Trip 26 Test',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#16293f',
        theme_color: '#16293f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2
    )
  );
  // Service worker con nombre de cache unico para pruebas
  fs.writeFileSync(path.join(OUT, 'sw.js'), fs.readFileSync(path.join(__dirname, '../src/sw.js'), 'utf8').replace('__VERSION__', version).replace(/rt26-[a-f0-9]+/, 'rt26-pruebas-' + version));
  fs.writeFileSync(path.join(OUT, 'icon-192.png'), drawIcon(192));
  fs.writeFileSync(path.join(OUT, 'icon-512.png'), drawIcon(512));
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), drawIcon(180));

  const items = timelines.reduce((n, t) => n + t.items.length, 0);
  console.log(`OK PRUEBAS · ${days.length} dias · ${items} entradas · ${annex.hotels.length} hoteles · ${annex.restaurants.length} restaurantes · ${annex.gas.length} gasolineras · ${annex.places.length} lugares`);
  console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB · version ${version}`);
  console.log(`\nCorrecciones aplicadas:`);
  console.log(`  - Booking: ${BOOKING_URL} (sin clase booking-link, usa App Links nativo)`);
  console.log(`  - Heymondo: ${HEYMONDO_URL} (web app)`);
  console.log(`  - My CityPASS: ${CITYPASS_URL} (web app)`);
  console.log(`  - Waze: sin cambios (formato oficial confirmado funcional)`);
}

build();