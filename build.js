#!/usr/bin/env node
// Genera la app en dist/: index.html autocontenido (HTML + CSS + JS en línea), manifest, service worker e iconos.
// Uso: node build.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const meta = require('./src/data/meta');
const days = [...require('./src/data/days1'), ...require('./src/data/days2')];
const annex = require('./src/data/annex');
const docs = require('./src/data/docs');
const { drawIcon } = require('./src/icons');

const OUT = path.join(__dirname, 'dist');
const CSS = fs.readFileSync(path.join(__dirname, 'src/app.css'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, 'src/app.js'), 'utf8');

// ---------- utilidades ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const attr = (s) => esc(s);

const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
const longDate = (iso) => {
  const p = parseISO(iso);
  return `${cap(WD[p.wd])} ${p.d} de ${MO[p.m - 1]}`;
};
const shortDate = (iso) => {
  const p = parseISO(iso);
  return `${cap(WD[p.wd].slice(0, 3))} ${p.d} ${MO[p.m - 1].slice(0, 3)}`;
};

// Las fechas del viaje caen en horario estándar (sin cambio de hora estacional): CT = UTC−6, ET = UTC−5.
const OFFSET_H = { CT: 6, ET: 5 };
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

const hotelById = Object.fromEntries(annex.hotels.map((h) => [h.id, h]));
const gasById = Object.fromEntries(annex.gas.map((g) => [g.id, g]));
const hotelQuery = (h) => (h.address ? `${h.name}, ${h.address}` : h.mapQuery);
const gasQuery = (g) => `${g.name}, ${g.address}`;

// Resuelve una referencia de mapa: H# (hotel), G# (gasolinera) o texto libre.
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
};
const svg = (name, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const CHIP = { ok: 'Confirmado', pend: 'Sin confirmar', opt: 'Opcional' };
const chip = (tag) => (tag ? ` <span class="chip ${tag}">${CHIP[tag]}</span>` : '');
const ext = 'target="_blank" rel="noopener"';

// ---------- horarios: hora local → instante UTC ----------
function buildTimeline(day) {
  let ctx = day.tz;
  const items = day.schedule.map(([t, a, o = {}], i) => {
    const ms = [...t.matchAll(/(\d{1,2}):(\d{2})(?:\s*(CT|ET))?/g)];
    if (!ms.length) throw new Error(`Hora no válida en ${day.date}: ${t}`);
    const z1 = ms[0][3];
    const z2 = ms[1] && ms[1][3];
    const zs = z1 || z2 || ctx;
    const ze = z2 || z1 || ctx;
    ctx = ze;
    const s = toUtc(day.date, +ms[0][1], +ms[0][2], zs);
    let e = ms[1] ? toUtc(day.date, +ms[1][1], +ms[1][2], ze) : null;
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
          ? `<a class="go" href="${attr(dirUrl(resolveMap(it.o.map), it.o.mode))}" ${ext} aria-label="Cómo llegar">Ir</a>`
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
    `<dl class="kv"><dt>Qué pedir</dt><dd>${md(r.order)}</dd><dt>Alternativa</dt><dd>${md(r.alt)}</dd>` +
    (r.fit ? `<dt>Encaje</dt><dd>${md(r.fit)}</dd>` : '') +
    `<dt>¿Reservar?</dt><dd>${md(r.reserve)}</dd></dl>` +
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
  return (
    `<div class="card hotel srch${h.missing ? ' warn' : ''}" id="${h.id}" data-c="${attr('Hotel · noches ' + h.nights)}" data-h="#${h.id}">` +
    `<p class="eyebrow">${h.id} · Noches ${esc(h.nights)}</p><h3 class="st">${esc(h.name)}</h3>` +
    `<p class="addr">${esc(h.address || h.area)}</p>` +
    (h.missing ? '<p class="missing">Falta la dirección exacta y el teléfono de los amigos.</p>' : '') +
    `<p>${md(h.info)}</p><div class="actions">` +
    (h.phone ? `<a class="btn" href="${tel(h.phone)}">Llamar ${esc(h.phone)}</a>` : '') +
    (h.address ? `<a class="btn" href="${BOOKING_URL}" ${ext}>Reserva en Booking</a>` : '') +
    `<a class="btn" href="${attr(searchUrl(q))}" ${ext}>Mapa</a><a class="btn" href="${attr(dirUrl(q))}" ${ext}>Ruta</a></div></div>`
  );
}

const modeIcon = (m) => svg(/CTA|Shuttle|Tren/.test(m) ? 'bus' : /^Pie$/.test(m) ? 'walk' : /Coche/.test(m) ? 'car' : 'swap', 20);

const BOOKING_URL = 'https://secure.booking.com/mytrips.html';
const linkAttrs = (u) => (/^tel:/.test(u) ? '' : ' ' + ext);
const docHref = (u) => (u.startsWith('MAP:') ? searchUrl(u.slice(4)) : u);
const copyBtn = (code) => `<button type="button" class="copy" data-copy="${attr(code)}">Copiar</button>`;

function renderDocs() {
  return (
    '<section class="view" id="documentos" data-tab="mas" data-back="#mas" data-title="Documentos"><h2>Documentos y reservas</h2>' +
    '<p class="note">Toca «Copiar» para pegar un código en la web o la app correspondiente.</p>' +
    docs
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
          d.links.map(([l, u]) => `<a class="btn" href="${attr(docHref(u))}"${linkAttrs(u)}>${esc(l)}</a>`).join('') +
          '</div></div>'
      )
      .join('') +
    // Resumen de códigos que la vista Hoy reutiliza antes del viaje.
    '<div id="doc-resumen" hidden><ul class="codes">' +
    docs
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
  const dayStart = toUtc(day.date, 0, 0, day.tz);
  const dayEnd = toUtc(day.date, 24, 0, tl.endTz);
  const rests = annex.restaurants.map((r, i) => [r, i]).filter(([r]) => r.date === day.date);
  const gas = annex.gas.filter((g) => g.date === day.date);
  return (
    `<section class="view day" id="d-${day.date}" data-tab="dias" data-back="#dias" data-title="${attr(shortDate(day.date))}" data-day="${day.date}" data-ds="${dayStart}" data-de="${dayEnd}" data-hotel="${day.hotel || ''}" data-n="${idx + 1}">` +
    `<header class="dh"><p class="eyebrow">Día ${idx + 1} de ${days.length} · ${esc(longDate(day.date))}</p>` +
    `<h2>${esc(day.title)}</h2><p class="route">${esc(day.route)}</p>` +
    `<p class="night">Noche: ${h ? `<a href="#${h.id}">${esc(h.name)}</a>` : esc(day.nightLabel || '—')}</p>` +
    (day.tzNote ? `<p class="tznote">${esc(day.tzNote)}</p>` : '') +
    '</header>' +
    `<nav class="daynav">${prev ? `<a href="#d-${prev}">‹ ${esc(shortDate(prev))}</a>` : '<span></span>'}${next ? `<a href="#d-${next}">${esc(shortDate(next))} ›</a>` : '<span></span>'}</nav>` +
    '<h3>Horario</h3>' +
    renderTimeline(day, tl.items) +
    `<div class="late"><strong>Si vais retrasados:</strong> ${md(day.ifLate)}</div>` +
    '<h3>Claves y reservas</h3><ul class="keys">' +
    day.keys.map((k) => `<li>${md(k)}</li>`).join('') +
    '</ul>' +
    '<h3>Comidas del día</h3><ul class="meals">' +
    day.meals.map(([l, t]) => `<li><strong>${esc(l)}:</strong> ${md(t)}</li>`).join('') +
    '</ul>' +
    (rests.length
      ? `<details class="more"><summary>Restaurantes: qué pedir y reservas (${rests.length})</summary>${rests
          .map(([r, i]) => renderRestaurant(r, i, false).replace(/ id="R\d+"/, '').replace(' srch', ''))
          .join('')}</details>`
      : '') +
    `<h3>Combustible y descansos</h3><p>${md(day.fuel)}</p>` +
    (gas.length
      ? `<details class="more"><summary>Gasolineras del día (${gas.map((g) => g.id).join(', ')})</summary>${gas
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
    '<section class="view" id="dias" data-tab="dias" data-title="Itinerario"><h2>Itinerario día a día</h2><ol class="daylist">' +
    days
      .map((d, i) => {
        const p = parseISO(d.date);
        const h = d.hotel ? hotelById[d.hotel].name : d.nightLabel;
        return (
          `<li><a href="#d-${d.date}" data-day="${d.date}"><span class="dl-date"><small>${WD[p.wd].slice(0, 3)}</small><b>${p.d}</b><small>${MO[p.m - 1].slice(0, 3)}</small></span>` +
          `<span class="dl-body"><b>${esc(d.title)}</b><small>${esc(d.route)}</small><small class="dl-night">${svg('hoteles', 14)} ${esc(h)}</small></span></a></li>`
        );
      })
      .join('') +
    '</ol></section>'
  );
}

function renderHotels() {
  return (
    '<section class="view" id="hoteles" data-tab="hoteles" data-title="Hoteles"><h2>Hoteles</h2>' +
    `<p class="note">${md(annex.hotelsNote)}</p>` +
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
    `<h2>Restaurantes por día</h2><p class="note">${md(annex.restaurantsNote)}</p>` +
    groupByDate(annex.restaurants, (r, i) => renderRestaurant(r, i, false)) +
    '</section>';
  const visitas =
    '<section class="view" id="visitas" data-tab="sitios" data-title="Visitas">' +
    seg('visitas') +
    `<h2>Lugares, visitas y tiendas</h2><p class="note">${md(annex.placesNote)}</p>` +
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
    `<h2>Gasolineras y descansos</h2><p class="note">${md(annex.gasNote)}</p>` +
    '<h3>Estrategia de repostaje</h3><dl class="kv strat">' +
    annex.fuelStrategy.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${md(b)}</dd>`).join('') +
    `</dl><p class="note">${md(annex.fuelTip)}</p>` +
    groupByDate(annex.gas, (g) => renderGas(g, true)) +
    '</section>';
  return comer + visitas + gasolina;
}

function renderMas() {
  const items = [
    ['documentos', 'Documentos y reservas', 'Vuelos, coche, Booking, CityPASS y seguro'],
    ['reservas', 'Reservas y horas confirmadas', 'Qué está confirmado y qué no'],
    ['checklist', 'Lista de comprobación', 'Pendientes antes de salir (se guarda en el móvil)'],
    ['guia', 'Cómo usar la guía', 'Husos horarios, márgenes y normas'],
    ['noches', 'Resumen de noches', 'Dónde dormís cada noche'],
    ['transporte', esc(annex.transit.menuTitle), esc(annex.transit.menuSub)],
    ['exclusiones', 'Cambios y exclusiones', 'Lo descartado, para no recuperarlo'],
    ['buscar', 'Buscar', 'En toda la guía'],
  ];
  return (
    '<section class="view" id="mas" data-tab="mas" data-title="Más"><h2>Más</h2><ul class="menu">' +
    items.map(([id, t, s]) => `<li><a href="#${id}"><b>${t}</b><small>${s}</small></a></li>`).join('') +
    '<li id="lock-item" hidden><a href="#mas" data-lock><b>Bloquear la app en este móvil</b><small>Pedirá la contraseña la próxima vez</small></a></li>' +
    `</ul><p class="note">${esc(meta.edition)}</p><p class="note">${esc(meta.disclaimer)}</p></section>`
  );
}

function renderReservas() {
  const row = (x, cls) =>
    `<li class="${cls}" data-date="${x.date}"><a href="#d-${x.date}"><span class="rv-d">${esc(shortDate(x.date))} · ${esc(x.time)}</span><span class="rv-w">${esc(x.what)}</span></a></li>`;
  return (
    '<section class="view" id="reservas" data-tab="mas" data-back="#mas" data-title="Reservas"><h2>Reservas y horas confirmadas</h2>' +
    '<h3>Confirmado</h3><ul class="rv">' +
    meta.confirmed.map((x) => row(x, 'okr')).join('') +
    '</ul><h3>Sin plaza garantizada / por reservar</h3><ul class="rv">' +
    meta.pending.map((x) => row(x, 'pendr')).join('') +
    '</ul></section>'
  );
}

function renderChecklist() {
  const item = (t, extra) =>
    `<li><label><input type="checkbox" data-k="c${hash(t)}"><span>${md(t)}${extra ? ' <em class="added">añadido</em>' : ''}</span></label></li>`;
  return (
    '<section class="view" id="checklist" data-tab="mas" data-back="#mas" data-title="Lista de comprobación"><h2>Lista de comprobación previa</h2>' +
    '<p class="note">Marca lo que vayas cerrando; se guarda en este móvil. <span id="chk-count"></span></p><ul class="chk">' +
    annex.checklist.map((t) => item(t, false)).join('') +
    annex.checklistExtra.map((t) => item(t, true)).join('') +
    '</ul><p class="note">«añadido»: tarea derivada de las notas de cada jornada; no estaba en la lista original del PDF.</p></section>'
  );
}

function renderGuia() {
  return (
    '<section class="view" id="guia" data-tab="mas" data-back="#mas" data-title="Cómo usar la guía"><h2>Cómo usar la guía</h2>' +
    meta.guide.map((g) => `<div class="card srch" data-c="Guía" data-h="#guia"><h4 class="st">${esc(g.title)}</h4><p>${md(g.text)}</p></div>`).join('') +
    `<div class="card"><h4>Regla editorial</h4><p>${md(meta.editorialRule)}</p></div>` +
    '<h3>Cómo interpretar distancias y duración</h3><ul class="keys">' +
    annex.transit.interpret.map((t) => `<li>${md(t)}</li>`).join('') +
    '</ul></section>'
  );
}

function renderNoches() {
  return (
    '<section class="view" id="noches" data-tab="mas" data-back="#mas" data-title="Noches"><h2>Resumen de noches</h2><ul class="rv">' +
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
    `<section class="view" id="transporte" data-tab="mas" data-back="#mas" data-title="Transporte"><h2>${esc(t.title)}</h2>` +
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
    '<section class="view" id="exclusiones" data-tab="mas" data-back="#mas" data-title="Exclusiones"><h2>Control de cambios y exclusiones</h2>' +
    '<p class="note">Decisiones más recientes del viaje. Lo descartado aparece solo aquí.</p><dl class="kv">' +
    annex.exclusions.map(([d, t]) => `<dt>${esc(d)}</dt><dd class="srch" data-c="Exclusiones · ${esc(d)}" data-h="#exclusiones"><span class="st">${md(t)}</span></dd>`).join('') +
    '</dl></section>'
  );
}

function renderBuscar() {
  return (
    '<section class="view" id="buscar" data-tab="mas" data-back="#mas" data-title="Buscar"><h2>Buscar</h2>' +
    '<input id="q" type="search" placeholder="Restaurante, hotel, ciudad, hora…" autocomplete="off" enterkeyhint="search">' +
    '<div id="results"></div><noscript><p class="note">La búsqueda necesita JavaScript.</p></noscript></section>'
  );
}

function renderHoy() {
  return (
    '<section class="view" id="hoy" data-tab="hoy" data-title="Road Trip 2026"><div id="hoy-live"></div>' +
    `<div class="nojs"><h2>${esc(meta.title)}</h2><p class="route">${esc(meta.subtitle)}</p><p>${esc(meta.states)}</p>` +
    `<p class="note">${esc(meta.facts.join(' · '))}</p><p class="note">${esc(meta.disclaimer)}</p></div></section>`
  );
}

function renderToc() {
  // Índice visible solo sin JavaScript (p. ej. vista previa de archivos en iOS).
  return (
    '<nav class="toc"><h2>Índice</h2><ul>' +
    days.map((d, i) => `<li><a href="#d-${d.date}">Día ${i + 1} · ${esc(shortDate(d.date))} · ${esc(d.title)}</a></li>`).join('') +
    '<li><a href="#hoteles">Hoteles</a></li><li><a href="#comer">Restaurantes</a></li><li><a href="#visitas">Visitas</a></li>' +
    '<li><a href="#gasolina">Gasolineras</a></li><li><a href="#documentos">Documentos</a></li><li><a href="#reservas">Reservas</a></li><li><a href="#checklist">Lista de comprobación</a></li>' +
    `<li><a href="#transporte">${esc(annex.transit.tocLabel)}</a></li><li><a href="#exclusiones">Exclusiones</a></li></ul></nav>`
  );
}

// ---------- composición ----------
function build() {
  fs.mkdirSync(OUT, { recursive: true });

  // Comprobaciones de coherencia de datos.
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
  const body =
    `<header class="appbar"><a class="back" href="#dias" hidden aria-label="Volver">${svg('back')}</a>` +
    '<span class="apptitle">Road Trip 2026</span>' +
    `<a class="docsbtn" href="#documentos" aria-label="Documentos y reservas">${svg('docs')}</a>` +
    `<a class="searchbtn" href="#buscar" aria-label="Buscar">${svg('search')}</a></header>` +
    '<main>' +
    renderToc() +
    renderHoy() +
    renderDayList() +
    days.map((d, i) => renderDay(d, i, timelines[i])).join('') +
    renderHotels() +
    renderSitios() +
    renderMas() +
    renderDocs() +
    renderReservas() +
    renderChecklist() +
    renderGuia() +
    renderNoches() +
    renderTransporte() +
    renderExclusiones() +
    renderBuscar() +
    '</main>' +
    '<nav class="tabbar">' +
    [
      ['hoy', 'Hoy', 'hoy'],
      ['dias', 'Días', 'dias'],
      ['hoteles', 'Hoteles', 'hoteles'],
      ['comer', 'Sitios', 'sitios'],
      ['mas', 'Más', 'mas'],
    ]
      .map(([href, label, tab]) => `<a href="#${href}" data-tab="${tab}">${svg(tab)}<span>${label}</span></a>`)
      .join('') +
    '</nav>';

  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    `<title>${esc(meta.title)}</title>` +
    '<meta name="theme-color" content="#16293f">' +
    '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
    '<meta name="apple-mobile-web-app-title" content="Road Trip 26">' +
    '<meta name="format-detection" content="telephone=no">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" href="icon-192.png">' +
    '<script>document.documentElement.className="js"</script>' +
    `<style>${CSS}</style></head><body>${body}<script>${JS}</script></body></html>`;

  const version = hash(html);
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  fs.writeFileSync(
    path.join(OUT, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'USA Road Trip 2026',
        short_name: 'Road Trip 26',
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
  fs.writeFileSync(path.join(OUT, 'sw.js'), fs.readFileSync(path.join(__dirname, 'src/sw.js'), 'utf8').replace('__VERSION__', version));
  fs.writeFileSync(path.join(OUT, 'icon-192.png'), drawIcon(192));
  fs.writeFileSync(path.join(OUT, 'icon-512.png'), drawIcon(512));
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), drawIcon(180));

  const items = timelines.reduce((n, t) => n + t.items.length, 0);
  console.log(`OK · ${days.length} días · ${items} entradas de horario · ${annex.hotels.length} alojamientos · ${annex.restaurants.length} restaurantes · ${annex.gas.length} gasolineras · ${annex.places.length} lugares`);
  console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB · versión ${version}`);
}

build();
