// BÓVEDA DE ENLACES PRIVADOS · VIAJE USA 2026 (versión pruebas)
// ---------------------------------------------------------------
// Cifrado: PBKDF2(250 000 iter, SHA-256) → AES-256-GCM
// Persistencia: IndexedDB separada del itinerario (mismo origen, dbName distinto)
// Clave maestra: solo en memoria durante la sesión; se borra al bloquear/cerrar.
// IPM: ninguna auth_key queda reflejada en el código fuente ni en la caché.
// ---------------------------------------------------------------
(function () {
  'use strict';

  // ---------- configuración ----------
  var KDF_ITER  = 250000;
  var DB_NAME   = 'rt26-bodega-test';   // sufijo -test para que sea independiente de producción
  var STORE     = 'reservas';
  var PUB_KEY   = '__pub__';            // clave del registro público/contador de version
  var T_IDLE    = 15 * 60 * 1000;       // 15 minutos
  var VERSION   = 1;

  // ---------- estado ----------
  var saltBuf      = null;              // Uint8Array (16 bytes), generado o leído
  var masterKey    = null;              // CryptoKey AES-GCM-256, solo RAM
  var encryptedBuf = null;              // Array<{cid, url, nm}> descifrado
  var unlocked     = false;
  var idleTimer    = null;

  // ---------- utilidades binarias ----------
  function h2u(hex) {
    var u = new Uint8Array(hex.length >> 1);
    for (var i = 0; i < hex.length; i += 2) u[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
    return u;
  }
  function u2h(u) {
    var hex = '';
    for (var i = 0; i < u.length; i++) hex += ('0' + u[i].toString(16)).slice(-2);
    return hex;
  }
  function buf2b64(buf) {
    var bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : buf;
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64tobuf(b) {
    var s = atob(b);
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  // ---------- cripto ----------
  function deriveKey(password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')),
           'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: saltBuf, iterations: KDF_ITER, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function encryptPayload(key, ptBuf) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, ptBuf)
      .then(function (ct) { return { iv: buf2b64(iv), ct: buf2b64(ct) }; });
  }
  function decryptPayload(key, ivB64, ctB64) {
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64tobuf(ivB64) }, key, b64tobuf(ctB64))
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }

  // ---------- IndexedDB ----------
  var dbConn = null;
  function openDb() {
    if (dbConn) return Promise.resolve(dbConn);
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      r.onsuccess = function (e) { resolve(e.target.result); };
      r.onerror   = function (e) { reject(r.error); };
    });
  }
  function dbGet(k) {
    return openDb().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(STORE, 'readonly');
        var r  = tx.objectStore(STORE).get(k);
        tx.oncomplete = function () { res(r.result); };
        tx.onerror    = function () { res(null); };
      });
    });
  }
  function dbPut(v, k) {
    return openDb().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = function () { res(true); };
        tx.onerror    = function () { res(false); };
      });
    });
  }

  // ---------- manejo de sesión ----------
  function resetIdle() {
    if (!unlocked) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(autoLock, T_IDLE);
  }
  function autoLock() { locked(); }
  window.addEventListener('touchstart', resetIdle, { passive: true });
  window.addEventListener('mousedown',  resetIdle, { passive: true });
  window.addEventListener('keydown',    resetIdle, { passive: true });

  function locked() {
    unlocked     = false;
    masterKey    = null;
    encryptedBuf = null;
    saltBuf      = null;
    clearTimeout(idleTimer);
    _showLockForm();
    _updateHotelButtons();
  }

  // ---------- desbloqueo / creación ----------
  function unlockOrPw(pw) {
    return dbGet(PUB_KEY).then(function (rec) {
      if (!rec) return createVault(pw);        // primera vez
      saltBuf = h2u(rec.salt);                  // usar el salt almacenado
      return deriveKey(pw).then(function (k) {
        masterKey = k;
        if (!rec.dataIv || !rec.dataCt) {
          // Registro incompleto (transición): crear nuevo
          encryptedBuf = [];
          return rec;
        }
        return decryptPayload(k, rec.dataIv, rec.dataCt).then(function (txt) {
          encryptedBuf = JSON.parse(txt);
          return rec;
        }).catch(function () { throw 'wrong'; });
      });
    }).then(function () {
      unlocked = true;
      resetIdle();
      _notifyUnlock();
    }, function (err) {
      if (err === 'wrong') {
        masterKey = null; saltBuf = null;
        throw 'password-wrong';
      }
      throw err;
    });
  }

  function createVault(pw) {
    saltBuf = crypto.getRandomValues(new Uint8Array(16));
    return deriveKey(pw).then(function (k) {
      masterKey    = k;
      encryptedBuf = [];
      return dbPut({ salt: u2h(saltBuf), ver: VERSION }, PUB_KEY);
    });
  }

  function persistData() {
    if (!masterKey || !saltBuf) return Promise.resolve();
    var plain   = JSON.stringify(encryptedBuf);
    var payload = new TextEncoder().encode(plain);
    return encryptPayload(masterKey, payload).then(function (enc) {
      return dbGet(PUB_KEY).then(function (rec) {
        rec = rec || { salt: u2h(saltBuf), ver: VERSION };
        rec.dataIv = enc.iv;
        rec.dataCt = enc.ct;
        return dbPut(rec, PUB_KEY);
      });
    });
  }

  // ---------- interfaz ----------
  var overlayEl, panelEl, formEl, msgEl, pwField, goBtn, remindLabel, listEl,
      unlockBtn, lockBtn, addBtn, exportBtn, importBtn, ctrlRow;
  var editModal, cardId, cardNameInput, cardUrlInput, cardSubmitBtn, cardCancelBtn, cardDeleteBtn;
  var currentEditCid = null;

  // Construye toda la UI sobre el body (sin modificar HTML existente)
  function init() {
    // --- Overlay contenedor ---
    overlayEl = document.createElement('div');
    overlayEl.className = 'bv-overlay';
    overlayEl.hidden = true;

    // --- Formulario de contraseña ---
    formEl      = document.createElement('form');
    formEl.className = 'bv-form';
    msgEl       = document.createElement('p');
    msgEl.className = 'bv-msg';
    goBtn       = document.createElement('button');
    goBtn.type  = 'button';
    goBtn.className = 'bv-go';
    goBtn.textContent = 'Desbloquear';
    pwField     = document.createElement('input');
    pwField.type  = 'password';
    pwField.id    = 'bv-pw';
    pwField.autocomplete = 'current-password';
    pwField.autocapitalize = 'none';
    pwField.autocorrect  = 'off';
    pwField.spellcheck = false;
    pwField.placeholder = 'Contraseña de la bóveda';

    var pvWrap = document.createElement('div');
    pvWrap.className = 'bv-pwrow';
    pvWrap.appendChild(pwField);
    var verBtn = document.createElement('button');
    verBtn.type = 'button';
    verBtn.className = 'bv-ver';
    verBtn.textContent = 'Ver';
    verBtn.onclick = function () {
      var t = pwField.type === 'password';
      pwField.type = t ? 'text' : 'password';
      verBtn.textContent = t ? 'Ocultar' : 'Ver';
    };
    pvWrap.appendChild(verBtn);

    remindLabel = document.createElement('label');
    remindLabel.className = 'bv-rem';
    remindLabel.innerHTML = '<input type="checkbox"> Recordar contraseña en este dispositivo';
    remindLabel.style.display = 'none';   // oculto por defecto; no se guarda la clave por seguridad

    formEl.appendChild(document.createTextNode('Contraseña: '));
    formEl.appendChild(pvWrap);
    formEl.appendChild(remindLabel);
    formEl.appendChild(goBtn);
    formEl.appendChild(msgEl);
    goBtn.onclick = function () {
      var pw = pwField.value.trim();
      if (!pw) { msgEl.textContent = 'Introduce una contraseña.'; return; }
      msgEl.textContent = 'Comprobando…';
      goBtn.disabled = true;
      unlockOrPw(pw).then(function () {
        overlayEl.hidden = true;
        _showPanel();
      }, function (err) {
        goBtn.disabled = false;
        msgEl.textContent = err === 'password-wrong' ? 'Contraseña incorrecta.' : 'Error al acceder. ¿Está la base de datos disponible?';
      });
    };
    formEl.addEventListener('submit', function (e) { e.preventDefault(); goBtn.click(); });
    overlayEl.appendChild(formEl);

    // --- Panel principal ---
    panelEl = document.createElement('section');
    panelEl.className = 'bv-panel';

    var titleEl = document.createElement('h2');
    titleEl.textContent = 'Enlaces privados de Booking';
    panelEl.appendChild(titleEl);

    unlockBtn = document.createElement('button');
    unlockBtn.className = 'bv-unlock-btn';
    unlockBtn.textContent = '🔓 Abrir bóveda';
    unlockBtn.onclick = function () { _showLockForm(); };

    lockBtn = document.createElement('button');
    lockBtn.className = 'bv-lock-btn';
    lockBtn.textContent = '🔒 Bloquear bóveda';
    lockBtn.hidden = true;
    lockBtn.onclick = function () { locked(); };

    addBtn = document.createElement('button');
    addBtn.className = 'bv-add-btn';
    addBtn.textContent = '+ Añadir enlace privado';
    addBtn.hidden = true;
    addBtn.onclick = function () { _openEdit(null); };

    listEl = document.createElement('div');
    listEl.className = 'bv-list';
    listEl.hidden = true;

    ctrlRow = document.createElement('div');
    ctrlRow.className = 'bv-ctrls';
    ctrlRow.hidden = true;

    exportBtn = document.createElement('button');
    exportBtn.className = 'bv-exp-btn';
    exportBtn.textContent = '⬇ Exportar copia cifrada';
    exportBtn.onclick = _doExport;

    importBtn = document.createElement('button');
    importBtn.className = 'bv-imp-btn';
    importBtn.textContent = '⬆ Importar copia cifrada';
    importBtn.onclick = _doImport;

    ctrlRow.appendChild(exportBtn);
    ctrlRow.appendChild(importBtn);

    // Cambiar contraseña
    var changePwBtn = document.createElement('button');
    changePwBtn.className = 'bv-lock-btn';
    changePwBtn.textContent = '🔑 Cambiar contraseña';
    changePwBtn.onclick = _changePassword;
    ctrlRow.appendChild(changePwBtn);
    panelEl.appendChild(unlockBtn);
    panelEl.appendChild(lockBtn);
    panelEl.appendChild(addBtn);
    panelEl.appendChild(listEl);
    panelEl.appendChild(ctrlRow);
    overlayEl.appendChild(panelEl);

    // --- Modal de edición ---
    editModal = document.createElement('div');
    editModal.className = 'bv-modal';
    editModal.hidden = true;
    overlayEl.appendChild(editModal);

    var mc = document.createElement('div');
    mc.className = 'bv-card';
    cardId         = document.createElement('span'); cardId.className = 'bv-card-id';
    cardNameInput  = document.createElement('input'); cardNameInput.type = 'text';
    cardNameInput.className = 'bv-input';
    cardNameInput.placeholder = 'Etiqueta (opcional)';
    cardUrlInput   = document.createElement('input'); cardUrlInput.type = 'url';
    cardUrlInput.className = 'bv-input';
    cardUrlInput.placeholder = 'https://www.booking.com/…';
    cardSubmitBtn  = document.createElement('button'); cardSubmitBtn.className = 'bv-submit';
    cardSubmitBtn.textContent = 'Guardar enlace';
    cardCancelBtn  = document.createElement('button'); cardCancelBtn.className = 'bv-cancel';
    cardCancelBtn.textContent = 'Cancelar';
    cardDeleteBtn  = document.createElement('button'); cardDeleteBtn.className = 'bv-delete';
    cardDeleteBtn.textContent = 'Eliminar';
    cardDeleteBtn.hidden = true;

    mc.appendChild(cardId);
    mc.appendChild(document.createElement('p')).textContent = 'Etiqueta:';
    mc.appendChild(cardNameInput);
    mc.appendChild(document.createElement('p')).textContent = 'URL de la reserva:';
    mc.appendChild(cardUrlInput);
    mc.appendChild(cardSubmitBtn);
    mc.appendChild(cardCancelBtn);
    mc.appendChild(cardDeleteBtn);
    editModal.appendChild(mc);

    // Botones de acción del modal
    var closeM = document.createElement('button');
    closeM.type = 'button';
    closeM.className = 'bv-close-m';
    closeM.textContent = '✕';
    closeM.onclick = function () { editModal.hidden = true; };
    editModal.appendChild(closeM);

    cardCancelBtn.onclick = function () { editModal.hidden = true; };
    cardSubmitBtn.onclick = _submitEdit;
    cardDeleteBtn.onclick = function () {
      if (!confirm('¿Eliminar el enlace de ' + (cardId.textContent || '') + '?')) return;
      encryptedBuf = encryptedBuf.filter(function (e) { return e.cid !== cardId.textContent.trim(); });
      persistData().then(function () { editModal.hidden = true; _refreshList(); _updateHotelButtons(); });
    };

    document.body.appendChild(overlayEl);

    // Iniciar oculto; se abre manualmente desde el menú "Más" o hash #bodega
    overlayEl.hidden = true;

    // Delegación de eventos: botones "Añadir enlace privado" en tarjetas de hoteles
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-hotel-id]');
      if (!btn) return;
      e.preventDefault();
      var cid = btn.getAttribute('data-hotel-id');
      if (window.__BV && window.__BV.openForHotel) window.__BV.openForHotel(cid);
    }, true);

    // Hook para que el build pueda abrir la bóveda desde fuera (hash #bodega)
    window.__BV_OPEN_BODEGA = function () {
      if (unlocked) { _showPanel(); }
      else { _showLockForm(); }
    };
    // Hook para detectar cambios de hash e iniciar si es #bodega
    var checkHash = function () {
      if (location.hash === '#bodega') {
        location.hash = '#bodega';
        __BV_OPEN_BODEGA();
      }
    };
    window.addEventListener('hashchange', checkHash);
    setTimeout(checkHash, 500);
  }

  function _showLockForm() {
    overlayEl.hidden = false;
    formEl.style.display = '';
    panelEl.style.display = 'none';
    msgEl.textContent = '';
    goBtn.disabled = false;
    goBtn.textContent = 'Crear bóveda';
    remindLabel.style.display = 'none';
    editModal.hidden = true;
    pwField.value = '';
    setTimeout(function () { pwField.focus(); }, 80);
    // Detectar modo crear vs desbloquear
    dbGet(PUB_KEY).then(function (rec) {
      if (rec && rec.ver >= VERSION) {
        goBtn.textContent = 'Desbloquear';
      } else {
        goBtn.textContent = 'Crear bóveda';
      }
    });
  }

  function _showPanel() {
    overlayEl.hidden = false;
    formEl.style.display = 'none';
    panelEl.style.display = '';
    unlockBtn.hidden = true;
    lockBtn.hidden = false;
    addBtn.hidden  = false;
    listEl.hidden  = false;
    ctrlRow.hidden = false;
    editModal.hidden = true;
    _refreshList();
    _updateHotelButtons();
  }

  function _refreshList() {
    listEl.innerHTML = '';
    var hotels = [
      { id: 'H1', name: 'Eurostars Magnificent Mile' },
      { id: 'H2', name: 'Quality Inn Cincinnati' },
      { id: 'H3', name: 'Casa de los amigos' },
      { id: 'H4', name: 'Comfort Inn Memphis' },
      { id: 'H5', name: 'Comfort Inn Pearl-Jackson' },
      { id: 'H6', name: 'The Troubadour Hotel' },
      { id: 'H7', name: 'Super 8 Pasadena' },
      { id: 'H8', name: 'La Quinta San Antonio' },
      { id: 'H9', name: 'Super 8 Austin' },
      { id: 'H10', name: 'La Quinta Dallas North' },
      { id: 'H11', name: 'Sleep Inn Tulsa' },
      { id: 'H12', name: 'Quality Inn Springfield' },
    ];
    var linked = 0;
    hotels.forEach(function (h) {
      var rec = encryptedBuf.find(function (e) { return e.cid === h.id; });
      if (rec) linked++;
      var row = document.createElement('div');
      row.className = 'bv-row' + (rec ? ' bv-linked' : '');
      row.setAttribute('data-cid', h.id);

      var idSp = document.createElement('span');
      idSp.className = 'bv-id';
      idSp.textContent = h.id;

      var nmSp = document.createElement('span');
      nmSp.className = 'bv-name';
      nmSp.textContent = rec ? (rec.nm || h.name) : h.name;

      var dotSp = null;
      if (rec) {
        dotSp = document.createElement('span');
        dotSp.className = 'bv-dot';
        dotSp.title = 'Enlace privado guardado';
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bv-edit';
      btn.textContent = rec ? 'Cambiar enlace' : 'Añadir enlace';
      btn.onclick = function () { _openEdit(h.id); };

      row.appendChild(idSp);
      row.appendChild(nmSp);
      if (dotSp) row.appendChild(dotSp);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
    var stats = document.createElement('p');
    stats.className = 'bv-stats';
    stats.textContent = linked + ' de ' + hotels.length + ' hoteles con enlace privado.';
    listEl.appendChild(stats);
  }

  function _openEdit(cid) {
    var existing = cid ? encryptedBuf.find(function (e) { return e.cid === cid; }) : null;
    cardId.textContent = cid || '(nuevo)';
    cardNameInput.value = existing ? (existing.nm || '') : '';
    cardUrlInput.value  = existing ? (existing.url || '') : '';
    cardSubmitBtn.textContent = existing ? 'Guardar cambios' : 'Guardar enlace';
    cardDeleteBtn.hidden = !existing;
    editModal.hidden = false;
    currentEditCid = cid;
    setTimeout(function () { cardUrlInput.focus(); }, 80);
  }

  function _submitEdit() {
    var cid  = cardId.textContent.trim();
    var url  = cardUrlInput.value.trim();
    var nm   = cardNameInput.value.trim();
    if (!url) { msgEl.textContent = 'Introduce una URL de reserva.'; return; }
    try { new URL(url); } catch (_) { msgEl.textContent = 'URL no válida.'; return; }
    // Solo permitir HTTPS + dominio booking.com para proteger enlaces privados
    var u;
    try { u = new URL(url); } catch (_) { return; }
    if (u.protocol !== 'https:' || !/\.booking\.com$/i.test(u.hostname)) {
      msgEl.textContent = 'Solo se permiten enlaces seguros de booking.com.'; return;
    }
    msgEl.textContent = 'Guardando…';
    var entry = { cid: cid, url: url, nm: nm, updated: Date.now() };
    var idx = encryptedBuf.findIndex(function (e) { return e.cid === cid; });
    if (idx >= 0) encryptedBuf[idx] = entry;
    else encryptedBuf.push(entry);
    persistData().then(function () {
      msgEl.textContent = '';
      cardUrlInput.value = '';
      cardNameInput.value = '';
      editModal.hidden = true;
      _refreshList();
      _updateHotelButtons();
    }, function () { msgEl.textContent = 'Error al guardar.'; });
  }

  function _doExport() {
    if (!masterKey) { alert('Primero desbloquea la bóveda.'); return; }
    var plain   = JSON.stringify(encryptedBuf);
    encryptPayload(masterKey, new TextEncoder().encode(plain)).then(function (enc) {
      var blob = new Blob([JSON.stringify({ v: 1, t: Date.now(), d: { salt: u2h(saltBuf), pub: PUB_KEY, iv: enc.iv, ct: enc.ct } })],
                          { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bodega-viaje-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, function () { alert('Error al generar la copia.'); });
  }

  function _doImport() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var j = JSON.parse(e.target.result);
          if (!j.v || !j.d || !j.d.salt || !j.d.ct) { alert('Archivo de copia no válido.'); return; }
          if (!confirm('Esto sustituirá los ' + (encryptedBuf ? encryptedBuf.length : 0) + ' enlaces actuales.\n\nContinuar?')) return;
          saltBuf = h2u(j.d.salt);
          // Re-derive key for the imported file's salt (password may differ)
          var importPw = prompt('Contraseña para importar este archivo (debe ser la que se usó al exportar):');
          if (!importPw) return;
          deriveKey(importPw).then(function (k) {
            return decryptPayload(k, j.d.iv, j.d.ct).then(function (txt) {
              encryptedBuf = JSON.parse(txt);
              masterKey    = k;
              persistData().then(function () { _refreshList(); _updateHotelButtons(); });
            });
          }, function () { alert('Error: clave incorrecta o archivo corrupto.'); });
        } catch (ex) { alert('Formato de archivo incorrecto.'); }
      };
      reader.readAsText(file);
    };
    inp.click();
  }

  function _notifyUnlock() {
    if (typeof window.__BV_ON_UNLOCK === 'function') window.__BV_ON_UNLOCK();
  }

  function _changePassword() {
    var oldPw = prompt('Contraseña actual:');
    if (!oldPw) return;
    if (!masterKey) { alert('La bóveda no está desbloqueada.'); return; }
    var newPw1 = prompt('Nueva contraseña:');
    if (!newPw1) return;
    var newPw2 = prompt('Repita la nueva contraseña:');
    if (newPw1 !== newPw2) { alert('Las contraseñas no coinciden.'); return; }
    // Re-derive new key
    deriveKey(newPw1).then(function (newKey) {
      masterKey = newKey;
      // Re-encrypt all data with new key
      persistData().then(function () {
        alert('Contraseña cambiada. La bóveda permanecerá abierta.');
      }, function () { alert('Error al re-cifrar los datos.'); });
    });
  }

  // Actualiza botones "Ver mi reserva" / "Añadir enlace privado" en tarjetas de hoteles del DOM
    function _updateHotelButtons() {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('[data-hotel-id]').forEach(function (btn) {
        var cid = btn.getAttribute('data-hotel-id');
        if (!cid) return;
        var link = getLink(cid);
        if (link) {
          btn.textContent = '✏ Cambiar enlace privado';
          // Si es un <a> (renderizado como "Ver mi reserva"), actualizar href
          if (btn.tagName === 'A') {
            btn.href = link;
            btn.textContent = 'Ver mi reserva';
          }
        } else {
          btn.textContent = '🔗 Añadir enlace privado';
          // Si es un <a>, volver a botón
          if (btn.tagName === 'A') {
            btn.outerHTML = '<button type="button" class="btn bv-link-btn" data-hotel-id="' + escAttr(cid) + '">🔗 Añadir enlace privado</button>';
          }
        }
      });
    }

    function getLink(cid) {
      var e = encryptedBuf && encryptedBuf.find(function (x) { return x.cid === cid; });
      return e ? e.url : null;
    }

    function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    // ---------- API pública ----------
  window.__BV = {
    init: init,
    isUnlocked: function () { return unlocked; },
    getLink: getLink,
    hasLink: function (cid) { return !!getLink(cid); },
    openView: function () { __BV_OPEN_BODEGA(); },
    updateHotelButtons: _updateHotelButtons,
    // Abre la bóveda y pone el editor en el hotel indicado
    openForHotel: function (cid) {
      if (!unlocked) { _showLockForm(); return; }
      __BV_OPEN_BODEGA();
      setTimeout(function () { _openEdit(cid); }, 100);
    }
  };

  // ---------- pruebas automatizadas (solo se activa si se define __BV_TEST__) ----------
  if (typeof window !== 'undefined' && window.__BV_TEST__) {
    window.__BV_TEST__ = {
      setUnlock: function (v) { unlocked = v; },
      forcePw: function (pw) { saltBuf = null; return unlockOrPw(pw); },
      create: createVault,
      persist: persistData,
      _submitEdit: _submitEdit,
      _doImport: _doImport,
      _doExport: _doExport,
      setEdit: function (cid, url, nm) {
        cardId.textContent = cid;
        cardUrlInput.value = url || '';
        cardNameInput.value = nm || '';
      },
      getMsg: function () { return msgEl ? msgEl.textContent : ''; },
      setMsg: function (t) { if (msgEl) msgEl.textContent = t; },
      getCard: function () { return { cid: cardId.textContent, url: cardUrlInput.value, nm: cardNameInput.value }; },
      showEdit: function () { return editModal ? !editModal.hidden : false; },
      get: function () { return encryptedBuf; },
      setData: function (d) { encryptedBuf = d; },
      setSalt: function (u8) { saltBuf = u8; },
      getSalt: function () { return saltBuf; },
      getKey: function () { return masterKey; },
      isUnlocked: function () { return unlocked; },
      locked: locked,
      _updateHotelButtons: _updateHotelButtons,
      _openEdit: _openEdit,
      _refreshList: _refreshList,
      getLink: getLink,
      DB_NAME: DB_NAME,
      PUB_KEY: PUB_KEY
    };
  }

  // Arranque
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
