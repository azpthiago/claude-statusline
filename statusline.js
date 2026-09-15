#!/usr/bin/env node
/**
 * Statusline do Claude Code, em duas linhas alinhadas em grade.
 *
 * Coluna 1: modelo             | conta e organizacao
 * Coluna 2: effort e badges    | uso da janela de 7 dias
 * Coluna 3: diretorio e branch | uso da janela de 5 horas
 * Coluna 4: contexto da sessao | linhas alteradas e relogio
 *
 * Todos os numeros de uso vem do payload que o proprio Claude Code envia
 * por stdin (rate_limits e context_window) — as mesmas fontes de /usage e
 * /context. O script nao calcula cota nem le transcripts.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

// ---------- cores ----------
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  gray: '\x1b[38;5;245m',
  sep: '\x1b[38;5;240m',
  blue: '\x1b[38;5;75m',
  cyan: '\x1b[38;5;80m',
  green: '\x1b[38;5;114m',
  yellow: '\x1b[38;5;179m',
  orange: '\x1b[38;5;215m',
  red: '\x1b[38;5;203m',
  purple: '\x1b[38;5;176m',
  pink: '\x1b[38;5;211m',
};
const c = (color, s) => `${color}${s}${C.reset}`;

// ---------- helpers ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}

function fmtDur(ms) {
  if (ms <= 0) return 'agora';
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  if (d >= 1) return d + 'd' + String(Math.floor((totalMin % 1440) / 60)).padStart(2, '0') + 'h';
  const h = Math.floor(totalMin / 60);
  return h > 0 ? h + 'h' + String(totalMin % 60).padStart(2, '0') : totalMin + 'm';
}

// o payload manda percentuais em ponto flutuante (28.000000000000004), entao arredonda sempre
function fmtPct(n) {
  const p = Number(n);
  if (!isFinite(p)) return '—';
  if (p > 0 && p < 1) return '<1%';
  if (p < 100 && Math.round(p) >= 100) return '99%'; // 99,6% ainda nao e o limite
  return Math.round(p) + '%';
}

function hhmm(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// normaliza valores que podem chegar como string, numero ou objeto
function pickText() {
  for (const v of arguments) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') {
      const nested = pickText(v.effort, v.level, v.name, v.value, v.label, v.id);
      if (nested) return nested;
    }
  }
  return null;
}

// ---------- alinhamento ----------
function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, '');
}

// largura em colunas de terminal: emoji ocupa 2, combinadores ocupam 0
function visualWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d || (cp >= 0x0300 && cp <= 0x036f)) continue;
    if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) w += 2;
    else w += 1;
  }
  return w;
}

function padTo(s, width) {
  const diff = width - visualWidth(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

function truncate(s, max) {
  s = String(s || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// alinha as linhas coluna a coluna, para as divisorias cairem na mesma posicao
function renderGrid(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = [];
  for (let i = 0; i < cols; i++) {
    widths[i] = Math.max(...rows.map((r) => (r[i] ? visualWidth(r[i]) : 0)));
  }
  const sep = c(C.sep, ' │ ');
  return rows
    .map((r) => {
      // sem divisoria sobrando quando as ultimas celulas da linha estao vazias
      let last = -1;
      for (let i = 0; i < cols; i++) if (r[i] && widths[i] > 0) last = i;
      const cells = [];
      for (let i = 0; i <= last; i++) {
        if (widths[i] === 0) continue; // coluna vazia nas duas linhas
        cells.push(i === last ? r[i] || '' : padTo(r[i] || '', widths[i]));
      }
      return cells.join(sep);
    })
    .join('\n');
}

function colorFor(pct) {
  if (pct >= 90) return C.red;
  if (pct >= 70) return C.orange;
  if (pct >= 40) return C.yellow;
  return C.green;
}

function bar(pct, width) {
  const r = Math.max(0, Math.min(100, pct)) / 100;
  let filled = Math.round(r * width);
  if (r > 0 && filled === 0) filled = 1; // uso minimo ainda acende o primeiro bloco
  return c(colorFor(pct), '▰'.repeat(filled)) + c(C.sep, '▱'.repeat(width - filled));
}

/**
 * Segmento de uma janela de limite, direto de rate_limits.
 * Sem o campo (versao antiga do Claude Code), mostra "n/d" em vez de inventar.
 */
function limitSeg(label, window, opts) {
  const hasPct = window && typeof window.used_percentage === 'number' && isFinite(window.used_percentage);
  // sem a janela inteira nao ha o que mostrar; com o reset mas sem percentual, mostra ao menos o reset
  if (!window || (!hasPct && !window.resets_at)) {
    return c(C.gray, label + ' ') + c(C.dim, 'n/d');
  }

  const pct = hasPct ? window.used_percentage : 0;
  let out = c(C.gray, label + ' ');
  out += hasPct
    ? bar(pct, 6) + ' ' + c(colorFor(pct), padTo(fmtPct(pct), 4))
    : c(C.dim, padTo('n/d', 11));

  if (window.resets_at) {
    const reset = new Date(window.resets_at * 1000);
    const remaining = reset.getTime() - Date.now();
    const when = opts && opts.withDate
      ? String(reset.getDate()).padStart(2, '0') + '/' + String(reset.getMonth() + 1).padStart(2, '0') + ' ' + hhmm(reset)
      : hhmm(reset);
    const color = remaining < 30 * 60000 ? C.green : C.gray;
    out += c(C.gray, ' ↻ ') + c(color, when) + c(C.dim, ' (' + fmtDur(remaining) + ')');
  }
  return out;
}

// ---------- git ----------
function gitBranch(dir) {
  let cur = dir;
  for (let i = 0; i < 6 && cur; i++) {
    const head = path.join(cur, '.git', 'HEAD');
    try {
      if (fs.existsSync(head)) {
        const txt = fs.readFileSync(head, 'utf8').trim();
        const m = txt.match(/^ref: refs\/heads\/(.+)$/);
        return m ? m[1] : txt.slice(0, 7);
      }
    } catch {
      /* ignora */
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

// ---------- montagem ----------
function build(input) {
  // input.account existe para previews e demonstracoes; o normal e ler a conta local
  const oauth = input.account || (readJSON(path.join(HOME, '.claude.json'), {}) || {}).oauthAccount || {};
  const now = new Date();

  // ---- coluna 1: modelo | conta ----
  const modelId = (input.model && input.model.id) || '';
  const modelName = (input.model && (input.model.display_name || input.model.id)) || 'Claude';
  const longCtx = /\[1m\]|1m context/i.test(modelId + ' ' + modelName);
  // o display_name ja costuma trazer "(1M context)"; so acrescenta quando falta
  const c1a = c(C.purple, '◆ ' + modelName) + (longCtx && !/1m/i.test(modelName) ? c(C.dim, ' 1M') : '');
  const who = truncate(oauth.displayName || oauth.emailAddress || 'conta local', 18);
  const org = oauth.organizationName ? c(C.dim, ' · ' + truncate(oauth.organizationName, 16)) : '';
  const c1b = c(C.pink, '◇ ' + who) + org;

  // ---- coluna 2: effort e badges | janela de 7 dias ----
  const bits = [];
  const effort = pickText(input.effort, input.output_config && input.output_config.effort);
  if (effort) bits.push(c(C.gray, 'effort ') + c(C.cyan, effort));

  const mode = pickText(input.permission_mode, input.permissionMode);
  const modeLabel = { default: 'normal', acceptEdits: 'auto-edit', bypassPermissions: 'bypass', plan: 'plan' };
  const modeColor = { default: C.green, acceptEdits: C.yellow, bypassPermissions: C.red, plan: C.blue };
  if (mode) bits.push(c(modeColor[mode] || C.gray, modeLabel[mode] || mode));

  const style = pickText(input.output_style);
  if (style && style !== 'default') bits.push(c(C.cyan, style));
  if (input.fast_mode) bits.push(c(C.yellow, 'fast'));

  const rl = input.rate_limits || {};
  const c2a = bits.join(c(C.sep, ' · '));
  const c2b = limitSeg('7d', rl.seven_day, { withDate: true });

  // ---- coluna 3: diretorio e branch | janela de 5 horas ----
  const dir = (input.workspace && (input.workspace.current_dir || input.workspace.project_dir)) || input.cwd;
  let c3a = '';
  if (dir) {
    const branch = (input.workspace && input.workspace.branch) || gitBranch(dir);
    c3a = c(C.blue, '▸ ' + truncate(path.basename(dir), 20));
    if (branch) c3a += c(C.green, ' ⑂ ' + truncate(branch, 16));
  }
  const c3b = limitSeg('5h', rl.five_hour);

  // ---- coluna 4: contexto | linhas alteradas e relogio ----
  let c4a = '';
  const cw = input.context_window;
  if (cw && typeof cw.used_percentage === 'number') {
    const size = cw.context_window_size || (longCtx ? 1000000 : 200000);
    const used = cw.total_input_tokens || 0;
    c4a =
      c(C.gray, 'ctx ') +
      bar(cw.used_percentage, 6) +
      ' ' +
      c(colorFor(cw.used_percentage), padTo(fmtPct(cw.used_percentage), 4)) +
      c(C.dim, ' ' + fmtTokens(used) + '/' + fmtTokens(size));
  }

  const added = (input.cost && input.cost.total_lines_added) || 0;
  const removed = (input.cost && input.cost.total_lines_removed) || 0;
  const diff = added || removed ? c(C.green, '+' + added) + c(C.red, ' -' + removed) + c(C.sep, ' · ') : '';
  const c4b = diff + c(C.dim, '◷ ' + hhmm(now));

  return renderGrid([
    [c1a, c2a, c3a, c4a],
    [c1b, c2b, c3b, c4b],
  ]);
}

// ---------- entrada ----------
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    /* permite execucao sem stdin, para teste */
  }
  try {
    process.stdout.write(build(input));
  } catch (err) {
    process.stdout.write(c(C.red, 'statusline erro: ' + err.message));
  }
});
