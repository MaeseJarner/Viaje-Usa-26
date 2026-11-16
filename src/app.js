// Lógica de la app (sin dependencias). Todo el contenido ya viene en el HTML; esto añade navegación,
// la vista "Hoy" con la actividad en curso, la búsqueda y la lista de comprobación persistente.
(function () {
  'use strict';
  try {
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    // ?ahora=AAAA-MM-DDTHH:MM:SS-05:00 permite simular una fecha (para probar la vista Hoy).
    var forced = Date.parse(new URLSearchParams(location.search).get('ahora') || '');
    var now = function () { return isNaN(forced) ? Date.now() : forced; };

    var views = $$('.view');
    var dayEls = $$('section.day');
    var tabs = $$('.tabbar a');
    var backBtn = $('.appbar .back');
    var titleEl = $('.appbar .apptitle');
    var scrollPos = {};
    var current = null;

    // ---------- navegación por #hash ----------
    function show(hash) {
      var id = decodeURIComponent((hash || '').replace(/^#/, '')) || 'hoy';
      var target = document.getElementById(id);
      var view = target ? (target.classList.contains('view') ? target : target.closest('.view')) : null;
      if (!view) { view = $('#hoy'); target = view; }
      if (current) scrollPos[current.id] = window.scrollY;
      views.forEach(function (v) { v.classList.toggle('active', v === view); });
      current = view;
      var tab = view.getAttribute('data-tab');
      tabs.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === tab); });
      var back = view.getAttribute('data-back');
      backBtn.hidden = !back;
      if (back) backBtn.setAttribute('href', back);
      titleEl.textContent = view.getAttribute('data-title') || 'Road Trip 2026';
      if (view.id === 'hoy') renderHoy();
      if (view.dataset.day) refresh();
      if (target !== view) {
        target.scrollIntoView({ block: 'center' });
        target.classList.remove('flash');
        void target.offsetWidth;
        target.classList.add('flash');
        var det = target.closest('details');
        if (det) det.open = true;
      } else {
        window.scrollTo(0, scrollPos[view.id] || 0);
      }
      if (view.id === 'buscar') setTimeout(function () { $('#q').focus(); }, 60);
    }
    window.addEventListener('hashchange', function () { show(location.hash); });

    // ---------- tiempo: actividad en curso ----------
    function findDay(t) {
      for (var i = 0; i < dayEls.length; i++) {
        var d = dayEls[i];
        if (t >= +d.dataset.ds && t < +d.dataset.de) return d;
      }
      return null;
    }

    function mark(list, t) {
      var cur = null;
      var nxt = null;
      $$('li.ti', list).forEach(function (li) {
        var s = +li.dataset.s;
        var e = +li.dataset.e;
        li.classList.remove('past', 'now', 'next');
        if (e <= t) li.classList.add('past');
        else if (s <= t) cur = li;
        else if (!nxt) nxt = li;
      });
      if (cur) cur.classList.add('now');
      if (nxt) nxt.classList.add('next');
      return { cur: cur, nxt: nxt };
    }

    function clearMarks() {
      $$('li.ti.past, li.ti.now, li.ti.next').forEach(function (li) { li.classList.remove('past', 'now', 'next'); });
    }

    function markDayList(today) {
      var td = today ? today.dataset.day : null;
      var t = now();
      $$('#dias a[data-day]').forEach(function (a) {
        var d = document.getElementById('d-' + a.dataset.day);
        a.classList.toggle('today', a.dataset.day === td);
        a.classList.toggle('done', t >= +d.dataset.de);
      });
    }

    function refresh() {
      var t = now();
      var today = findDay(t);
      clearMarks();
      if (today) mark($('ol.tl', today), t);
      markDayList(today);
      if (current && current.id === 'hoy') renderHoy();
    }

    function fmtIn(ms) {
      var m = Math.max(0, Math.round(ms / 60000));
      if (m < 60) return m + ' min';
      var h = Math.floor(m / 60);
      var r = m % 60;
      return h + ' h' + (r ? ' ' + pad(r) + ' min' : '');
    }

    // Texto de una actividad sin las etiquetas (Confirmado/Opcional...).
    function plainText(el) {
      var c = el.cloneNode(true);
      $$('.chip', c).forEach(function (x) { x.remove(); });
      return c.textContent.trim();
    }

    function stripIds(node) {
      node.removeAttribute && node.removeAttribute('id');
      $$('[id]', node).forEach(function (n) { n.removeAttribute('id'); });
      return node;
    }

    function nowCard(li, kind, t) {
      var go = $('a.go', li);
      var label = kind === 'now' ? 'Ahora' : 'Siguiente · en ' + fmtIn(+li.dataset.s - t);
      return '<div class="nowcard ' + (kind === 'now' ? 'now' : 'nx') + '"><div><small>' + label + '</small>' +
        '<span class="tmx">' + $('.tm', li).textContent + '</span> · ' + $('.ac', li).innerHTML + '</div>' +
        (go ? '<a class="go" target="_blank" rel="noopener" href="' + go.getAttribute('href') + '">Ir</a>' : '') + '</div>';
    }

    function chkState() {
      try { return JSON.parse(localStorage.getItem('rt26-checklist')) || {}; } catch (e) { return {}; }
    }
    function chkProgress() {
      var boxes = $$('#checklist input[type=checkbox]');
      var st = chkState();
      var done = boxes.filter(function (b) { return st[b.dataset.k]; }).length;
      return { done: done, total: boxes.length };
    }

    function renderHoy() {
      var box = $('#hoy-live');
      var t = now();
      var first = dayEls[0];
      var last = dayEls[dayEls.length - 1];
      var html = '';
      var appendAfter = [];

      if (t < +first.dataset.ds) {
        var left = Math.ceil((+first.dataset.ds - t) / 864e5);
        var ld = new Date(t);
        var localIso = ld.getFullYear() + '-' + pad(ld.getMonth() + 1) + '-' + pad(ld.getDate());
        var firstItem = $('li.ti', first);
        html += '<div class="hero"><p class="eyebrow">Cuenta atrás</p>' +
          (localIso === first.dataset.day
            ? '<p class="big">¡Hoy!</p><h2>Empieza el viaje</h2>'
            : '<p class="big">' + left + '</p><h2>' + (left === 1 ? 'día' : 'días') + ' para el viaje</h2>') +
          '<p>' + first.dataset.long + ' · ' + $('.tm', firstItem).textContent + ' ' + plainText($('.ac', firstItem)) + '</p></div>';
        var p = chkProgress();
        html += '<div class="card"><h4>Lista de comprobación</h4><p>' + p.done + ' de ' + p.total + ' tareas hechas</p>' +
          '<div class="progress"><i style="width:' + Math.round((100 * p.done) / Math.max(1, p.total)) + '%"></i></div>' +
          '<div class="actions"><a class="btn" href="#checklist">Abrir lista</a></div></div>';
        html += '<div class="card"><h4>Documentos del viaje</h4><div id="hoy-docs"></div>' +
          '<div class="actions"><a class="btn" href="#documentos">Ver todos los documentos</a></div></div>';
        appendAfter.push(['#hoy-docs', stripIds($('#doc-resumen ul').cloneNode(true))]);
        html += '<h3>Horas confirmadas</h3><div id="hoy-conf"></div>';
        appendAfter.push(['#hoy-conf', stripIds($('#reservas ul.rv').cloneNode(true))]);
        html += '<div class="actions"><a class="btn" href="#d-' + first.dataset.day + '">Ver el primer día</a><a class="btn" href="#dias">Itinerario completo</a></div>';
      } else if (t >= +last.dataset.de) {
        html += '<div class="hero"><p class="eyebrow">Fin</p><h2>Viaje terminado</h2><p>Esperamos que haya ido genial. El itinerario sigue disponible.</p></div>' +
          '<div class="actions"><a class="btn" href="#dias">Ver itinerario</a></div>';
      } else {
        var day = findDay(t);
        var list = $('ol.tl', day);
        var r = mark(list, t);
        var tz = $('.tznote', day);
        html += '<div class="hero"><p class="eyebrow">Día ' + day.dataset.n + ' de ' + dayEls.length + ' · ' + day.dataset.long + '</p>' +
          '<h2>' + $('.dh h2', day).textContent + '</h2><p>' + $('.dh .route', day).textContent + '</p>' +
          (tz ? '<p class="tznote">' + tz.textContent + '</p>' : '') + '</div>';
        if (r.cur) html += nowCard(r.cur, 'now', t);
        if (r.nxt) html += nowCard(r.nxt, 'next', t);
        if (!r.cur && !r.nxt) {
          var nextDay = dayEls[+day.dataset.n];
          html += '<div class="nowcard"><div><small>Jornada terminada</small>' +
            (nextDay ? 'Buen descanso. <a href="#' + nextDay.id + '">Ver mañana</a>' : 'Buen viaje de vuelta a casa.') + '</div></div>';
        }
        var hotel = day.dataset.hotel && document.getElementById(day.dataset.hotel);
        html += '<h3>Esta noche</h3><div id="hoy-hotel"></div>';
        if (hotel) appendAfter.push(['#hoy-hotel', stripIds(hotel.cloneNode(true))]);
        else appendAfter.push(['#hoy-hotel', document.createTextNode($('.dh .night', day).textContent)]);
        var conf = $$('#reservas li[data-date="' + day.dataset.day + '"]');
        if (conf.length) {
          html += '<h3>Reservas y horas de hoy</h3><ul class="rv" id="hoy-conf"></ul>';
          conf.forEach(function (li) { appendAfter.push(['#hoy-conf', stripIds(li.cloneNode(true))]); });
        }
        html += '<h3>Horario de hoy</h3><div id="hoy-tl"></div>' +
          '<div class="actions"><a class="btn" href="#' + day.id + '">Ficha completa: comidas, claves y traslados</a>' +
          '<a class="btn" href="#documentos">Documentos y reservas</a></div>';
        appendAfter.push(['#hoy-tl', stripIds(list.cloneNode(true))]);
      }
      html += installTip();
      box.innerHTML = html;
      var ib = $('#install-now', box);
      if (ib) ib.addEventListener('click', function () {
        if (!installEvt) return;
        installEvt.prompt();
        installEvt = null;
        ib.hidden = true;
      });
      appendAfter.forEach(function (x) { $(x[0], box).appendChild(x[1]); });
    }

    // ---------- instalación en la pantalla de inicio ----------
    // En la versión con contraseña, la pantalla de acceso guarda el evento si llegó antes que la app.
    var installEvt = window.RT26_INSTALL || null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installEvt = e;
      if (current && current.id === 'hoy') renderHoy();
    });
    function installTip() {
      var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
      if (standalone || !/^https?:$/.test(location.protocol)) return '';
      var ua = navigator.userAgent;
      var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var android = /Android/.test(ua);
      var how = ios
        ? '<p>En Safari, toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba) y elige <b>«Añadir a pantalla de inicio»</b>.</p>'
        : android
          ? '<p>En Chrome, toca el menú <b>⋮</b> y elige <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.</p>'
          : '<p><b>iPhone:</b> en Safari, botón Compartir → «Añadir a pantalla de inicio».<br><b>Android:</b> en Chrome, menú ⋮ → «Instalar aplicación».</p>';
      return '<div class="card tip"><h4>Instálala en el móvil</h4>' + how +
        '<p class="note">Así se abre como una app, a pantalla completa y sin conexión.</p>' +
        (installEvt ? '<div class="actions"><button type="button" class="btn" id="install-now">Instalar ahora</button></div>' : '') + '</div>';
    }

    // ---------- copiar códigos ----------
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button.copy');
      if (!b) return;
      var txt = b.getAttribute('data-copy');
      var done = function () {
        b.textContent = 'Copiado';
        b.classList.add('done');
        setTimeout(function () { b.textContent = 'Copiar'; b.classList.remove('done'); }, 1500);
      };
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { if (document.execCommand('copy')) done(); } catch (er) {}
        ta.remove();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback);
      else fallback();
    });

    // ---------- bloqueo (solo en la versión publicada con contraseña) ----------
    if (typeof window.RT26_LOCK === 'function') {
      var lockItem = $('#lock-item');
      lockItem.hidden = false;
      $('a[data-lock]', lockItem).addEventListener('click', function (e) {
        e.preventDefault();
        if (window.confirm('¿Bloquear la app en este móvil? La próxima vez tendrás que escribir la contraseña.')) window.RT26_LOCK();
      });
    }

    // ---------- búsqueda ----------
    var index = null;
    var norm = function (s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
    var escH = function (s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    function search(qs) {
      if (!index) {
        index = $$('.srch').filter(function (el) { return !el.closest('#hoy'); }).map(function (el) {
          return { el: el, text: norm(el.textContent + ' ' + (el.dataset.c || '')) };
        });
      }
      var out = $('#results');
      var words = norm(qs).split(/\s+/).filter(Boolean);
      if (!words.length) { out.innerHTML = ''; return; }
      var hits = index.filter(function (it) { return words.every(function (w) { return it.text.indexOf(w) >= 0; }); });
      if (!hits.length) { out.innerHTML = '<p class="note">Sin resultados.</p>'; return; }
      out.innerHTML = hits.slice(0, 80).map(function (h) {
        var title = ($('.st', h.el) || h.el).textContent.trim();
        return '<a class="res" href="' + h.el.dataset.h + '"><small>' + escH(h.el.dataset.c || '') + '</small><span>' +
          escH(title.length > 170 ? title.slice(0, 167) + '…' : title) + '</span></a>';
      }).join('') + (hits.length > 80 ? '<p class="note">Mostrando 80 de ' + hits.length + '.</p>' : '');
    }
    var timer = null;
    $('#q').addEventListener('input', function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () { search(e.target.value); }, 120);
    });

    // ---------- lista de comprobación ----------
    function updateCount() {
      var p = chkProgress();
      $('#chk-count').textContent = p.done + ' de ' + p.total + ' hechas.';
    }
    $$('#checklist input[type=checkbox]').forEach(function (cb) {
      cb.checked = !!chkState()[cb.dataset.k];
      cb.addEventListener('change', function () {
        var st = chkState();
        st[cb.dataset.k] = cb.checked;
        try { localStorage.setItem('rt26-checklist', JSON.stringify(st)); } catch (e) {}
        updateCount();
      });
    });
    updateCount();

    // ---------- arranque ----------
    dayEls.forEach(function (d) { d.dataset.long = $('.dh .eyebrow', d).textContent.split(' · ').slice(1).join(' · '); });
    show(location.hash);
    refresh();
    setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  } catch (err) {
    // Si algo falla, se muestra todo el contenido sin navegación por pestañas.
    document.documentElement.className = '';
    if (window.console) console.error(err);
  }
})();
