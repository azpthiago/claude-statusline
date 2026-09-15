#!/usr/bin/env node
/**
 * Instalador da statusline.
 *
 *   node scripts/setup.js              instala ou atualiza
 *   node scripts/setup.js --uninstall  remove a statusline do settings.json
 *   node scripts/setup.js --padding 1  instala com outro recuo lateral
 *   node scripts/setup.js --dry-run    mostra o que faria, sem escrever
 *
 * O script preserva o restante do settings.json e guarda um backup antes
 * de qualquer alteracao.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DRY = has('--dry-run');
const UNINSTALL = has('--uninstall');
const PADDING = Number(valueOf('--padding', '0'));
const CLAUDE_DIR = path.resolve(valueOf('--claude-dir', path.join(os.homedir(), '.claude')));
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const TARGET = path.join(CLAUDE_DIR, 'statusline.js');
const CONFIG = path.join(CLAUDE_DIR, 'statusline.config.json');
const SRC_DIR = path.resolve(__dirname, '..');

const log = (msg) => console.log((DRY ? '[dry-run] ' : '') + msg);
const fail = (msg) => {
  console.error('erro: ' + msg);
  process.exit(1);
};

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  if (DRY) return;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = file + '.backup-' + stamp;
  if (!DRY) fs.copyFileSync(file, dest);
  return dest;
}

// o Node exige aspas no Windows por causa dos espacos em "C:\Users\..."
function commandFor(scriptPath) {
  return 'node "' + scriptPath + '"';
}

function install() {
  const source = path.join(SRC_DIR, 'statusline.js');
  if (!fs.existsSync(source)) fail('statusline.js nao encontrado em ' + SRC_DIR);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) fail('Node 18 ou superior e necessario (encontrado ' + process.versions.node + ')');

  if (!fs.existsSync(CLAUDE_DIR)) {
    log('criando ' + CLAUDE_DIR);
    if (!DRY) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  log('instalando statusline.js em ' + TARGET);
  if (!DRY) fs.copyFileSync(source, TARGET);

  // a config do usuario nunca e sobrescrita
  if (fs.existsSync(CONFIG)) {
    log('mantendo configuracao existente em ' + CONFIG);
  } else {
    const example = path.join(SRC_DIR, 'statusline.config.example.json');
    log('criando configuracao inicial em ' + CONFIG);
    if (!DRY) fs.copyFileSync(example, CONFIG);
  }

  const settings = readJSON(SETTINGS, {});
  const bak = backup(SETTINGS);
  if (bak) log('backup do settings.json em ' + path.basename(bak));

  settings.statusLine = {
    type: 'command',
    command: commandFor(TARGET),
    padding: PADDING,
  };
  writeJSON(SETTINGS, settings);
  log('settings.json atualizado (padding ' + PADDING + ')');

  console.log('');
  console.log('Pronto. Reinicie o Claude Code para ver a barra.');
  console.log('Ajuste os tetos de uso em: ' + CONFIG);
}

function uninstall() {
  const settings = readJSON(SETTINGS, null);
  if (!settings) fail('settings.json nao encontrado em ' + SETTINGS);

  if (settings.statusLine) {
    const bak = backup(SETTINGS);
    if (bak) log('backup do settings.json em ' + path.basename(bak));
    delete settings.statusLine;
    writeJSON(SETTINGS, settings);
    log('statusLine removida do settings.json');
  } else {
    log('nenhuma statusLine configurada');
  }

  for (const f of [TARGET, path.join(CLAUDE_DIR, 'statusline-cache.json')]) {
    if (fs.existsSync(f)) {
      log('removendo ' + f);
      if (!DRY) fs.unlinkSync(f);
    }
  }
  log('a configuracao em ' + CONFIG + ' foi mantida');
}

if (UNINSTALL) uninstall();
else install();
