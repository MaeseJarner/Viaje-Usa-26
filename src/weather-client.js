// Pestaña «Tiempo». Fuentes:
// - NWS/NOAA (api.weather.gov): previsión oficial de EE. UU. por periodos de 12 h y avisos.
// - Open-Meteo con el modelo ECMWF: condiciones actuales, amanecer/atardecer y respaldo si el NWS falla.
// Todo se guarda en localStorage para verlo sin conexión.
(function () {
  'use strict';
  var el = document.getElementById('wx-data');
  if (!el) return;
  var DATA = JSON.parse(el.textContent);
  var CITIES = DATA.cities;
  var byId = {};
  CITIES.forEach(function (c) { byId[c.id] = c; });
  var NWS = 'https://api.weather.gov';
  var OM = 'https://api.open-meteo.com/v1/forecast';
  var KEY = 'rt26-wx-v1';
  var PKEY = 'rt26-wx-points-v1';
  var TTL = 30 * 60000;
  var now = function () { return (window.RT26_NOW || Date.now)(); };
  var busy = false;

  var WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var pad = function (x) { return (x < 10 ? '0' : '') + x; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function isoAt(t, tzH) { return new Date(t + tzH * 3600000).toISOString().slice(0, 10); }
  function addDays(iso, k) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + k);
    return d.toISOString().slice(0, 10);
  }
  function label(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()];
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function fetchJSON(url, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  // Ejecuta tareas con concurrencia limitada.
  function pool(items, n, fn) {
    var i = 0;
    var out = [];
    function next() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return Promise.resolve().then(function () { return fn(items[k]); }).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(next);
    }
    var ws = [];
    for (var w = 0; w < Math.min(n, items.length); w++) ws.push(next());
    return Promise.all(ws).then(function () { return out; });
  }

  // ---------- traducciones ----------
  var NWS_CODES = {
    skc: ['Despejado', 'sun'], few: ['Casi despejado', 'sun'], sct: ['Parcialmente nuboso', 'partly'], bkn: ['Muy nuboso', 'partly'], ovc: ['Cubierto', 'cloud'],
    wind_skc: ['Despejado y con viento', 'wind'], wind_few: ['Casi despejado y con viento', 'wind'], wind_sct: ['Intervalos nubosos y viento', 'wind'],
    wind_bkn: ['Muy nuboso y con viento', 'wind'], wind_ovc: ['Cubierto y con viento', 'wind'],
    snow: ['Nieve', 'snow'], rain_snow: ['Lluvia y nieve', 'sleet'], rain_sleet: ['Lluvia y aguanieve', 'sleet'], snow_sleet: ['Nieve y aguanieve', 'sleet'],
    fzra: ['Lluvia helada', 'sleet'], rain_fzra: ['Lluvia y lluvia helada', 'sleet'], snow_fzra: ['Nieve y lluvia helada', 'sleet'], sleet: ['Aguanieve', 'sleet'],
    rain: ['Lluvia', 'rain'], rain_showers: ['Chubascos', 'showers'], rain_showers_hi: ['Chubascos aislados', 'showers'],
    tsra: ['Tormentas', 'storm'], tsra_sct: ['Tormentas dispersas', 'storm'], tsra_hi: ['Tormentas aisladas', 'storm'],
    tornado: ['Riesgo de tornado', 'storm'], hurricane: ['Huracán', 'storm'], tropical_storm: ['Tormenta tropical', 'storm'],
    dust: ['Polvo en suspensión', 'fog'], smoke: ['Humo', 'fog'], haze: ['Calima', 'fog'], hot: ['Calor', 'sun'], cold: ['Frío', 'cloud'],
    blizzard: ['Ventisca', 'snow'], fog: ['Niebla', 'fog'],
  };
  var PRECIP = /rain|snow|sleet|fzra|tsra|tornado|hurricane|tropical|blizzard/;
  // Traducción de respaldo del texto en inglés (si el NWS deja de enviar el icono).
  var PHRASES = [
    [/showers and thunderstorms/i, 'Chubascos y tormentas'], [/thunderstorms?/i, 'Tormentas'], [/freezing rain/i, 'Lluvia helada'],
    [/rain and snow/i, 'Lluvia y nieve'], [/snow showers/i, 'Chubascos de nieve'], [/rain showers/i, 'Chubascos'], [/drizzle/i, 'Llovizna'],
    [/sleet/i, 'Aguanieve'], [/snow/i, 'Nieve'], [/rain/i, 'Lluvia'], [/patchy fog/i, 'Niebla en zonas'], [/fog/i, 'Niebla'],
    [/mostly sunny/i, 'Mayormente soleado'], [/partly sunny/i, 'Intervalos de sol'], [/sunny/i, 'Soleado'], [/mostly clear/i, 'Mayormente despejado'],
    [/partly cloudy/i, 'Parcialmente nuboso'], [/mostly cloudy/i, 'Mayormente nuboso'], [/cloudy/i, 'Nuboso'], [/clear/i, 'Despejado'], [/windy|breezy/i, 'Ventoso'],
  ];
  function phraseEs(s) {
    for (var i = 0; i < PHRASES.length; i++) if (PHRASES[i][0].test(s || '')) return PHRASES[i][1];
    return s || '—';
  }
  function nwsCond(icon, isDay, short) {
    var m = /\/icons\/land\/(day|night)\/([a-z_]+)(?:,\d+)?(?:\/([a-z_]+)(?:,\d+)?)?/.exec(icon || '');
    var code = null;
    if (m) code = m[3] && PRECIP.test(m[3]) && !PRECIP.test(m[2]) ? m[3] : m[2];
    var c = code && NWS_CODES[code];
    var txt = c ? c[0] : phraseEs(short);
    var ic = c ? c[1] : /tormenta/i.test(txt) ? 'storm' : /nieve|ventisca/i.test(txt) ? 'snow' : /aguanieve|helada/i.test(txt) ? 'sleet' : /chubasco/i.test(txt) ? 'showers' : /lluv|llovizna/i.test(txt) ? 'rain' : /niebla/i.test(txt) ? 'fog' : /nuboso|cubierto/i.test(txt) ? 'cloud' : /intervalos|parcial/i.test(txt) ? 'partly' : 'sun';
    if (!isDay && ic === 'sun') ic = 'moon';
    if (!isDay && ic === 'partly') ic = 'partlynight';
    return [txt, ic];
  }
  function wmo(code, isDay) {
    var r;
    if (code === 0) r = ['Despejado', 'sun'];
    else if (code === 1) r = ['Casi despejado', 'sun'];
    else if (code === 2) r = ['Parcialmente nuboso', 'partly'];
    else if (code === 3) r = ['Cubierto', 'cloud'];
    else if (code === 45 || code === 48) r = ['Niebla', 'fog'];
    else if (code >= 51 && code <= 55) r = ['Llovizna', 'rain'];
    else if (code === 56 || code === 57) r = ['Llovizna helada', 'sleet'];
    else if (code >= 61 && code <= 65) r = [code === 61 ? 'Lluvia débil' : code === 63 ? 'Lluvia' : 'Lluvia fuerte', 'rain'];
    else if (code === 66 || code === 67) r = ['Lluvia helada', 'sleet'];
    else if (code >= 71 && code <= 75) r = [code === 71 ? 'Nieve débil' : code === 73 ? 'Nieve' : 'Nieve fuerte', 'snow'];
    else if (code === 77) r = ['Granos de nieve', 'snow'];
    else if (code >= 80 && code <= 82) r = ['Chubascos', 'showers'];
    else if (code === 85 || code === 86) r = ['Chubascos de nieve', 'snow'];
    else if (code === 95) r = ['Tormenta', 'storm'];
    else if (code === 96 || code === 99) r = ['Tormenta con granizo', 'storm'];
    else r = ['—', 'cloud'];
    if (isDay === false && r[1] === 'sun') r[1] = 'moon';
    if (isDay === false && r[1] === 'partly') r[1] = 'partlynight';
    return r;
  }
  var ALERTS = {
    'Winter Storm Warning': 'Aviso de tormenta invernal', 'Winter Storm Watch': 'Vigilancia de tormenta invernal',
    'Winter Weather Advisory': 'Advertencia por tiempo invernal', 'Blizzard Warning': 'Aviso de ventisca', 'Ice Storm Warning': 'Aviso de tormenta de hielo',
    'Lake Effect Snow Warning': 'Aviso de nieve por efecto lago', 'Extreme Cold Warning': 'Aviso de frío extremo', 'Extreme Cold Watch': 'Vigilancia de frío extremo',
    'Cold Weather Advisory': 'Advertencia por frío', 'Wind Chill Warning': 'Aviso de frío intenso por viento', 'Wind Chill Advisory': 'Advertencia de frío por viento',
    'Freeze Warning': 'Aviso de helada', 'Freeze Watch': 'Vigilancia de helada', 'Hard Freeze Warning': 'Aviso de helada fuerte', 'Frost Advisory': 'Advertencia de escarcha',
    'Dense Fog Advisory': 'Advertencia de niebla densa', 'Freezing Fog Advisory': 'Advertencia de niebla helada', 'Wind Advisory': 'Advertencia de viento',
    'High Wind Warning': 'Aviso de viento fuerte', 'High Wind Watch': 'Vigilancia de viento fuerte', 'Flood Warning': 'Aviso de inundación', 'Flood Watch': 'Vigilancia de inundación',
    'Flood Advisory': 'Advertencia de inundación', 'Flash Flood Warning': 'Aviso de inundación repentina', 'Flash Flood Watch': 'Vigilancia de inundación repentina',
    'Severe Thunderstorm Warning': 'Aviso de tormenta fuerte', 'Severe Thunderstorm Watch': 'Vigilancia de tormentas fuertes', 'Tornado Warning': 'AVISO DE TORNADO',
    'Tornado Watch': 'Vigilancia de tornados', 'Special Weather Statement': 'Nota meteorológica especial', 'Heat Advisory': 'Advertencia por calor',
    'Red Flag Warning': 'Aviso de riesgo de incendio', 'Air Quality Alert': 'Alerta por calidad del aire', 'Coastal Flood Advisory': 'Advertencia de inundación costera',
  };

  // ---------- descarga ----------
  function nwsPoints(c) {
    var pts = load(PKEY, {});
    if (pts[c.id] && pts[c.id].forecast) return Promise.resolve(pts[c.id]);
    return fetchJSON(NWS + '/points/' + c.lat + ',' + c.lon).then(function (j) {
      var p = { forecast: j.properties && j.properties.forecast };
      if (!p.forecast) throw new Error('sin previsión');
      var all = load(PKEY, {});
      all[c.id] = p;
      save(PKEY, all);
      return p;
    });
  }
  // Agrupa los periodos de 12 h del NWS por fecha local: máxima (día), mínima (noche), estado y probabilidad.
  function nwsDays(periods) {
    var out = {};
    (periods || []).forEach(function (p) {
      var d = String(p.startTime).slice(0, 10);
      var o = out[d] || (out[d] = {});
      var unitC = p.temperatureUnit === 'C';
      var t = typeof p.temperature === 'number' ? (unitC ? p.temperature : (p.temperature - 32) * 5 / 9) : null;
      var pop = p.probabilityOfPrecipitation && typeof p.probabilityOfPrecipitation.value === 'number' ? p.probabilityOfPrecipitation.value : null;
      var cond = nwsCond(p.icon, p.isDaytime, p.shortForecast);
      if (p.isDaytime) {
        o.hi = t; o.txt = cond[0]; o.ic = cond[1]; o.wind = windKmh(p.windSpeed, unitC); o.dir = p.windDirection || '';
      } else {
        o.lo = t;
        if (!o.txt) { o.txt = cond[0]; o.ic = cond[1]; o.night = true; o.wind = windKmh(p.windSpeed, unitC); o.dir = p.windDirection || ''; }
      }
      if (pop !== null) o.pop = Math.max(o.pop || 0, pop);
    });
    return out;
  }
  function windKmh(s, isSi) {
    var nums = String(s || '').match(/\d+/g);
    if (!nums) return null;
    var v = Math.max.apply(null, nums.map(Number));
    return /mph/i.test(s) || (!isSi && !/km/i.test(s)) ? Math.round(v * 1.609) : v;
  }
  function nwsCity(c) {
    return nwsPoints(c).then(function (p) {
      return fetchJSON(p.forecast + (p.forecast.indexOf('?') < 0 ? '?' : '&') + 'units=si');
    }).then(function (j) { return nwsDays(j.properties && j.properties.periods); });
  }
  function nwsAlerts(c) {
    return fetchJSON(NWS + '/alerts/active?point=' + c.lat + ',' + c.lon).then(function (j) {
      return (j.features || []).map(function (f) {
        var p = f.properties || {};
        return { ev: p.event, sev: p.severity, ends: p.ends || p.expires, head: p.headline };
      });
    });
  }
  function openMeteo(withModel) {
    var q = '?latitude=' + CITIES.map(function (c) { return c.lat; }).join(',') + '&longitude=' + CITIES.map(function (c) { return c.lon; }).join(',') +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset' +
      '&timezone=auto&forecast_days=14&wind_speed_unit=kmh' + (withModel ? '&models=ecmwf_ifs' : '');
    return fetchJSON(OM + q, 15000).then(function (j) {
      var arr = Array.isArray(j) ? j : [j];
      if (arr.length !== CITIES.length || !arr[0].daily) throw new Error('respuesta incompleta');
      var out = {};
      arr.forEach(function (r, i) {
        var d = {};
        (r.daily.time || []).forEach(function (iso, k) {
          d[iso] = {
            hi: r.daily.temperature_2m_max[k], lo: r.daily.temperature_2m_min[k], code: r.daily.weather_code[k],
            pop: r.daily.precipitation_probability_max ? r.daily.precipitation_probability_max[k] : null,
            mm: r.daily.precipitation_sum ? r.daily.precipitation_sum[k] : null,
            rise: r.daily.sunrise ? String(r.daily.sunrise[k]).slice(11, 16) : '', set: r.daily.sunset ? String(r.daily.sunset[k]).slice(11, 16) : '',
          };
        });
        out[CITIES[i].id] = { cur: r.current || null, days: d, model: withModel ? 'ECMWF' : 'Open-Meteo' };
      });
      return out;
    });
  }

  function refresh(force) {
    var cache = load(KEY, null);
    if (busy) return Promise.resolve(cache);
    if (!force && cache && now() - cache.at < TTL) return Promise.resolve(cache);
    if (navigator.onLine === false) return Promise.resolve(cache);
    busy = true;
    status('Actualizando…');
    var t = now();
    var routeIds = todayIds(t).concat(todayIds(t + 864e5)).filter(function (id, i, a) { return a.indexOf(id) === i; });
    var om = openMeteo(true).catch(function () { return openMeteo(false); }).catch(function () { return null; });
    var nws = pool(CITIES, 4, nwsCity);
    var al = pool(routeIds.map(function (id) { return byId[id]; }), 3, nwsAlerts);
    return Promise.all([om, nws, al]).then(function (res) {
      var prev = cache || {};
      var next = { at: Date.now(), om: res[0] || prev.om || null, nws: {}, alerts: {}, alertsFor: routeIds };
      CITIES.forEach(function (c, i) { next.nws[c.id] = res[1][i] || (prev.nws && prev.nws[c.id]) || null; });
      routeIds.forEach(function (id, i) { next.alerts[id] = res[2][i] || []; });
      var okN = res[1].filter(Boolean).length;
      next.okNws = okN;
      next.okOm = !!res[0];
      if (!res[0] && !okN) { busy = false; status(cache ? 'Sin conexión con los servicios: datos guardados de ' + ago(cache.at) + '.' : 'No se ha podido cargar el tiempo. Comprueba la conexión y pulsa «Actualizar».'); return cache; }
      save(KEY, next);
      busy = false;
      return next;
    }, function () { busy = false; return cache; });
  }

  // ---------- presentación ----------
  function todayIds(t) {
    var iso = isoAt(t, -6);
    return (DATA.days[iso] || []).slice();
  }
  function ago(at) {
    var m = Math.round((Date.now() - at) / 60000);
    if (m < 1) return 'hace un momento';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60);
    return h < 48 ? 'hace ' + h + ' h' : 'hace ' + Math.round(h / 24) + ' días';
  }
  function status(txt) {
    var s = document.getElementById('wx-status');
    if (s) s.textContent = txt;
  }
  var deg = function (v) { return typeof v === 'number' && !isNaN(v) ? Math.round(v) + '°' : '–'; };
  var icon = function (k, cls) { return '<svg class="' + (cls || 'wx-ic') + '" aria-hidden="true"><use href="#wx-' + k + '"/></svg>'; };

  // Previsión de una fecha: NWS si la hay; si no, ECMWF (hasta 10 días, orientativa).
  function dayFc(cache, c, iso, todayIso) {
    var n = cache && cache.nws && cache.nws[c.id] && cache.nws[c.id][iso];
    var o = cache && cache.om && cache.om[c.id] && cache.om[c.id].days[iso];
    var ahead = daysBetween(todayIso, iso);
    if (n && (n.txt || n.hi !== undefined)) {
      return { txt: n.txt, ic: n.ic, hi: n.hi !== undefined && n.hi !== null ? n.hi : o && o.hi, lo: n.lo !== undefined && n.lo !== null ? n.lo : o && o.lo, pop: n.pop, wind: n.wind, src: 'NWS', o: o };
    }
    if (o && ahead <= 10) {
      var w = wmo(o.code, true);
      return { txt: w[0], ic: w[1], hi: o.hi, lo: o.lo, pop: o.pop, mm: o.mm, src: cache.om[c.id].model + (ahead > 5 ? ', orientativa' : ''), o: o };
    }
    return null;
  }
  function fcBox(title, f, extraCls) {
    if (!f) return '<div class="wx-day ' + (extraCls || '') + '"><small>' + title + '</small><span class="wx-na">Sin previsión todavía</span></div>';
    var rain = typeof f.pop === 'number' ? 'Precipitación ' + Math.round(f.pop) + ' %' : typeof f.mm === 'number' ? (f.mm > 0.1 ? Math.round(f.mm * 10) / 10 + ' mm' : 'Sin precipitación') : '';
    return '<div class="wx-day ' + (extraCls || '') + '"><small>' + title + '</small>' + icon(f.ic) +
      '<b>' + deg(f.hi) + ' / ' + deg(f.lo) + '</b><span>' + esc(f.txt) + '</span>' +
      (rain ? '<span class="wx-rain">' + rain + '</span>' : '') + (f.wind ? '<span>Viento ' + f.wind + ' km/h</span>' : '') +
      '<em>' + f.src + '</em></div>';
  }
  function cityCard(cache, c, t, mode) {
    var todayIso = isoAt(t, c.tz);
    var tomorrow = addDays(todayIso, 1);
    var cur = cache && cache.om && cache.om[c.id] && cache.om[c.id].cur;
    var visitNext = c.visits.filter(function (v) { return v >= todayIso; })[0];
    var past = !visitNext;
    var visitTxt = c.visits.map(label).join(' · ');
    var h = '<div class="wx-card' + (past ? ' past' : '') + '" id="wx-' + c.id + '"><div class="wx-head"><b>' + esc(c.name) + '</b><small>' + (past ? 'Ya visitada · ' : 'Vuestra visita: ') + visitTxt + '</small></div>';
    if (cur) {
      var w = wmo(cur.weather_code, cur.is_day === 1);
      h += '<div class="wx-now">' + icon(w[1], 'wx-ic big') + '<span class="wx-t">' + deg(cur.temperature_2m) + '</span><span><b>Ahora:</b> ' + w[0] +
        '<br>Sensación ' + deg(cur.apparent_temperature) + ' · viento ' + Math.round(cur.wind_speed_10m) + ' km/h</span></div>';
    }
    h += '<div class="wx-days">' + fcBox('Hoy · ' + label(todayIso), dayFc(cache, c, todayIso, todayIso)) + fcBox('Mañana · ' + label(tomorrow), dayFc(cache, c, tomorrow, todayIso));
    if (visitNext && visitNext !== todayIso && visitNext !== tomorrow) {
      var f = dayFc(cache, c, visitNext, todayIso);
      var wait = daysBetween(todayIso, visitNext) - 7;
      h += f ? fcBox('Vuestra visita · ' + label(visitNext), f, 'visit') :
        '<div class="wx-day visit"><small>Vuestra visita · ' + label(visitNext) + '</small><span class="wx-na">La previsión oficial llega unos 7 días antes' + (wait > 0 ? ' (en ' + wait + (wait === 1 ? ' día' : ' días') + ')' : '') + '.</span></div>';
    }
    h += '</div>';
    var al = cache && cache.alerts && cache.alerts[c.id];
    if (al && al.length) h += al.map(alertHtml).join('');
    var o = cache && cache.om && cache.om[c.id] && cache.om[c.id].days[visitNext && mode !== 'today' ? visitNext : todayIso];
    h += '<div class="wx-foot">' + (o && o.rise ? '<span>Amanecer ' + o.rise + ' · atardecer ' + o.set + (visitNext && mode !== 'today' && visitNext !== todayIso ? ' (' + label(visitNext) + ')' : '') + '</span>' : '<span></span>') +
      '<a href="https://forecast.weather.gov/MapClick.php?lat=' + c.lat + '&lon=' + c.lon + '" target="_blank" rel="noopener">Previsión oficial NWS</a></div></div>';
    return h;
  }
  var WARN = '<svg class="wx-warn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" fill="currentColor"/><path d="M12 10v5M12 17.5v.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';
  function alertHtml(a) {
    var sev = /Extreme|Severe/.test(a.sev) ? 'sev-hi' : a.sev === 'Moderate' ? 'sev-mid' : 'sev-lo';
    // La hora del aviso viene con el desfase de la zona afectada: se muestra tal cual (hora local del lugar).
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(a.ends || '');
    var until = m ? ' · hasta el ' + label(m[1]) + ', ' + m[2] + ' (hora local)' : '';
    return '<div class="wx-alert ' + sev + '">' + WARN + '<div><b>' + esc(ALERTS[a.ev] || a.ev || 'Aviso') + '</b>' + until + (ALERTS[a.ev] ? '<small>' + esc(a.ev) + '</small>' : '') + '</div></div>';
  }
  function group(title, ids, cache, t, mode) {
    if (!ids.length) return '';
    return '<h3>' + title + '</h3>' + ids.map(function (id) { return cityCard(cache, byId[id], t, mode); }).join('');
  }

  function render() {
    var box = document.getElementById('wx-groups');
    if (!box) return;
    var cache = load(KEY, null);
    var t = now();
    var tIso = isoAt(t, -6);
    var today = todayIds(t);
    var tom = todayIds(t + 864e5).filter(function (id) { return today.indexOf(id) < 0; });
    var first = Object.keys(DATA.days).sort()[0];
    var html = '';
    if (!today.length && tIso < first) {
      html += group('Primer día · ' + label(first), DATA.days[first], cache, t, 'visit');
      today = DATA.days[first].slice();
    } else {
      html += group('Hoy en ruta · ' + label(tIso), today, cache, t, 'today');
      html += group('Mañana en ruta · ' + label(addDays(tIso, 1)), tom, cache, t, 'visit');
    }
    var shown = today.concat(tom);
    var rest = CITIES.filter(function (c) { return shown.indexOf(c.id) < 0; });
    var up = rest.filter(function (c) { return c.visits[c.visits.length - 1] >= tIso; });
    var done = rest.filter(function (c) { return c.visits[c.visits.length - 1] < tIso; });
    html += group('Resto del viaje', up.map(function (c) { return c.id; }), cache, t, 'visit');
    html += group('Ciudades ya visitadas', done.map(function (c) { return c.id; }), cache, t, 'visit');
    box.innerHTML = html;
    if (!busy) {
      var model = cache && cache.om && cache.om[CITIES[0].id] ? cache.om[CITIES[0].id].model : '';
      var alt = model === 'ECMWF' ? 'el modelo europeo ECMWF' : 'Open-Meteo';
      status(cache ? 'Actualizado ' + ago(cache.at) + (cache.okNws === 0 ? ' · NWS sin respuesta: se muestra ' + alt : '') + (navigator.onLine === false ? ' · sin conexión' : '') : (navigator.onLine === false ? 'Sin conexión y sin datos guardados todavía.' : 'Cargando…'));
    }
  }

  function update(force) {
    render();
    return refresh(force).then(function () { render(); });
  }

  // Resumen para la vista «Hoy» (usa solo la caché).
  function summary(ids) {
    var cache = load(KEY, null);
    if (!cache) return '';
    var t = now();
    var parts = ids.map(function (id) {
      var c = byId[id];
      var iso = isoAt(t, c.tz);
      var f = dayFc(cache, c, iso, iso);
      var cur = cache.om && cache.om[id] && cache.om[id].cur;
      if (!f && !cur) return '';
      return '<span class="wx-mini">' + icon(f ? f.ic : wmo(cur.weather_code, cur.is_day === 1)[1]) + '<b>' + esc(c.name.split(',')[0].split(' (')[0]) + '</b> ' +
        (cur ? deg(cur.temperature_2m) + ' ahora · ' : '') + (f ? deg(f.hi) + ' / ' + deg(f.lo) + (typeof f.pop === 'number' ? ' · ' + Math.round(f.pop) + ' %' : '') : '') + '</span>';
    }).filter(Boolean);
    if (!parts.length) return '';
    return '<a class="card wx-summary" href="#tiempo"><h4>El tiempo hoy</h4>' + parts.join('') + '<small>Actualizado ' + ago(cache.at) + ' · ver detalle</small></a>';
  }

  window.RT26_WX = { update: update, render: render, summary: summary, refresh: refresh };
  var btn = document.getElementById('wx-refresh');
  if (btn) btn.addEventListener('click', function () { update(true); });
  document.addEventListener('rt26:view', function (e) { if (e.detail === 'tiempo') update(false); });
  // Al abrir la app con conexión, se refresca en segundo plano para tener datos guardados en carretera.
  setTimeout(function () {
    refresh(false).then(function () {
      var v = document.querySelector('.view.active');
      if (v && v.id === 'tiempo') render();
      if (v && v.id === 'hoy') document.dispatchEvent(new CustomEvent('rt26:wx'));
    });
  }, 1500);
})();
