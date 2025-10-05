import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { performance } from 'node:perf_hooks';
import { base as prismaBase, makePrisma } from './lib/prisma.js';
import { hashPassword, verifyPassword, authenticateToken, requireAdmin, issueToken, revokeToken, refreshToken, issueRefreshToken } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3005;

const ROLE_SUPER_ADMIN = 1;
const ROLE_ADMIN = 2;
const isAdminish = (roleId) => roleId === ROLE_SUPER_ADMIN || roleId === ROLE_ADMIN;

const prisma = makePrisma();


async function getUserHierarchy(userId) {
  const rows = await prisma.$queryRaw`WITH RECURSIVE tree AS (SELECT CAST(${userId} AS INT) AS userid UNION ALL SELECT u.userid FROM users u INNER JOIN tree t ON u.managerid = t.userid) SELECT userid FROM tree`;
  return rows.map((r) => Number(r.userid));
}

async function getAccessibleLead(userId, leadId) {
  const ids = await getUserHierarchy(userId);
  const strIds = ids.map(String);
  return prisma.crmleads.findFirst({ where: { id: Number(leadId), OR: [{ createdby: { in: ids } }, { assignedto: { in: strIds } }] } });
}

// Helpers for date handling
function toDateOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function coerceDateFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(out, f)) out[f] = toDateOrNull(out[f]);
  }
  return out;
}

async function logLeadActivity(leadId, userId, action, details = null) {
  await prisma.crmleadactivity.create({ data: { leadid: Number(leadId), action, changedby: userId ?? null, changedat: new Date(), details } });
}

function sanitizeUser(user) {
  if (!user) return user;
  const { passwordhash, ...safe } = user;
  return safe;
}

function bearerToken(req) {
  return req.headers.authorization?.split(' ')[1] || null;
}

async function requireUserAccess(req, res, next) {
  const { roleId, userId } = req.user;
  const targetId = Number(req.params.id);
  if (isAdminish(roleId)) return next();
  const hierarchy = await getUserHierarchy(userId);
  if (hierarchy.includes(targetId)) return next();
  return res.status(403).json({ message: `Not allowed to access user ${targetId}` });
}

async function requireUserCreate(req, res, next) {
  const { roleId, userId } = req.user;
  if (isAdminish(roleId)) return next();
  const { roleid: newRoleId, managerid } = req.body;
  if (typeof newRoleId !== 'number' || typeof managerid !== 'number') return res.status(400).json({ message: 'roleid and managerid are required' });
  if (newRoleId <= roleId) return res.status(403).json({ message: 'Cannot create a user with equal or higher role' });
  const hierarchy = await getUserHierarchy(userId);
  if (!hierarchy.includes(managerid)) return res.status(403).json({ message: 'ManagerId must be in your branch' });
  return next();
}

async function requireUserUpdate(req, res, next) {
  const { roleId, userId } = req.user;
  if (isAdminish(roleId)) return next();
  const targetId = Number(req.params.id);
  const hierarchy = await getUserHierarchy(userId);
  if (!hierarchy.includes(targetId)) return res.status(403).json({ message: `Not allowed to modify user ${targetId}` });
  const { roleid: newRoleId, managerid } = req.body;
  if (newRoleId !== undefined && newRoleId <= roleId) return res.status(403).json({ message: 'Cannot assign a role equal or higher than yours' });
  if (managerid !== undefined && !hierarchy.includes(managerid)) return res.status(403).json({ message: 'Cannot assign manager outside your branch' });
  return next();
}

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Invalid request' });
  const user = await prisma.users.findUnique({ where: { email }, select: { userid: true, name: true, email: true, passwordhash: true, roleid: true } });
  if (!user || !verifyPassword(password, user.passwordhash)) return res.status(401).json({ message: 'Invalid credentials' });
  // Optional rehash on legacy SHA256
  if (!user.passwordhash.startsWith('$2a$') && !user.passwordhash.startsWith('$2b$') && !user.passwordhash.startsWith('$2y$')) {
    try { await prisma.users.update({ where: { userid: user.userid }, data: { passwordhash: hashPassword(password) } }); } catch { }
  }
  const accessToken = issueToken({ userId: user.userid, roleId: user.roleid });
  const refreshTok = await issueRefreshToken({ userId: user.userid, roleId: user.roleid });
  await prisma.users.update({ where: { userid: user.userid }, data: { lastlogin: new Date() } });
  const { passwordhash, ...safe } = user;
  res.json({ accessToken, token: accessToken, refreshToken: refreshTok, user: safe });
});

app.post('/logout', authenticateToken, async (req, res) => {
  const token = bearerToken(req);
  if (token) await revokeToken(token);
  res.json({ message: 'Logged out' });
});

app.post('/refresh', (req, res) => refreshToken(req, res));

app.get('/me', authenticateToken, async (req, res) => {
  const user = await prisma.users.findUnique({ where: { userid: req.user.userId } });
  if (!user) return res.status(404).json({ message: 'Not found' });

  res.json(sanitizeUser(user));
});

app.put('/me', authenticateToken, async (req, res) => {
  const { name, email, managerid, departmentid } = req.body || {};
  const updated = await prisma.users.update({ where: { userid: req.user.userId }, data: { name, email, managerid, departmentid, updatedat: new Date() } });

  res.json(sanitizeUser(updated));
});

app.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await prisma.users.findUnique({ where: { userid: req.user.userId }, select: { passwordhash: true } });
  if (!user || !verifyPassword(currentPassword, user.passwordhash)) return res.status(400).json({ message: 'Current password incorrect' });
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) return res.status(400).json({ message: 'Password does not meet complexity requirements' });
  await prisma.users.update({ where: { userid: req.user.userId }, data: { passwordhash: hashPassword(newPassword) } });
  res.json({ message: 'Password updated' });
});

app.post('/users/:id/change-password', authenticateToken, requireUserAccess, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) return res.status(400).json({ message: 'Password does not meet complexity requirements' });
  await prisma.users.update({ where: { userid: Number(req.params.id) }, data: { passwordhash: hashPassword(newPassword) } });
  res.json({ message: `Password updated for user ${req.params.id}` });
});

app.get('/assignable-users', authenticateToken, async (req, res) => {
  const { roleId, userId } = req.user;
  const baseSelect = { userid: true, name: true, managerid: true };

  if (isAdminish(roleId)) {
    const users = await prisma.users.findMany({ select: baseSelect });
    return res.json(users);
  }

  const ids = await getUserHierarchy(userId);
  const users = await prisma.users.findMany({ where: { userid: { in: ids } }, select: baseSelect });
  res.json(users);
});

app.get('/roles', authenticateToken, async (_req, res) => {
  res.json(await prisma.roles.findMany());
});

app.get('/roles/:id/permissions', authenticateToken, async (req, res) => {
  const perms = await prisma.role_permissions.findMany({ where: { roleid: Number(req.params.id) }, select: { permissionid: true } });
  res.json(perms.map((p) => p.permissionid));
});

app.put('/roles/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  const roleid = Number(req.params.id);
  const { permissionIds = [] } = req.body || {};
  await prisma.$transaction([
    prisma.role_permissions.deleteMany({ where: { roleid } }),
    permissionIds.length ? prisma.role_permissions.createMany({ data: permissionIds.map((pid) => ({ roleid, permissionid: Number(pid) })), skipDuplicates: true }) : prisma.role_permissions.deleteMany({ where: { roleid: -1 } })
  ]);
  res.json({ permissionIds: permissionIds.map(Number) });
});

app.get('/permissions', authenticateToken, async (_req, res) => {
  res.json(await prisma.permissions.findMany());
});

app.get('/permission-history', authenticateToken, requireAdmin, async (_req, res) => {
  const rows = await prisma.permissionhistory.findMany({ orderBy: { changedat: 'desc' } });
  res.json(rows);
});

app.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  const { userId, action } = req.query;
  if (userId && action) {
    const rows = await prisma.$queryRaw`SELECT * FROM logs WHERE userid = ${Number(userId)} AND action = ${String(action)} ORDER BY timestamp DESC`;
    return res.json(rows);
  }
  if (userId) {
    const rows = await prisma.$queryRaw`SELECT * FROM logs WHERE userid = ${Number(userId)} ORDER BY timestamp DESC`;
    return res.json(rows);
  }
  if (action) {
    const rows = await prisma.$queryRaw`SELECT * FROM logs WHERE action = ${String(action)} ORDER BY timestamp DESC`;
    return res.json(rows);
  }
  const rows = await prisma.$queryRaw`SELECT * FROM logs ORDER BY timestamp DESC`;
  res.json(rows);
});

app.get('/departments', authenticateToken, async (_req, res) => {
  res.json(await prisma.departments.findMany());
});

app.get('/lead-suggestions', authenticateToken, async (req, res) => {
  const name = String(req.query.name || '').trim();
  const phone = String(req.query.phone || '').trim().replace(/\D/g, '');
  const or = [];
  if (phone) or.push({ phone: { startsWith: phone } });
  if (name) or.push({ firstname: { contains: name, mode: 'insensitive' } }, { lastname: { contains: name, mode: 'insensitive' } });
  if (!or.length) return res.status(400).json({ message: 'Missing query' });
  const rows = await prisma.crmleads.findMany({ where: { OR: or }, take: 10, select: { id: true, firstname: true, lastname: true, phone: true, email: true } });
  const out = rows.map((r) => ({ leadid: r.id, fullname: `${r.firstname} ${r.lastname}`.trim(), phone: r.phone, email: r.email }));
  res.json(out);
});

app.get('/role-access', authenticateToken, async (_req, res) => {
  const rows = await prisma.role_component_access.findMany({ select: { component: true, roleid: true, allowed: true } });
  const result = {};
  for (const { component, roleid, allowed } of rows) {
    if (!result[component]) result[component] = {};
    result[component][roleid] = !!allowed;
  }
  res.json(result);
});

app.post('/role-access', authenticateToken, requireAdmin, async (req, res) => {
  const rows = Object.entries(req.body || {}).flatMap(([component, roles]) => Object.entries(roles || {}).map(([rid, allowed]) => ({ component, roleid: Number(rid), allowed: !!allowed })).filter((r) => !Number.isNaN(r.roleid)));
  await prisma.$transaction(async (tx) => {
    await tx.role_component_access.deleteMany();
    if (rows.length) await tx.role_component_access.createMany({ data: rows });
  });
  res.json({ message: 'Permissions updated' });
});

app.get('/users', authenticateToken, async (req, res) => {
  const { roleId, userId } = req.user;
  const take = Math.max(1, Math.min(100, Number(req.query.take) || 50));
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const q = (req.query.q || '').toString().trim();
  const whereBase = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {};

  let where = whereBase;
  if (!isAdminish(roleId)) {
    const ids = await getUserHierarchy(userId);
    where = { AND: [{ userid: { in: ids } }, whereBase] };
  }

  const users = await prisma.users.findMany({
    where,
    take,
    ...(cursor ? { skip: 1, cursor: { userid: cursor } } : {}),
    orderBy: { userid: 'asc' },
  });
  const items = users.map(sanitizeUser);
  const nextCursor = items.length === take ? items[items.length - 1].userid : null;
  res.json({ items, nextCursor });
});

app.get('/users/:id', authenticateToken, requireUserAccess, async (req, res) => {
  const user = await prisma.users.findUnique({ where: { userid: Number(req.params.id) } });
  if (!user) return res.status(404).end();
  res.json(sanitizeUser(user));
});

app.post('/users', authenticateToken, requireUserCreate, async (req, res) => {
  const { name, email, password, roleid, managerid, departmentid } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  try {
    const created = await prisma.users.create({ data: { name, email, passwordhash: hashPassword(password), roleid, managerid, departmentid, createdat: new Date() } });
    res.status(201).json(sanitizeUser(created));
  } catch (e) {
    if (e?.code === 'P2002') return res.status(409).json({ message: 'Email already exists' });
    throw e;
  }
});

app.put('/users/:id', authenticateToken, requireUserAccess, requireUserUpdate, async (req, res) => {
  const { name, email, password, roleid, managerid, departmentid, status } = req.body || {};
  const data = { name, email, roleid, managerid, departmentid, status, updatedat: new Date() };
  if (password) data.passwordhash = hashPassword(password);
  const updated = await prisma.users.update({ where: { userid: Number(req.params.id) }, data });
  res.json(sanitizeUser(updated));
});

app.delete('/users/:id', authenticateToken, requireUserAccess, async (req, res) => {
  await prisma.users.delete({ where: { userid: Number(req.params.id) } });
  res.status(204).end();
});

app.get('/crm-leads', authenticateToken, async (req, res) => {
  const { roleId, userId } = req.user;
  const take = Math.max(1, Math.min(100, Number(req.query.take) || 50));
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;
  const q = (req.query.q || '').toString().trim();
  const dbName = await prisma.$queryRawUnsafe(`
select * from roles


    `);

  console.log("Connected to database:", dbName);

  const qWhere = q
    ? {
      OR: [
        { firstname: { contains: q, mode: 'insensitive' } },
        { lastname: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { company: { contains: q, mode: 'insensitive' } },
      ],
    }
    : {};

  let where = qWhere;
  if (!isAdminish(roleId)) {
    const ids = await getUserHierarchy(userId);
    const strIds = ids.map(String);
    where = { AND: [{ OR: [{ createdby: { in: ids } }, { assignedto: { in: strIds } }] }, qWhere] };
  }

  const leads = await prisma.crmleads.findMany({
    where,
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [
      { createdat: 'desc' },
      { id: 'desc' },
    ],
  });
  const nextCursor = leads.length === take ? leads[leads.length - 1].id : null;
  res.json({ items: leads, nextCursor });
});

app.get('/crm-leads/:id', authenticateToken, async (req, res, next) => {
  const lead = await getAccessibleLead(req.user.userId, req.params.id);
  if (!lead) return res.status(404).end();
  req.lead = lead;
  next();
}, (req, res) => {
  res.json(req.lead);
});

app.post('/crm-leads', authenticateToken, async (req, res) => {
  const payloadRaw = { ...req.body, createdby: req.user.userId };
  const payload = coerceDateFields(payloadRaw, ['createdat', 'updatedat', 'lastcontactedat']);
  const { email, phone, firstname, lastname, legalnamessn, last4ssn } = payload || {};
  // Duplicate checks (case-insensitive for email + legalnamessn)
  const dupWhere = [];
  if (email) dupWhere.push({ email: { equals: String(email), mode: 'insensitive' } });
  if (phone) dupWhere.push({ phone: String(phone) });
  if (firstname && lastname) dupWhere.push({ AND: [{ firstname: { equals: String(firstname), mode: 'insensitive' } }, { lastname: { equals: String(lastname), mode: 'insensitive' } }] });
  if (legalnamessn) dupWhere.push({ legalnamessn: { equals: String(legalnamessn), mode: 'insensitive' } });
  if (last4ssn) dupWhere.push({ last4ssn: String(last4ssn) });
  if (dupWhere.length) {
    const dupe = await prisma.crmleads.findFirst({ where: { OR: dupWhere } });
    if (dupe) {
      let message = 'Duplicate lead';
      if (email && dupe.email?.toLowerCase() === String(email).toLowerCase()) message = 'Email already exists';
      else if (phone && dupe.phone === String(phone)) message = 'Phone already exists';
      else if (firstname && lastname && dupe.firstname?.toLowerCase() === String(firstname).toLowerCase() && dupe.lastname?.toLowerCase() === String(lastname).toLowerCase()) message = 'Full name already exists';
      else if (legalnamessn && dupe.legalnamessn?.toLowerCase() === String(legalnamessn).toLowerCase()) message = 'Legal name already exists';
      else if (last4ssn && dupe.last4ssn === String(last4ssn)) message = 'SSN (last 4) already exists';
      return res.status(409).json({ message });
    }
  }

  const now = new Date();
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.crmleads.create({ data: payload });
    await tx.crmleadactivity.create({ data: { leadid: created.id, action: 'CREATE', changedby: req.user.userId, changedat: now, details: JSON.stringify(payloadRaw) } });
    return created;
  });
  res.status(201).json(lead);
});

app.put('/crm-leads/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  const lead = await getAccessibleLead(req.user.userId, id);

  if (!lead) return res.status(404).end();
  // Duplicate checks for updates (exclude current record)
  const { email, phone, firstname, lastname, legalnamessn, last4ssn } = req.body || {};
  const dupWhere = [];
  if (email) dupWhere.push({ AND: [{ id: { not: id } }, { email: { equals: String(email), mode: 'insensitive' } }] });
  if (phone) dupWhere.push({ AND: [{ id: { not: id } }, { phone: String(phone) }] });
  if (firstname && lastname) dupWhere.push({ AND: [{ id: { not: id } }, { firstname: { equals: String(firstname), mode: 'insensitive' } }, { lastname: { equals: String(lastname), mode: 'insensitive' } }] });
  if (legalnamessn) dupWhere.push({ AND: [{ id: { not: id } }, { legalnamessn: { equals: String(legalnamessn), mode: 'insensitive' } }] });
  if (last4ssn) dupWhere.push({ AND: [{ id: { not: id } }, { last4ssn: String(last4ssn) }] });
  if (dupWhere.length) {
    const dupe = await prisma.crmleads.findFirst({ where: { OR: dupWhere } });
    if (dupe) {
      let message = 'Duplicate lead';
      if (email && dupe.email?.toLowerCase() === String(email).toLowerCase()) message = 'Email already exists';
      else if (phone && dupe.phone === String(phone)) message = 'Phone already exists';
      else if (firstname && lastname && dupe.firstname?.toLowerCase() === String(firstname).toLowerCase() && dupe.lastname?.toLowerCase() === String(lastname).toLowerCase()) message = 'Full name already exists';
      else if (legalnamessn && dupe.legalnamessn?.toLowerCase() === String(legalnamessn).toLowerCase()) message = 'Legal name already exists';
      else if (last4ssn && dupe.last4ssn === String(last4ssn)) message = 'SSN (last 4) already exists';
      return res.status(409).json({ message });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { id, createdat, updatedat, createdby, ...data } = req.body; // strip out sensitive fields
    const dataCoerced = coerceDateFields(data, ['lastcontactedat']);

    const u = await tx.crmleads.update({
      where: { id },
      data: {
        ...dataCoerced,
        // enforce DB rules:
        updatedat: new Date(),  // always now
        // createdat, createdby come from DB and remain unchanged
      },
    });

    await tx.crmleadactivity.create({
      data: {
        leadid: id,
        action: 'UPDATE',
        changedby: req.user.userId,
        changedat: new Date(),
        details: JSON.stringify(dataCoerced), // only user-editable fields
      },
    });

    return u;
  });

  res.json(updated);

});

// Allow partial updates to a lead; users within hierarchy (creator/assignee branch)
// can edit freely, same as PUT, but with partial payloads.
app.patch('/crm-leads/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  const lead = await getAccessibleLead(req.user.userId, id);
  if (!lead) return res.status(404).end();

  // Duplicate checks only for fields present in the patch
  const { email, phone, firstname, lastname, legalnamessn, last4ssn } = req.body || {};
  const dupWhere = [];
  if (email !== undefined && email !== null && String(email).trim() !== '')
    dupWhere.push({ AND: [{ id: { not: id } }, { email: { equals: String(email), mode: 'insensitive' } }] });
  if (phone !== undefined && phone !== null && String(phone).trim() !== '')
    dupWhere.push({ AND: [{ id: { not: id } }, { phone: String(phone) }] });
  if (firstname !== undefined && lastname !== undefined && String(firstname).trim() !== '' && String(lastname).trim() !== '')
    dupWhere.push({ AND: [{ id: { not: id } }, { firstname: { equals: String(firstname), mode: 'insensitive' } }, { lastname: { equals: String(lastname), mode: 'insensitive' } }] });
  if (legalnamessn !== undefined && legalnamessn !== null && String(legalnamessn).trim() !== '')
    dupWhere.push({ AND: [{ id: { not: id } }, { legalnamessn: { equals: String(legalnamessn), mode: 'insensitive' } }] });
  if (last4ssn !== undefined && last4ssn !== null && String(last4ssn).trim() !== '')
    dupWhere.push({ AND: [{ id: { not: id } }, { last4ssn: String(last4ssn) }] });
  if (dupWhere.length) {
    const dupe = await prisma.crmleads.findFirst({ where: { OR: dupWhere } });
    if (dupe) {
      let message = 'Duplicate lead';
      if (email && dupe.email?.toLowerCase() === String(email).toLowerCase()) message = 'Email already exists';
      else if (phone && dupe.phone === String(phone)) message = 'Phone already exists';
      else if (firstname && lastname && dupe.firstname?.toLowerCase() === String(firstname).toLowerCase() && dupe.lastname?.toLowerCase() === String(lastname).toLowerCase()) message = 'Full name already exists';
      else if (legalnamessn && dupe.legalnamessn?.toLowerCase() === String(legalnamessn).toLowerCase()) message = 'Legal name already exists';
      else if (last4ssn && dupe.last4ssn === String(last4ssn)) message = 'SSN (last 4) already exists';
      return res.status(409).json({ message });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const { id: _ignore, createdat: _cA, updatedat: _uA, createdby: _cB, ...data } = req.body || {};
    const dataCoerced = coerceDateFields(data, ['lastcontactedat']);

    const u = await tx.crmleads.update({
      where: { id },
      data: {
        ...dataCoerced,
        updatedat: new Date(),
      },
    });

    await tx.crmleadactivity.create({
      data: {
        leadid: id,
        action: 'UPDATE',
        changedby: req.user.userId,
        changedat: new Date(),
        details: JSON.stringify(dataCoerced),
      },
    });

    return u;
  });

  res.json(updated);
});

app.delete('/crm-leads/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);
  const lead = await getAccessibleLead(req.user.userId, id);
  if (!lead) return res.status(404).end();
  await prisma.$transaction(async (tx) => {
    await tx.crmleads.delete({ where: { id } });
    await tx.crmleadactivity.create({ data: { leadid: id, action: 'DELETE', changedby: req.user.userId, changedat: new Date() } });
  });
  res.status(204).end();
});

app.get('/crm-leads/:id/activity', authenticateToken, async (req, res) => {
  const lead = await getAccessibleLead(req.user.userId, req.params.id);
  if (!lead) return res.status(404).end();
  const activity = await prisma.crmleadactivity.findMany({ where: { leadid: Number(req.params.id) }, orderBy: { changedat: 'desc' } });
  res.json(activity);
});

app.get('/crm-leads/:id/history', authenticateToken, async (req, res) => {
  const lead = await getAccessibleLead(req.user.userId, req.params.id);
  if (!lead) return res.status(404).end();
  const history = await prisma.crmleadhistory.findMany({ where: { leadid: Number(req.params.id) }, orderBy: { changedat: 'desc' } });
  res.json(history);
});

app.post('/crmLeadHistory', authenticateToken, async (req, res) => {
  const { leadId, state, changedAt } = req.body || {};
  const lead = await getAccessibleLead(req.user.userId, leadId);
  if (!lead) return res.status(404).json({ message: 'Not found' });
  const changedAtDate = toDateOrNull(changedAt) || new Date();
  const record = await prisma.crmleadhistory.create({ data: { leadid: Number(leadId), state, changedby: req.user.userId, changedat: changedAtDate } });
  res.status(201).json(record);
});

app.get('/columns', authenticateToken, async (_req, res) => {
  res.json(await prisma.crmleadcolumns.findMany());
});

app.post('/columns', authenticateToken, requireAdmin, async (req, res) => {
  const col = await prisma.crmleadcolumns.create({ data: req.body });
  res.status(201).json(col);
});

app.delete('/columns/:id', authenticateToken, requireAdmin, async (req, res) => {
  await prisma.crmleadcolumns.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
});

app.post('/clients', authenticateToken, async (req, res) => {
  const { leadid } = req.body || {};
  const { roleId, userId } = req.user;
  if (!isAdminish(roleId)) {
    const lead = await getAccessibleLead(userId, leadid);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
  }
  const client = await prisma.clients.create({ data: coerceDateFields(req.body, ['createdat', 'updatedat']) });
  res.status(201).json(client);
});

app.get('/clients', authenticateToken, async (req, res) => {
  const { roleId, userId } = req.user;
  if (isAdminish(roleId)) return res.json(await prisma.clients.findMany());
  const ids = await getUserHierarchy(userId);
  const strIds = ids.map(String);
  const accessibleLeads = await prisma.crmleads.findMany({ where: { OR: [{ createdby: { in: ids } }, { assignedto: { in: strIds } }] }, select: { id: true } });
  const leadIds = accessibleLeads.map((l) => l.id);
  if (leadIds.length === 0) return res.json([]);
  const clients = await prisma.clients.findMany({ where: { leadid: { in: leadIds } } });
  res.json(clients);
});

app.get('/clients/by-lead/:leadId', authenticateToken, async (req, res) => {
  const leadId = Number(req.params.leadId);
  const lead = await getAccessibleLead(req.user.userId, leadId);
  if (!lead) return res.status(404).json({ message: 'Not found' });
  const client = await prisma.clients.findFirst({ where: { leadid: leadId } });
  if (!client) return res.status(404).end();
  res.json(client);
});

app.get('/clients/:id', authenticateToken, async (req, res) => {
  const client = await prisma.clients.findUnique({ where: { clientid: Number(req.params.id) } });
  if (!client) return res.status(404).end();
  const lead = await getAccessibleLead(req.user.userId, client.leadid);
  if (!lead) return res.status(404).json({ message: 'Not found' });
  res.json(client);
});

app.get('/_diag/db-latency', async (_req, res) => {
  const sample = async () => {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    return performance.now() - t0;
  };
  const first = await sample();
  const second = await sample();
  const third = await sample();
  res.json({ first_ms: Number(first.toFixed(1)), second_ms: Number(second.toFixed(1)), third_ms: Number(third.toFixed(1)) });
});

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

app.listen(PORT, async () => {
  try {
    const t0 = performance.now();
    await prisma.$connect();
    const t1 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const t2 = performance.now();
    console.log(`Server running on port ${PORT}`);
    console.log(`DB connect: ${(t1 - t0).toFixed(1)} ms, first SELECT 1: ${(t2 - t1).toFixed(1)} ms`);
  } catch (e) {
    console.error('DB warmup failed:', e);
    process.exit(1);
  }
});
