#!/usr/bin/env node
// Genera la versión protegida con contraseña en docs/ (lista para GitHub Pages) y guarda los datos cifrados en
// src/datos.cifrados.json, para que el repositorio pueda ser público sin exponer el itinerario.
// Contraseña: variable RT26_CLAVE o archivo .clave (se crea una nueva si no existe; nunca se publica).
// Uso: node publish.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const CLAVE_FILE = path.join(ROOT, '.clave');
const CONF_FILE = path.join(ROOT, 'src/cifrado.json');
const DATA_DIR = path.join(ROOT, 'src/data');
const BUNDLE_FILE = path.join(ROOT, 'src/datos.cifrados.json');
const OUT = path.join(ROOT, 'docs');
const ITER = 600000; // PBKDF2-SHA256

function newPassphrase() {
  // La lista de palabras no se publica (.gitignore); sin ella se genera una clave aleatoria más larga.
  const file = path.join(ROOT, 'tools/palabras.js');
  if (!fs.existsSync(file)) return crypto.randomBytes(12).toString('base64url');
  const W = require(file);
  const pick = () => W[crypto.randomInt(W.length)];
  return [pick(), pick(), pick(), pick()].join('-') + '-' + crypto.randomInt(10, 100);
}

function loadSecret() {
  let pw = process.env.RT26_CLAVE || (fs.existsSync(CLAVE_FILE) ? fs.readFileSync(CLAVE_FILE, 'utf8').trim() : '');
  let created = false;
  if (!pw) {
    pw = newPassphrase();
    fs.writeFileSync(CLAVE_FILE, pw + '\n', { mode: 0o600 });
    created = true;
  }
  let conf = fs.existsSync(CONF_FILE) ? JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')) : null;
  if (!conf || created) {
    // Sal fija mientras no cambie la contraseña: así la clave recordada en los móviles sigue valiendo tras cada actualización.
    conf = { salt: crypto.randomBytes(16).toString('base64'), iter: ITER };
    fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2) + '\n');
  }
  const key = crypto.pbkdf2Sync(pw.trim().normalize('NFC'), Buffer.from(conf.salt, 'base64'), conf.iter, 32, 'sha256');
  return { key, conf, created };
}

function encrypt(key, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]); // mismo formato que WebCrypto: cifrado || etiqueta
  return { iv: iv.toString('base64'), data: data.toString('base64') };
}

function decrypt(key, ivB64, dataB64) {
  const buf = Buffer.from(dataB64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]);
}

// Devuelve true si el contenido cifrado existente ya corresponde a `plain` (evita cambios inútiles en git).
function unchanged(key, ivB64, dataB64, plain) {
  try {
    return decrypt(key, ivB64, dataB64).equals(plain);
  } catch (e) {
    return false;
  }
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

function main() {
  const { key, conf, created } = loadSecret();
  execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit' });
  const html = fs.readFileSync(path.join(ROOT, 'dist/index.html'));
  fs.mkdirSync(OUT, { recursive: true });

  // 1) Página publicada: pantalla de acceso + app cifrada.
  const outIndex = path.join(OUT, 'index.html');
  let lockHtml = null;
  if (fs.existsSync(outIndex)) {
    const prev = fs.readFileSync(outIndex, 'utf8');
    const iv = (prev.match(/IV = "([^"]+)"/) || [])[1];
    const data = (prev.match(/DATA = "([^"]+)"/) || [])[1];
    if (iv && data && prev.includes(JSON.stringify(conf.salt)) && unchanged(key, iv, data, html)) lockHtml = prev;
  }
  if (!lockHtml) {
    const enc = encrypt(key, html);
    lockHtml = fs
      .readFileSync(path.join(ROOT, 'src/lock.html'), 'utf8')
      .replace("'__SALT__'", () => JSON.stringify(conf.salt))
      .replace("'__IV__'", () => JSON.stringify(enc.iv))
      .replace("'__DATA__'", () => JSON.stringify(enc.data))
      .replace('__ITER__', () => String(conf.iter));
    fs.writeFileSync(outIndex, lockHtml);
  }
  for (const f of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    fs.copyFileSync(path.join(ROOT, 'dist', f), path.join(OUT, f));
  }
  fs.writeFileSync(path.join(OUT, 'sw.js'), fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8').replace('__VERSION__', sha(lockHtml)));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  // 2) Datos fuente cifrados (para poder actualizar la app desde otra sesión con la misma contraseña).
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.js')).sort();
  const bundle = Buffer.from(JSON.stringify(Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(DATA_DIR, f), 'utf8')]))));
  let keepBundle = false;
  if (fs.existsSync(BUNDLE_FILE)) {
    const b = JSON.parse(fs.readFileSync(BUNDLE_FILE, 'utf8'));
    keepBundle = b.salt === conf.salt && unchanged(key, b.iv, b.data, bundle);
  }
  if (!keepBundle) {
    const e = encrypt(key, bundle);
    fs.writeFileSync(BUNDLE_FILE, JSON.stringify({ formato: 'AES-256-GCM, clave PBKDF2-SHA256', salt: conf.salt, iter: conf.iter, iv: e.iv, data: e.data }) + '\n');
  }

  // Comprobación final: la página publicada no debe contener texto del itinerario en claro.
  // Las muestras salen de los datos locales (no se escriben aquí porque este archivo se publica).
  const probes = [
    ...require('./src/data/docs').flatMap((d) => d.codes.map((c) => c[1])),
    ...require('./src/data/annex').hotels.map((h) => h.name),
    ...require('./src/data/days1').map((d) => d.title),
  ];
  const leaked = probes.filter((p) => lockHtml.includes(p));
  if (leaked.length) throw new Error(`docs/index.html contiene ${leaked.length} textos sin cifrar`);
  console.log(`docs/ listo · página ${(lockHtml.length / 1024).toFixed(0)} KB · versión ${sha(lockHtml)}${created ? ' · contraseña NUEVA guardada en .clave' : ''}`);
}

main();
