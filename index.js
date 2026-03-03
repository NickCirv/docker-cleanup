#!/usr/bin/env node
// docker-cleanup — Interactive Docker resource cleanup TUI
// Zero npm dependencies · Node 18+ · ES Modules

import { execFileSync, spawnSync } from 'child_process';
import * as readline from 'readline';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  yellow:  '\x1b[33m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgRed:   '\x1b[41m',
  bgDark:  '\x1b[48;5;235m',
};
const r = (s) => `${C.red}${s}${C.reset}`;
const y = (s) => `${C.yellow}${s}${C.reset}`;
const g = (s) => `${C.green}${s}${C.reset}`;
const c = (s) => `${C.cyan}${s}${C.reset}`;
const m = (s) => `${C.magenta}${s}${C.reset}`;
const d = (s) => `${C.dim}${s}${C.reset}`;
const b = (s) => `${C.bold}${s}${C.reset}`;

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLAGS = {
  images:     args.includes('--images'),
  containers: args.includes('--containers'),
  volumes:    args.includes('--volumes'),
  networks:   args.includes('--networks'),
  all:        args.includes('--all'),
  force:      args.includes('--force'),
  dryRun:     args.includes('--dry-run'),
  json:       args.includes('--format') && args[args.indexOf('--format') + 1] === 'json',
  help:       args.includes('--help') || args.includes('-h'),
  version:    args.includes('--version') || args.includes('-v'),
};

// If no category flags, show all
const noCategory = !FLAGS.images && !FLAGS.containers && !FLAGS.volumes && !FLAGS.networks;
if (FLAGS.all || noCategory) {
  FLAGS.images = FLAGS.containers = FLAGS.volumes = FLAGS.networks = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  try {
    const result = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return result.trim();
  } catch (e) {
    if (opts.allowFail) return null;
    return null;
  }
}

function runLines(cmd, args) {
  const out = run(cmd, args, { allowFail: true });
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

function humanBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '?';
  const n = Number(bytes);
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function parseDockerSize(str) {
  if (!str || str === 'N/A' || str === '0B') return 0;
  const m = str.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const map = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
  return Math.round(val * (map[unit] || 1));
}

function padEnd(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, len - visible.length);
  return str + ' '.repeat(pad);
}

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function shortId(id) {
  return (id || '').replace(/^sha256:/, '').slice(0, 12);
}

function relativeTime(dateStr) {
  if (!dateStr) return 'unknown';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 86400 / 30)}mo ago`;
}

// ─── Docker Health Check ──────────────────────────────────────────────────────
function checkDocker() {
  const which = run('which', ['docker'], { allowFail: true });
  if (!which) {
    console.error(r('✗ Docker CLI not found.') + '\n  Install from: https://docs.docker.com/get-docker/');
    process.exit(1);
  }
  const ping = run('docker', ['info', '--format', '{{.ServerVersion}}'], { allowFail: true });
  if (!ping) {
    console.error(r('✗ Docker daemon is not running.') + '\n  Start Docker Desktop or run: sudo systemctl start docker');
    process.exit(1);
  }
}

// ─── Data Collection ──────────────────────────────────────────────────────────
function collectImages() {
  const lines = runLines('docker', [
    'images', '--all', '--no-trunc',
    '--format', '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}',
  ]);
  const usedImages = new Set(runLines('docker', [
    'ps', '--all', '--no-trunc',
    '--format', '{{.Image}}',
  ]));

  return lines.map((line) => {
    const [id, repo, tag, size, ...createdParts] = line.split('\t');
    const created = createdParts.join('\t');
    const isNoneRepo = repo === '<none>';
    const isNoneTag = tag === '<none>';
    const dangling = isNoneRepo && isNoneTag;
    const refName = dangling ? '<none>:<none>' : `${repo}:${tag}`;
    const inUse = usedImages.has(id) || usedImages.has(refName) || usedImages.has(shortId(id));
    return {
      type: 'image',
      id,
      shortId: shortId(id),
      repo,
      tag,
      refName,
      size,
      sizeBytes: parseDockerSize(size),
      created,
      dangling,
      inUse,
      status: dangling ? 'dangling' : inUse ? 'in use' : 'unused',
    };
  }).filter((img) => img.dangling || !img.inUse);
}

function collectContainers() {
  const lines = runLines('docker', [
    'ps', '--all', '--no-trunc',
    '--filter', 'status=exited',
    '--filter', 'status=dead',
    '--filter', 'status=created',
    '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Size}}',
  ]);
  return lines.map((line) => {
    const [id, name, image, status, created, size] = line.split('\t');
    const sizeMatch = (size || '').match(/^([\d.]+\s*\w+)/);
    const sizeStr = sizeMatch ? sizeMatch[1] : size || '0B';
    return {
      type: 'container',
      id,
      shortId: shortId(id),
      name: name || id,
      image,
      status,
      created,
      size: sizeStr,
      sizeBytes: parseDockerSize(sizeStr),
    };
  });
}

function collectVolumes() {
  const lines = runLines('docker', [
    'volume', 'ls', '--quiet',
  ]);
  const dangling = new Set(runLines('docker', [
    'volume', 'ls', '--quiet', '--filter', 'dangling=true',
  ]));

  return lines
    .filter((name) => dangling.has(name))
    .map((name) => {
      const inspect = run('docker', ['volume', 'inspect', '--format',
        '{{.Driver}}\t{{.Mountpoint}}', name], { allowFail: true });
      const [driver = 'local', mountpoint = ''] = (inspect || '').split('\t');
      return {
        type: 'volume',
        id: name,
        name,
        driver,
        mountpoint,
        size: '?',
        sizeBytes: 0,
      };
    });
}

function collectNetworks() {
  const lines = runLines('docker', [
    'network', 'ls', '--no-trunc',
    '--format', '{{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.CreatedAt}}',
  ]);
  const builtIn = new Set(['bridge', 'host', 'none']);
  const usedNets = new Set();
  const containers = runLines('docker', [
    'ps', '--all', '--no-trunc',
    '--format', '{{.Networks}}',
  ]);
  containers.forEach((nets) => nets.split(',').forEach((n) => usedNets.add(n.trim())));

  return lines
    .map((line) => {
      const [id, name, driver, created] = line.split('\t');
      return { type: 'network', id, shortId: shortId(id), name, driver, created, sizeBytes: 0 };
    })
    .filter((n) => !builtIn.has(n.name) && !usedNets.has(n.name) && !usedNets.has(n.id));
}

// ─── Docker Disk Usage ────────────────────────────────────────────────────────
function getDiskUsage() {
  const out = run('docker', ['system', 'df', '--format', '{{json .}}'], { allowFail: true });
  if (!out) return null;
  try {
    return out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return null;
  }
}

// ─── Delete Operations ────────────────────────────────────────────────────────
function deleteItems(items, dryRun) {
  const results = { freed: 0, errors: [] };
  for (const item of items) {
    if (dryRun) {
      results.freed += item.sizeBytes || 0;
      continue;
    }
    let ok = false;
    if (item.type === 'image') {
      const res = spawnSync('docker', ['rmi', '--force', item.id], { encoding: 'utf8' });
      ok = res.status === 0;
    } else if (item.type === 'container') {
      const res = spawnSync('docker', ['rm', '--force', item.id], { encoding: 'utf8' });
      ok = res.status === 0;
    } else if (item.type === 'volume') {
      const res = spawnSync('docker', ['volume', 'rm', item.name], { encoding: 'utf8' });
      ok = res.status === 0;
    } else if (item.type === 'network') {
      const res = spawnSync('docker', ['network', 'rm', item.id], { encoding: 'utf8' });
      ok = res.status === 0;
    }
    if (ok) {
      results.freed += item.sizeBytes || 0;
    } else {
      results.errors.push(`${item.type} ${item.id}`);
    }
  }
  return results;
}

// ─── Help & Version ────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${b('docker-cleanup')} ${d('v1.0.0')} — Interactive Docker resource cleanup

${b('USAGE')}
  dclean [options]

${b('OPTIONS')}
  --images       Only dangling/unused images
  --containers   Only stopped containers
  --volumes      Only unused volumes
  --networks     Only unused custom networks
  --all          All cleanup candidates (default)
  --force        Non-interactive: delete everything immediately
  --dry-run      Show what would be deleted, nothing removed
  --format json  Machine-readable JSON output
  -h, --help     Show this help
  -v, --version  Show version

${b('TUI CONTROLS')}
  ↑ / ↓          Navigate items
  Tab            Switch category
  Space          Toggle selection
  Enter          Delete selected items (with confirmation)
  d              Delete selected items
  a              Select / deselect all in category
  q / Ctrl+C     Quit

${b('EXAMPLES')}
  dclean                   Interactive cleanup (all resources)
  dclean --images          Only show images
  dclean --force           Delete all dangling/stopped immediately
  dclean --dry-run         Preview what would be removed
  dclean --format json     JSON output for scripting
`);
}

// ─── JSON Output Mode ─────────────────────────────────────────────────────────
function jsonMode(data) {
  const out = {};
  if (data.images) out.images = data.images.map((i) => ({
    id: i.shortId, repo: i.repo, tag: i.tag, size: i.size, status: i.status, created: i.created,
  }));
  if (data.containers) out.containers = data.containers.map((c) => ({
    id: c.shortId, name: c.name, image: c.image, status: c.status, size: c.size, created: c.created,
  }));
  if (data.volumes) out.volumes = data.volumes.map((v) => ({
    name: v.name, driver: v.driver, mountpoint: v.mountpoint,
  }));
  if (data.networks) out.networks = data.networks.map((n) => ({
    id: n.shortId, name: n.name, driver: n.driver, created: n.created,
  }));
  console.log(JSON.stringify(out, null, 2));
}

// ─── Force Mode ───────────────────────────────────────────────────────────────
function forceMode(data, dryRun) {
  const all = [
    ...(data.images || []),
    ...(data.containers || []),
    ...(data.volumes || []),
    ...(data.networks || []),
  ];
  if (all.length === 0) {
    console.log(g('✓ Nothing to clean. Docker is spotless.'));
    return;
  }
  const label = dryRun ? d('[dry-run] Would delete:') : b('Deleting:');
  console.log(`\n${label}`);
  for (const item of all) {
    const id = item.shortId || item.name;
    const name = item.name || item.refName || '';
    console.log(`  ${r('✗')} ${item.type.padEnd(10)} ${c(id)} ${d(name)}`);
  }
  const res = deleteItems(all, dryRun);
  if (dryRun) {
    console.log(`\n${y('Would free:')} ${b(humanBytes(res.freed))}`);
  } else {
    console.log(`\n${g('✓ Done.')} Freed ~${b(humanBytes(res.freed))}`);
    if (res.errors.length) {
      console.log(r(`  Errors: ${res.errors.join(', ')}`));
    }
  }
}

// ─── TUI ─────────────────────────────────────────────────────────────────────
const CATEGORIES = ['images', 'containers', 'volumes', 'networks'];
const CATEGORY_LABELS = {
  images:     'Images',
  containers: 'Containers',
  volumes:    'Volumes',
  networks:   'Networks',
};

function renderItem(item, selected, cursor) {
  const mark = selected ? r('●') : y('○');
  const arrow = cursor ? `${C.cyan}▶${C.reset}` : ' ';
  let line = '';

  if (item.type === 'image') {
    const id = c(padEnd(item.shortId, 14));
    const ref = padEnd(truncate(item.refName, 36), 36);
    const sz = padEnd(item.size || '?', 9);
    const created = d(padEnd(relativeTime(item.created), 10));
    const status = item.dangling ? r('dangling') : y('unused ');
    line = `${arrow} ${mark}  ${id} ${ref} ${sz} ${created} ${status}`;
  } else if (item.type === 'container') {
    const id = c(padEnd(item.shortId, 14));
    const name = padEnd(truncate(item.name, 24), 24);
    const image = padEnd(truncate(item.image, 28), 28);
    const created = d(padEnd(relativeTime(item.created), 10));
    line = `${arrow} ${mark}  ${id} ${name} ${image} ${created}`;
  } else if (item.type === 'volume') {
    const name = c(padEnd(truncate(item.name, 36), 36));
    const driver = padEnd(item.driver || 'local', 10);
    const mp = d(truncate(item.mountpoint, 40));
    line = `${arrow} ${mark}  ${name} ${driver} ${mp}`;
  } else if (item.type === 'network') {
    const id = c(padEnd(item.shortId, 14));
    const name = padEnd(truncate(item.name, 30), 30);
    const driver = padEnd(item.driver || 'bridge', 10);
    const created = d(relativeTime(item.created));
    line = `${arrow} ${mark}  ${id} ${name} ${driver} ${created}`;
  }

  return line;
}

function renderHeader(cat) {
  if (cat === 'images') {
    return d(` ${'  ID'.padEnd(18)} ${'REPOSITORY:TAG'.padEnd(36)} ${'SIZE'.padEnd(9)} ${'CREATED'.padEnd(10)} STATUS`);
  }
  if (cat === 'containers') {
    return d(` ${'  ID'.padEnd(18)} ${'NAME'.padEnd(24)} ${'IMAGE'.padEnd(28)} CREATED`);
  }
  if (cat === 'volumes') {
    return d(` ${'  NAME'.padEnd(40)} ${'DRIVER'.padEnd(10)} MOUNTPOINT`);
  }
  if (cat === 'networks') {
    return d(` ${'  ID'.padEnd(18)} ${'NAME'.padEnd(30)} ${'DRIVER'.padEnd(10)} CREATED`);
  }
  return '';
}

class TUI {
  constructor(data) {
    this.data = data;
    this.activeCats = CATEGORIES.filter((c) => data[c] && data[c].length > 0);
    this.catIdx = 0;
    this.cursorIdx = 0;
    this.selected = { images: new Set(), containers: new Set(), volumes: new Set(), networks: new Set() };
    this.message = '';
    this.quit = false;

    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    readline.emitKeypressEvents(process.stdin, this.rl);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (str, key) => this.onKey(str, key));
    process.on('SIGINT', () => this.exit());
  }

  get cat() { return this.activeCats[this.catIdx]; }
  get items() { return this.data[this.cat] || []; }

  onKey(str, key) {
    if (!key) return;
    const { name, ctrl } = key;

    if (ctrl && name === 'c') { this.exit(); return; }
    if (name === 'q') { this.exit(); return; }

    if (name === 'up') {
      this.cursorIdx = Math.max(0, this.cursorIdx - 1);
    } else if (name === 'down') {
      this.cursorIdx = Math.min(this.items.length - 1, this.cursorIdx + 1);
    } else if (name === 'tab') {
      this.catIdx = (this.catIdx + 1) % this.activeCats.length;
      this.cursorIdx = 0;
      this.message = '';
    } else if (name === 'space') {
      const item = this.items[this.cursorIdx];
      if (item) {
        const s = this.selected[this.cat];
        if (s.has(item.id)) s.delete(item.id);
        else s.add(item.id);
      }
    } else if (name === 'a') {
      const s = this.selected[this.cat];
      if (s.size === this.items.length) {
        s.clear();
      } else {
        this.items.forEach((i) => s.add(i.id));
      }
    } else if (name === 'return' || name === 'd') {
      this.doDelete();
      return;
    }

    this.render();
  }

  doDelete() {
    const toDelete = CATEGORIES.flatMap((cat) =>
      (this.data[cat] || []).filter((i) => this.selected[cat].has(i.id))
    );
    if (toDelete.length === 0) {
      this.message = y('Nothing selected. Use Space to select items.');
      this.render();
      return;
    }
    this.clearScreen();
    console.log(`\n${b('Confirm deletion:')}`);
    toDelete.forEach((item) => {
      const label = item.name || item.refName || item.shortId;
      console.log(`  ${r('✗')} ${item.type.padEnd(10)} ${c(item.shortId || item.name)} ${d(label)}`);
    });
    const totalBytes = toDelete.reduce((s, i) => s + (i.sizeBytes || 0), 0);
    if (totalBytes > 0) console.log(`\n  ${y('~')} ${humanBytes(totalBytes)} will be freed`);

    process.stdout.write(`\n${b('Delete these? (y/N): ')}`);
    process.stdin.setRawMode(false);
    this.rl.question('', (ans) => {
      process.stdin.setRawMode(true);
      if (ans.toLowerCase() === 'y') {
        this.clearScreen();
        console.log(b('\nDeleting...\n'));
        const res = deleteItems(toDelete, FLAGS.dryRun);
        // Remove deleted items from data and selected sets
        for (const item of toDelete) {
          this.data[item.type + 's'] = (this.data[item.type + 's'] || []).filter((i) => i.id !== item.id);
          this.selected[item.type + 's'].delete(item.id);
        }
        this.activeCats = CATEGORIES.filter((cat) => this.data[cat] && this.data[cat].length > 0);
        this.catIdx = Math.min(this.catIdx, Math.max(0, this.activeCats.length - 1));
        this.cursorIdx = 0;
        const freed = humanBytes(res.freed);
        this.message = res.errors.length
          ? r(`Done. Errors: ${res.errors.join(', ')}`)
          : g(`✓ Deleted ${toDelete.length} item(s). Freed ~${freed}`);
        if (this.activeCats.length === 0) {
          this.clearScreen();
          console.log(g('\n✓ All done. Docker is clean.\n'));
          this.exit(0);
          return;
        }
      } else {
        this.message = d('Cancelled.');
      }
      this.render();
    });
  }

  totalSelected() {
    return CATEGORIES.reduce((n, cat) => n + this.selected[cat].size, 0);
  }

  totalSelectedBytes() {
    return CATEGORIES.reduce((sum, cat) => {
      return sum + [...this.selected[cat]].reduce((s, id) => {
        const item = (this.data[cat] || []).find((i) => i.id === id);
        return s + (item ? item.sizeBytes || 0 : 0);
      }, 0);
    }, 0);
  }

  clearScreen() {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  render() {
    this.clearScreen();
    const w = process.stdout.columns || 120;

    // Header bar
    console.log(`\n  ${b(m('docker-cleanup'))} ${d('v1.0.0')}  ${d('·')}  ${d('Interactive Docker resource cleanup')}\n`);

    // Disk usage summary
    if (this._dfCache) {
      const df = this._dfCache;
      const parts = df.map((row) => `${d(row.Type || '?')} ${y(row.Size || '?')} ${d('reclaim')} ${g(row.Reclaimable || '?')}`);
      console.log(`  ${d('Disk usage:')}  ${parts.join('   ')}\n`);
    }

    // Category tabs
    const tabs = this.activeCats.map((cat, i) => {
      const label = CATEGORY_LABELS[cat];
      const count = (this.data[cat] || []).length;
      const sel = this.selected[cat].size;
      const selStr = sel > 0 ? ` ${r(`[${sel}]`)}` : '';
      const tab = `${label} ${d(`(${count})`)}${selStr}`;
      return i === this.catIdx ? `${C.bgDark}${C.cyan}${C.bold} ${tab} ${C.reset}` : d(` ${tab} `);
    }).join('  ');
    console.log(`  ${tabs}\n`);

    // Column headers
    console.log(`  ${renderHeader(this.cat)}`);
    console.log(`  ${d('─'.repeat(Math.min(w - 4, 100)))}`);

    // Items
    const items = this.items;
    if (items.length === 0) {
      console.log(`\n  ${d('No items in this category.')}\n`);
    } else {
      // Windowing
      const maxRows = Math.max(5, (process.stdout.rows || 30) - 18);
      const start = Math.max(0, this.cursorIdx - Math.floor(maxRows / 2));
      const end = Math.min(items.length, start + maxRows);
      if (start > 0) console.log(`  ${d(`  ↑ ${start} more above`)}`);
      for (let i = start; i < end; i++) {
        const item = items[i];
        const sel = this.selected[this.cat].has(item.id);
        console.log(`  ${renderItem(item, sel, i === this.cursorIdx)}`);
      }
      if (end < items.length) console.log(`  ${d(`  ↓ ${items.length - end} more below`)}`);
    }

    // Status bar
    const nSel = this.totalSelected();
    const selBytes = nSel > 0 ? humanBytes(this.totalSelectedBytes()) : null;
    const selInfo = nSel > 0 ? `  ${r(`${nSel} selected`)} ${d('·')} ${y(`~${selBytes} to free`)}` : '';
    console.log(`\n  ${d('─'.repeat(Math.min(w - 4, 100)))}`);
    console.log(`  ${d('↑↓')} navigate  ${d('Space')} select  ${d('a')} all  ${d('Tab')} category  ${d('Enter/d')} delete  ${d('q')} quit${selInfo}`);
    if (FLAGS.dryRun) console.log(`  ${y('[dry-run mode — nothing will be deleted]')}`);
    if (this.message) console.log(`\n  ${this.message}`);
  }

  start(dfData) {
    this._dfCache = dfData;
    this.render();
  }

  exit(code = 0) {
    process.stdin.setRawMode && process.stdin.setRawMode(false);
    this.rl.close();
    this.clearScreen();
    if (code === 0) console.log(g('\nBye.\n'));
    process.exit(code);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (FLAGS.help) { printHelp(); process.exit(0); }
  if (FLAGS.version) { console.log('docker-cleanup v1.0.0'); process.exit(0); }

  checkDocker();

  process.stdout.write(`\n  ${b('docker-cleanup')} — Collecting Docker resource info...`);

  const data = {};
  const dfData = getDiskUsage();

  if (FLAGS.images)     data.images     = collectImages();
  if (FLAGS.containers) data.containers = collectContainers();
  if (FLAGS.volumes)    data.volumes    = collectVolumes();
  if (FLAGS.networks)   data.networks   = collectNetworks();

  process.stdout.write('\r\x1b[K');

  const total =
    (data.images?.length || 0) +
    (data.containers?.length || 0) +
    (data.volumes?.length || 0) +
    (data.networks?.length || 0);

  if (FLAGS.json) {
    jsonMode(data);
    process.exit(0);
  }

  if (FLAGS.force || FLAGS.dryRun) {
    // Show disk usage summary first
    if (dfData) {
      console.log(`\n  ${b('Docker Disk Usage:')}`);
      dfData.forEach((row) => {
        console.log(`  ${d(String(row.Type || '').padEnd(14))} ${y(String(row.Size || '?').padEnd(10))} reclaimable: ${g(row.Reclaimable || '?')}`);
      });
    }
    if (total === 0) {
      console.log(g('\n✓ Nothing to clean. Docker is spotless.\n'));
      process.exit(0);
    }
    forceMode(data, FLAGS.dryRun);
    process.exit(0);
  }

  if (total === 0) {
    console.log(`\n  ${g('✓ Nothing to clean. Docker is spotless.')}\n`);
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error(r('  Interactive mode requires a TTY. Use --format json or --force for non-interactive usage.'));
    process.exit(1);
  }

  const tui = new TUI(data);
  tui.start(dfData);
}

main().catch((err) => {
  console.error(r(`\nFatal: ${err.message}`));
  process.exit(1);
});
