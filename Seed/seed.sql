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
('sa@example.test','SA User','Super Admin','$2a$10$hashhashhash'),
('admin@example.test','Admin User','Admin','$2a$10$hashhashhash'),
('mgr@example.test','Manager User','Manager','$2a$10$hashhashhash'),
('agent@example.test','Agent User','Agent','$2a$10$hashhashhash'),
('lead@example.test','Lead User','Lead','$2a$10$hashhashhash')
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
