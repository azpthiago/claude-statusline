#!/usr/bin/env node
/**
 * Statusline do Claude Code, em duas linhas alinhadas em grade.
 *
 * Coluna 1: modelo            | conta e organizacao
 * Coluna 2: effort/modo/estilo | uso dos ultimos 7 dias
 * Coluna 3: diretorio e branch | bloco de 5h e horario de reset
 * Coluna 4: contexto da sessao | linhas alteradas e relogio
 *
 * As porcentagens sao relativas aos tetos em ~/.claude/statusline.config.json
 * (weeklyLimitTokens, blockLimitTokens). Sem teto, exibe o total de tokens.
 *
 * O uso e agregado dos transcripts em ~/.claude/projects, com cache
 * incremental em ~/.claude/statusline-cache.json.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CACHE_FILE = path.join(CLAUDE_DIR, 'statusline-cache.json');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'statusline.config.json');

const BLOCK_HOURS = 5; // janela de limite de uso do Claude Code
const RETENTION_DAYS = 10; // quanto de historico o cache guarda

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
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

function fmtPct(ratio) {
  const p = ratio * 100;
  if (p > 0 && p < 1) return '<1%';
  return Math.round(p) + '%';
}

function fmtDur(ms) {
  if (ms <= 0) return '0m';
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m}m`;
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

function hourKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
}

function hourKeyToDate(k) {
  const [day, hh] = k.split('T');
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, Number(hh), 0, 0, 0);
}

function emptyBucket() {
  return { in: 0, out: 0, cw5: 0, cw1: 0, cr: 0, msgs: 0 };
}

function addBucket(dst, src) {
  dst.in += src.in || 0;
  dst.out += src.out || 0;
  dst.cw5 += src.cw5 || 0;
  dst.cw1 += src.cw1 || 0;
  dst.cr += src.cr || 0;
  dst.msgs += src.msgs || 0;
}

function bucketTokens(b) {
  return b.in + b.out + b.cw5 + b.cw1 + b.cr;
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

function bar(ratio, width) {
  const r = Math.max(0, Math.min(1, ratio));
  let filled = Math.round(r * width);
  if (r > 0 && filled === 0) filled = 1; // uso minimo ainda acende o primeiro bloco
  const color = r >= 0.9 ? C.red : r >= 0.7 ? C.orange : r >= 0.4 ? C.yellow : C.green;
  return c(color, '▰'.repeat(filled)) + c(C.sep, '▱'.repeat(width - filled));
}

// segmento de uso: barra + % do teto, ou total de tokens quando nao ha teto
function usageSeg(label, used, limit) {
  if (!limit) return c(C.gray, label + ' ') + c(C.cyan, fmtTokens(used));
  const ratio = used / limit;
  const color = ratio >= 0.9 ? C.red : ratio >= 0.7 ? C.orange : C.cyan;
  return c(C.gray, label + ' ') + bar(ratio, 6) + ' ' + c(color, padTo(fmtPct(ratio), 4));
}

// ---------- agregacao dos transcripts ----------
function listTranscripts() {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
    }
  };
  walk(PROJECTS_DIR, 0);
  return out;
}

function collectUsage() {
  const cache = readJSON(CACHE_FILE, null) || { v: 3, files: {}, hours: {}, ids: {} };
  if (cache.v !== 3) {
    cache.v = 3;
    cache.files = {};
    cache.hours = {};
    cache.ids = {};
  }

  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  let dirty = false;

  for (const file of listTranscripts()) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoff && cache.files[file]) continue;

    const prev = cache.files[file];
    let offset = 0;
    if (prev && prev.size <= st.size && prev.ino === st.ino) offset = prev.offset || 0;
    if (offset >= st.size) continue;

    let chunk = '';
    try {
      const fd = fs.openSync(file, 'r');
      const len = st.size - offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch {
      continue;
    }

    // processa apenas linhas completas; o resto fica para a proxima execucao
    const lastNL = chunk.lastIndexOf('\n');
    const consumed = lastNL + 1;
    const lines = lastNL >= 0 ? chunk.slice(0, lastNL).split('\n') : [];

    for (const line of lines) {
      if (!line || line.indexOf('"usage"') === -1) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = rec.message;
      const u = msg && msg.usage;
      if (!u || rec.type !== 'assistant') continue;

      const ts = new Date(rec.timestamp || msg.timestamp || 0);
      if (isNaN(ts.getTime()) || ts.getTime() < cutoff) continue;

      const id = (msg.id || '') + '|' + (rec.requestId || '');
      const hk = hourKey(ts);
      if (!cache.ids[hk]) cache.ids[hk] = [];
      if (id !== '|' && cache.ids[hk].includes(id)) continue;
      if (id !== '|') cache.ids[hk].push(id);

      const cc = u.cache_creation || {};
      const cw1 = cc.ephemeral_1h_input_tokens || 0;
      const cw5 = cc.ephemeral_5m_input_tokens || 0;
      const totalCW = u.cache_creation_input_tokens || cw1 + cw5;
      const entry = {
        in: u.input_tokens || 0,
        out: u.output_tokens || 0,
        cw5: cw5 || (cw1 ? 0 : totalCW),
        cw1: cw1,
        cr: u.cache_read_input_tokens || 0,
        msgs: 1,
      };

      if (!cache.hours[hk]) cache.hours[hk] = emptyBucket();
      addBucket(cache.hours[hk], entry);
      dirty = true;
    }

    cache.files[file] = { size: st.size, ino: st.ino, offset: offset + consumed };
    dirty = true;
  }

  // poda historico antigo
  for (const hk of Object.keys(cache.hours)) {
    if (hourKeyToDate(hk).getTime() < cutoff) {
      delete cache.hours[hk];
      delete cache.ids[hk];
      dirty = true;
    }
  }

  if (dirty) {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch {
      /* cache e opcional */
    }
  }
  return cache;
}

function summarize(cache) {
  const now = new Date();
  const weekAgo = now.getTime() - 7 * 86400000;

  const week = emptyBucket();
  const block = emptyBucket();

  const keys = Object.keys(cache.hours).sort();
  const times = keys.map((k) => ({ k, t: hourKeyToDate(k).getTime() }));

  // bloco de 5h: comeca na primeira hora com atividade apos um intervalo >= 5h
  let blockStart = null;
  for (const { t } of times) {
    if (blockStart === null || t - blockStart >= BLOCK_HOURS * 3600000) blockStart = t;
  }
  if (blockStart !== null && now.getTime() - blockStart >= BLOCK_HOURS * 3600000) blockStart = null;

  for (const { k, t } of times) {
    const b = cache.hours[k];
    if (t >= weekAgo) addBucket(week, b);
    if (blockStart !== null && t >= blockStart) addBucket(block, b);
  }

  return {
    week,
    block,
    blockStart,
    blockReset: blockStart === null ? null : blockStart + BLOCK_HOURS * 3600000,
  };
}

// ---------- contexto da sessao ----------
function sessionContext(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const st = fs.statSync(transcriptPath);
    const size = Math.min(st.size, 512 * 1024);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, st.size - size);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || line.indexOf('"usage"') === -1) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const u = rec.message && rec.message.usage;
      if (!u || rec.type !== 'assistant') continue;
      return (
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) +
        (u.output_tokens || 0)
      );
    }
  } catch {
    /* ignora */
  }
  return null;
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
  const cfg = readJSON(CONFIG_FILE, {}) || {};
  const account = readJSON(path.join(HOME, '.claude.json'), {}) || {};
  const oauth = account.oauthAccount || {};
  const settings = readJSON(path.join(CLAUDE_DIR, 'settings.json'), {}) || {};

  const cache = collectUsage();
  const s = summarize(cache);
  const now = new Date();
  const hhmm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

  // ---- coluna 1: modelo | conta ----
  const modelId = (input.model && input.model.id) || '';
  const modelName = (input.model && (input.model.display_name || input.model.id)) || 'Claude';
  const longCtx = /\[1m\]|1m context/i.test(modelId + ' ' + modelName);
  // o display_name ja costuma trazer "(1M context)"; so acrescenta quando falta
  const c1a = c(C.purple, '◆ ' + modelName) + (longCtx && !/1m/i.test(modelName) ? c(C.dim, ' 1M') : '');
  const who = truncate(oauth.displayName || oauth.emailAddress || 'conta local', 18);
  const org = oauth.organizationName ? c(C.dim, ' · ' + truncate(oauth.organizationName, 16)) : '';
  const c1b = c(C.pink, '◇ ' + who) + org;

  // ---- coluna 2: effort, modo, estilo | uso de 7 dias ----
  const effort = pickText(
    cfg.effort,
    input.effort,
    input.output_config && input.output_config.effort,
    settings.effortLevel
  );
  const mode = pickText(input.permission_mode, input.permissionMode);
  const modeLabel = { default: 'normal', acceptEdits: 'auto-edit', bypassPermissions: 'bypass', plan: 'plan' };
  const modeColor = { default: C.green, acceptEdits: C.yellow, bypassPermissions: C.red, plan: C.blue };
  const style = pickText(input.output_style);
  const bits = [];
  if (effort) bits.push(c(C.gray, 'effort ') + c(C.cyan, effort));
  if (mode) bits.push(c(modeColor[mode] || C.gray, modeLabel[mode] || mode));
  if (style && style !== 'default') bits.push(c(C.cyan, style));
  const c2a = bits.join(c(C.sep, ' · '));
  const c2b = usageSeg('7d', bucketTokens(s.week), cfg.weeklyLimitTokens);

  // ---- coluna 3: diretorio e branch | bloco de 5h ----
  const dir = (input.workspace && (input.workspace.current_dir || input.workspace.project_dir)) || input.cwd;
  let c3a = '';
  if (dir) {
    const branch = gitBranch(dir);
    c3a = c(C.blue, '▸ ' + truncate(path.basename(dir), 20));
    if (branch) c3a += c(C.green, ' ⑂ ' + truncate(branch, 16));
  }
  let c3b;
  if (s.blockReset) {
    const remaining = s.blockReset - now.getTime();
    const color = remaining < 30 * 60000 ? C.green : C.orange;
    c3b =
      usageSeg('5h', bucketTokens(s.block), cfg.blockLimitTokens) +
      c(C.gray, ' ↻ ') +
      c(color, hhmm(new Date(s.blockReset)) + ' (' + fmtDur(remaining) + ')');
  } else {
    c3b = c(C.gray, '5h ') + c(C.green, 'livre');
  }

  // ---- coluna 4: contexto | linhas alteradas e relogio ----
  let c4a = '';
  const ctx = sessionContext(input.transcript_path);
  if (ctx) {
    const limit = longCtx ? 1000000 : 200000;
    const ratio = ctx / limit;
    c4a =
      c(C.gray, 'ctx ') +
      bar(ratio, 6) +
      ' ' +
      c(ratio >= 0.8 ? C.red : C.gray, fmtTokens(ctx) + '/' + fmtTokens(limit));
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
