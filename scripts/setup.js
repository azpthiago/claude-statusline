#!/usr/bin/env node
/**
 * Instalador da statusline.
 *
 *   node scripts/setup.js              instala ou atualiza
 *   node scripts/setup.js --uninstall  remove a statusline do settings.json
 *   node scripts/setup.js --padding 1  instala com outro recuo lateral
 *   node scripts/setup.js --dry-run    mostra o que faria, sem escrever
 *   node scripts/setup.js --no-color   desliga as cores da saida
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
const SRC_DIR = path.resolve(__dirname, '..');
// resíduos das versões que agregavam transcripts por conta propria
const LEGACY = [path.join(CLAUDE_DIR, 'statusline-cache.json'), path.join(CLAUDE_DIR, 'statusline.config.json')];

// ---------- aparencia ----------
const COLOR = !has('--no-color') && !process.env.NO_COLOR && process.stdout.isTTY !== false;
const paint = (code, s) => (COLOR ? '\x1b[' + code + 'm' + s + '\x1b[0m' : s);
const ui = {
  coral: (s) => paint('38;5;209', s), // o laranja da marca Claude
  gray: (s) => paint('38;5;245', s),
  faint: (s) => paint('2', s),
  green: (s) => paint('38;5;114', s),
  red: (s) => paint('38;5;203', s),
  yellow: (s) => paint('38;5;179', s),
  cyan: (s) => paint('38;5;80', s),
  bold: (s) => paint('1', s),
};

const W = 62; // largura interna do banner
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

function banner(subtitle) {
  const top = '╭' + '─'.repeat(W) + '╮';
  const bottom = '╰' + '─'.repeat(W) + '╯';
  const line = (plain, colored) => ui.faint('│') + ' ' + colored + ' '.repeat(Math.max(0, W - plain.length - 2)) + ' ' + ui.faint('│');
  console.log('');
  console.log(ui.faint(top));
  console.log(line(' ✻ claude-statusline', ' ' + ui.coral('✻') + ' ' + ui.bold('claude-statusline')));
  console.log(line('   ' + subtitle, '   ' + ui.gray(subtitle)));
  console.log(ui.faint(bottom));
  console.log('');
}

// caminho curto: ~/.claude/statusline.js em vez do absoluto inteiro
function short(p) {
  const home = os.homedir();
  return p.startsWith(home) ? '~' + p.slice(home.length).replace(/\\/g, '/') : p;
}

// em simulacao o marcador e neutro: nada foi realmente feito
const step = (label, detail) =>
  console.log('  ' + (DRY ? ui.yellow('◦') : ui.green('✓')) + ' ' + pad(label, 16) + (detail ? ui.faint(detail) : ''));
const skip = (label, detail) =>
  console.log('  ' + ui.faint('·') + ' ' + pad(label, 16) + (detail ? ui.faint(detail) : ''));
const note = (msg) => console.log('  ' + ui.faint(msg));
const fail = (msg) => {
  console.error('');
  console.error('  ' + ui.red('✗') + ' ' + msg);
  console.error('');
  process.exit(1);
};

/**
 * Amostra do resultado: executa a propria barra com um payload de exemplo,
 * em vez de imitar a saida — o que voce ve aqui e exatamente o que o Claude
 * Code vai desenhar, alinhamento incluido.
 */
function preview(scriptPath) {
  const now = Math.floor(Date.now() / 1000);
  const sample = {
    model: { id: 'claude-opus-5[1m]', display_name: 'Opus 5 (1M context)' },
    workspace: { current_dir: process.cwd() },
    effort: { level: 'medium' },
    cost: { total_lines_added: 128, total_lines_removed: 34 },
    context_window: { used_percentage: 20, context_window_size: 1000000, total_input_tokens: 198000 },
    rate_limits: {
      five_hour: { used_percentage: 26, resets_at: now + 3600 },
      seven_day: { used_percentage: 5, resets_at: now + 5 * 86400 },
    },
  };

  let out;
  try {
    const res = require('child_process').spawnSync(process.execPath, [scriptPath], {
      input: JSON.stringify(sample),
      encoding: 'utf8',
    });
    out = res.status === 0 ? res.stdout : null;
  } catch {
    out = null;
  }
  if (!out) return;

  console.log('  ' + ui.faint('assim (dados de exemplo):'));
  for (const line of out.split('\n')) console.log('    ' + (COLOR ? line : line.replace(/\x1b\[[0-9;]*m/g, '')));
}

// ---------- io ----------
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
const commandFor = (scriptPath) => 'node "' + scriptPath + '"';

// ---------- acoes ----------
function install() {
  banner(DRY ? 'simulacao — nada sera escrito' : 'barra de status para o Claude Code');

  const source = path.join(SRC_DIR, 'statusline.js');
  if (!fs.existsSync(source)) fail('statusline.js nao encontrado em ' + SRC_DIR);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) fail('Node 18 ou superior e necessario (encontrado v' + process.versions.node + ')');
  step('node', 'v' + process.versions.node);

  if (!fs.existsSync(CLAUDE_DIR)) {
    if (!DRY) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    step('diretorio', short(CLAUDE_DIR) + ' criado');
  }

  if (!DRY) fs.copyFileSync(source, TARGET);
  step('statusline.js', short(TARGET));

  for (const f of LEGACY) {
    if (fs.existsSync(f)) {
      if (!DRY) fs.unlinkSync(f);
      step('limpeza', path.basename(f) + ' (obsoleto) removido');
    }
  }

  const settings = readJSON(SETTINGS, {});
  const bak = backup(SETTINGS);
  if (bak) step('backup', path.basename(bak));

  settings.statusLine = { type: 'command', command: commandFor(TARGET), padding: PADDING };
  writeJSON(SETTINGS, settings);
  step('settings.json', 'statusLine registrada, padding ' + PADDING);

  console.log('');
  preview(DRY ? source : TARGET);
  console.log('');
  if (DRY) {
    note('simulacao concluida — rode sem --dry-run para aplicar.');
  } else {
    console.log('  ' + ui.coral('✻') + ' ' + ui.bold('Pronto.') + ' ' + ui.gray('Reinicie o Claude Code para ver a barra.'));
  }
  console.log('');
}

function uninstall() {
  banner(DRY ? 'simulacao — nada sera removido' : 'removendo a barra');

  const settings = readJSON(SETTINGS, null);
  if (!settings) fail('settings.json nao encontrado em ' + short(SETTINGS));

  if (settings.statusLine) {
    const bak = backup(SETTINGS);
    if (bak) step('backup', path.basename(bak));
    delete settings.statusLine;
    writeJSON(SETTINGS, settings);
    step('settings.json', 'statusLine removida');
  } else {
    skip('settings.json', 'nenhuma statusLine configurada');
  }

  for (const f of [TARGET].concat(LEGACY)) {
    if (fs.existsSync(f)) {
      if (!DRY) fs.unlinkSync(f);
      step('removido', short(f));
    }
  }

  console.log('');
  note('as demais chaves do settings.json foram preservadas.');
  console.log('');
}

if (UNINSTALL) uninstall();
else install();
