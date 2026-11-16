#!/usr/bin/env node
// Recupera src/data/*.js desde src/datos.cifrados.json (por ejemplo, en una sesión nueva con el repositorio clonado).
// Contraseña: variable RT26_CLAVE o archivo .clave. Uso: node tools/descifrar-datos.js [--forzar]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const pw = (process.env.RT26_CLAVE || fs.readFileSync(path.join(ROOT, '.clave'), 'utf8')).trim().normalize('NFC');
const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/datos.cifrados.json'), 'utf8'));
const key = crypto.pbkdf2Sync(pw, Buffer.from(b.salt, 'base64'), b.iter, 32, 'sha256');
const buf = Buffer.from(b.data, 'base64');
const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(b.iv, 'base64'));
d.setAuthTag(buf.subarray(buf.length - 16));
let files;
try {
  files = JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
} catch (e) {
  console.error('Contraseña incorrecta o archivo dañado.');
  process.exit(1);
}
const dir = path.join(ROOT, 'src/data');
fs.mkdirSync(dir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const target = path.join(dir, path.basename(name));
  if (fs.existsSync(target) && !process.argv.includes('--forzar')) {
    console.log('Ya existe, no se sobrescribe: ' + name);
    continue;
  }
  fs.writeFileSync(target, content);
  console.log('Recuperado: ' + name);
}
