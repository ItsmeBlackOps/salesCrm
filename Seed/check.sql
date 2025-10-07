-- Verification queries for local/test databases
-- Expected after seeding: roles=5, users=5, departments=3, crmleads>=2, clients>=1

-- Basic counts
SELECT 'roles' AS table, COUNT(*) AS count FROM roles
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'crmleads', COUNT(*) FROM crmleads
UNION ALL SELECT 'clients', COUNT(*) FROM clients;

-- Sample rows from each table (match actual columns)
SELECT roleid, name FROM roles ORDER BY roleid;
SELECT userid, email, roleid FROM users ORDER BY userid;
SELECT departmentid, name FROM departments ORDER BY departmentid;
SELECT id, firstname, lastname, email, status FROM crmleads ORDER BY id;
SELECT id, name, origin_lead_id, owner_email FROM clients ORDER BY id;

-- Foreign key sanity checks
-- Users' roleid must exist in roles
SELECT u.email, u.roleid
FROM users u
LEFT JOIN roles r ON r.roleid = u.roleid
WHERE u.roleid IS NOT NULL AND r.roleid IS NULL;

-- Clients.owner_email must exist in users
SELECT c.id, c.owner_email
FROM clients c
LEFT JOIN users u ON u.email = c.owner_email
WHERE u.email IS NULL;

-- Clients.origin_lead_id must exist in crmleads
SELECT c.id, c.origin_lead_id
FROM clients c
LEFT JOIN crmleads l ON l.id = c.origin_lead_id
WHERE c.origin_lead_id IS NOT NULL AND l.id IS NULL;

-- Potential duplicates that should not exist
SELECT email, COUNT(*) AS dup_count
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- List public tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
