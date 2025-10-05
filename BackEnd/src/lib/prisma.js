// src/lib/prisma.js  (ESM)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { withOptimize } from '@prisma/extension-optimize';

const g = globalThis;

const enableQueryLogging =
  String(process.env.LOG_PRISMA_QUERIES || '').toLowerCase() === 'true' ||
  process.env.LOG_PRISMA_QUERIES === '1';

const prismaLogConfig = enableQueryLogging
  ? [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ]
  : process.env.NODE_ENV === 'development'
  ? ['warn', 'error']
  : ['error'];

export const base =
  g.__prisma ??
  new PrismaClient({
    log: prismaLogConfig,
  });

if (enableQueryLogging) {
  base.$on('query', (e) => {
    console.log('PRISMA QUERY:', e.query);
    console.log('PRISMA PARAMS:', e.params);
    console.log('PRISMA DURATION_MS:', e.duration);
  });
}

if (process.env.NODE_ENV !== 'production') g.__prisma = base;

// ---- Lightweight query cache middleware (attach BEFORE any $extends) ----
// Config
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30000);
const CACHE_MAX = Number(process.env.CACHE_MAX || 1000);

// Simple in-memory cache suitable for a single-node process
const cache = new Map();
const modelIndex = new Map();

const stableStringify = (obj) => {
  const seen = new WeakSet();
  const s = (o) => {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (seen.has(o)) return '"[Circular]"';
    seen.add(o);
    if (Array.isArray(o)) return '[' + o.map(s).join(',') + ']';
    const keys = Object.keys(o).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + s(o[k])).join(',') + '}';
  };
  return s(obj);
};
const makeKey = (model, action, args) => model + ':' + action + ':' + stableStringify(args);

function setCache(key, model, value) {
  const expires = Date.now() + CACHE_TTL_MS;
  cache.set(key, { value, expires });
  if (!modelIndex.has(model)) modelIndex.set(model, new Set());
  modelIndex.get(model).add(key);
  if (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
      for (const s of modelIndex.values()) s.delete(firstKey);
    }
  }
}
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    for (const s of modelIndex.values()) s.delete(key);
    return undefined;
  }
  return entry.value;
}
function invalidateModel(model) {
  if (!model) return;
  const set = modelIndex.get(model);
  if (set) {
    for (const k of set) cache.delete(k);
    modelIndex.delete(model);
  }
}
function invalidateAll() {
  cache.clear();
  modelIndex.clear();
}

const READ_ACTIONS = new Set(['findUnique', 'findFirst', 'findMany', 'aggregate', 'count', 'groupBy']);
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

// Attach middleware to base BEFORE any extension is created
base.$use(async (params, next) => {
  if (READ_ACTIONS.has(params.action)) {
    const key = makeKey(params.model, params.action, params.args);
    const hit = getCache(key);
    if (hit !== undefined) return hit;
    const result = await next(params);
    setCache(key, params.model, result);
    return result;
  }
  if (WRITE_ACTIONS.has(params.action)) {
    const result = await next(params);
    invalidateModel(params.model);
    return result;
  }
  if (params.action === 'executeRaw') {
    const result = await next(params);
    invalidateAll();
    return result;
  }
  return next(params);
});

// Factory: call this **after** you’ve attached any base.$use(...) middleware
export function makePrisma() {
  return base.$extends(
    withOptimize({ apiKey: process.env.OPTIMIZE_API_KEY || '' })
  );
}
