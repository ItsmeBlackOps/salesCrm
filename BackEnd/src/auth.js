// src/auth.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { base as prismaBase, makePrisma } from './lib/prisma.js';
const prisma = makePrisma(prismaBase);
import dotenv from 'dotenv';

dotenv.config();

// Token expiration defaults (use "15m" and "7d" if not provided)
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set');
}

// DB-backed refresh tokens (fallback to in-memory if model/migration missing)
// Schema: prisma/schema.prisma -> model refresh_tokens
const __inMemoryRefresh = new Map();

function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
}

/**
 * Hash a plain-text password using SHA-256
 */
export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hashed) {
  if (!hashed) return false;
  if (isBcryptHash(hashed)) return bcrypt.compareSync(plain, hashed);
  const legacy = crypto.createHash('sha256').update(plain).digest('hex');
  return legacy === hashed;
}

/**
 * Middleware to authenticate access token
 */
export function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = header.slice(7);
  jwt.verify(token, JWT_ACCESS_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token' });
    req.user = payload;
    next();
  });
}

/**
 * Issue an access JWT
 */
export function issueAccessToken(payload) {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

/**
 * Alias for backward compatibility
 */
export const issueToken = issueAccessToken;

/**
 * Issue a refresh JWT and store it
 */
export async function issueRefreshToken(payload) {
  const jti = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    jwtid: jti,
  });
  const decoded = jwt.decode(token);
  const exp = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
  try {
    await prisma.refresh_tokens.create({ data: { jti, userid: payload.userId, expiresat: exp } });
  } catch (e) {
    // Fallback for local/dev before migration
    __inMemoryRefresh.set(jti, { userId: payload.userId, exp: exp.getTime(), revoked: false });
  }
  return token;
}

/**
 * Revoke (invalidate) a refresh token by its token string
 */
export async function revokeToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.jti) {
      try {
        await prisma.refresh_tokens.updateMany({ where: { jti: decoded.jti }, data: { revoked: true } });
      } catch {
        const row = __inMemoryRefresh.get(decoded.jti);
        if (row) __inMemoryRefresh.set(decoded.jti, { ...row, revoked: true });
      }
    }
  } catch {
    // ignore invalid token
  }
}

/**
 * Refresh access and issue new refresh token
 */
export async function refreshToken(req, res) {
  const { refreshToken: incoming } = req.body || {};
  if (!incoming) return res.status(400).json({ message: 'Missing refresh token' });
  let payload;
  try {
    payload = jwt.verify(incoming, JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
  const { jti, userId, roleId, exp } = payload;

  // Ensure active in DB
  let row = null;
  try {
    row = await prisma.refresh_tokens.findFirst({ where: { jti, userid: userId, revoked: false } });
  } catch {
    // Fallback to in-memory
    const r = __inMemoryRefresh.get(jti);
    if (!r || r.userId !== userId || r.revoked) return res.status(403).json({ message: 'Refresh token revoked' });
    if (r.exp <= Date.now()) return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
  if (row) {
    if (row.expiresat && new Date(row.expiresat).getTime() <= Date.now()) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
  }

  // Rotate token: revoke old and issue new
  try {
    await prisma.refresh_tokens.update({ where: { jti }, data: { revoked: true } });
  } catch {
    const r = __inMemoryRefresh.get(jti);
    if (r) __inMemoryRefresh.set(jti, { ...r, revoked: true });
  }
  const newAccess = issueAccessToken({ userId, roleId });
  const newRefresh = await issueRefreshToken({ userId, roleId });
  return res.json({ accessToken: newAccess, refreshToken: newRefresh });
}

/**
 * Admin check middleware (roleId 1 or 2 allowed)
 */
export function requireAdmin(req, res, next) {
  if (req.user.roleId <= 2) return next();
  return res.status(403).json({ message: 'Forbidden' });
}

/**
 * Permission check middleware generator
 */
export function requirePermission(action) {
  return async (req, res, next) => {
    const perms = await prisma.role_permissions.findMany({ where: { roleid: req.user.roleId } });
    const has = perms.some(rp => rp.permissionid === action);
    if (has) return next();
    return res.status(403).json({ message: 'Forbidden' });
  };
}
