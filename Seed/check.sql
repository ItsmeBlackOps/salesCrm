-- Verification queries for local/test databases
-- Expected after seeding: roles=5, users=5, departments=3, crmleads>=2, clients>=1

-- Basic counts
SELECT 'roles' AS table, COUNT(*) AS count FROM roles
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'crmleads', COUNT(*) FROM crmleads
UNION ALL SELECT 'clients', COUNT(*) FROM clients;

-- Sample rows from each table
SELECT id, name FROM roles ORDER BY id;
SELECT id, email, role FROM users ORDER BY id;
SELECT id, name FROM departments ORDER BY id;
SELECT id, title, owner_email, status, region FROM crmleads ORDER BY id;
SELECT id, name, origin_lead_id, owner_email FROM clients ORDER BY id;

-- Foreign key sanity checks
-- Users' role must exist in roles
SELECT u.email, u.role
FROM users u
LEFT JOIN roles r ON r.name = u.role
WHERE r.name IS NULL;

-- Leads' owner_email must exist in users
SELECT l.id, l.owner_email
FROM crmleads l
LEFT JOIN users u ON u.email = l.owner_email
WHERE u.email IS NULL;

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

