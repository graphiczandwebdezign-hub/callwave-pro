const config = require('../config');

/**
 * Lightweight structured logger.
 *
 * Outputs JSON lines (one object per line) in production, and colourised
 * human-readable lines in development. Every call accepts a context object
 * whose fields are merged into the log entry, giving consistent structured
 * fields (timestamp, level, module, message, ...custom) across the app.
 *
 * Designed so it can be swapped for winston/pino later without touching
 * call sites (same info/warn/error/debug surface + child loggers).
 */

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const NAMES = Object.keys(LEVELS);
const maxLevel = LEVELS[config.logLevel] ?? LEVELS.info;
const asJson = config.isProd || config.logFormat === 'json';

const COLOURS = {
  fatal: '\x1b[35m', error: '\x1b[31m', warn: '\x1b[33m',
  info: '\x1b[32m', debug: '\x1b[36m', trace: '\x1b[90m', reset: '\x1b[0m',
};

function safeMeta(meta) {
  if (meta instanceof Error) return { error: meta.message, stack: meta.stack };
  if (meta && typeof meta === 'object') return meta;
  if (meta === undefined) return {};
  return { value: meta };
}

function write(level, message, meta = {}, module) {
  if (LEVELS[level] > maxLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'callwave',
    ...(module ? { module } : {}),
    message,
    ...safeMeta(meta),
  };

  if (asJson) {
    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
    return;
  }

  // Pretty (development)
  const ts = entry.timestamp.replace('T', ' ').replace(/\..+/, '');
  const tag = `${COLOURS[level]}${level.toUpperCase().padEnd(5)}${COLOURS.reset}`;
  const mod = module ? `${COLOURS.trace}[${module}]${COLOURS.reset} ` : '';
  const extra = Object.keys(entry)
    .filter((k) => !['timestamp', 'level', 'service', 'module', 'message'].includes(k))
    .map((k) => `${k}=${JSON.stringify(entry[k])}`)
    .join(' ');
  process.stdout.write(`${ts} ${tag} ${mod}${message}${extra ? '  ' + COLOURS.trace + extra + COLOURS.reset : ''}\n`);
}

function makeLogger(module) {
  return {
    fatal: (msg, meta) => write('fatal', msg, meta, module),
    error: (msg, meta) => write('error', msg, meta, module),
    warn: (msg, meta) => write('warn', msg, meta, module),
    info: (msg, meta) => write('info', msg, meta, module),
    debug: (msg, meta) => write('debug', msg, meta, module),
    trace: (msg, meta) => write('trace', msg, meta, module),
    /** Create a child logger that tags every entry with `opts.module`. */
    child: (opts = {}) => makeLogger(opts.module || module),
    level: module,
  };
}

const logger = makeLogger();

module.exports = logger;
module.exports.LEVELS = NAMES;
