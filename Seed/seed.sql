-- Minimal synthetic data for local/test envs (no PII).
-- Adjust to match your schema.

-- Roles
CREATE TABLE IF NOT EXISTS roles (id serial primary key, name text unique not null);
INSERT INTO roles (name) VALUES
('Super Admin'), ('Admin'), ('Manager'), ('Agent'), ('Lead')
ON CONFLICT (name) DO NOTHING;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id serial primary key,
  email text unique not null,
  name text not null,
  role text not null references roles(name),
  password_hash text not null
);

INSERT INTO users (email, name, role, password_hash) VALUES
('sa@example.test','SA User','Super Admin','cd55f733e210a64a64c8eee9865df777504d05a9c5d3877fdebe73cdfc71e05d'),
('admin@example.test','Admin User','Admin','c1c224b03cd9bc7b6a86d77f5dace40191766c485cd55dc48caf9ac873335d6f'),
('mgr@example.test','Manager User','Manager','8b2085f74dfa9c78a23b7d573c23d27d6d0b0e50c82a9b13138b193325be3814'),
('agent@example.test','Agent User','Agent','11b39c93777e8f1f3983bdba7c72b22fe68cfea20c677e9de53e17cb7dbfb19f'),
('lead@example.test','Lead User','Lead','645978287991a6f40bcaf5840f5653b89b75b3bd1ea78cf9f39192e2400ac23e')
ON CONFLICT (email) DO NOTHING;

-- Departments
CREATE TABLE IF NOT EXISTS departments (id serial primary key, name text unique not null);
INSERT INTO departments (name) VALUES ('Sales'), ('Support'), ('Ops') ON CONFLICT (name) DO NOTHING;

-- Leads
CREATE TABLE IF NOT EXISTS crmleads (
  id serial primary key,
  title text not null,
  owner_email text not null references users(email),
  status text not null default 'new',
  region text not null default 'West'
);

INSERT INTO crmleads (title, owner_email, status, region) VALUES
('Acme - Renewal','agent@example.test','new','West'),
('Globex - Expansion','mgr@example.test','in_progress','West');

-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id serial primary key,
  name text not null,
  origin_lead_id int references crmleads(id),
  owner_email text not null references users(email)
);

INSERT INTO clients (name, origin_lead_id, owner_email) VALUES
('Acme Ltd', 1, 'mgr@example.test')
ON CONFLICT DO NOTHING;
