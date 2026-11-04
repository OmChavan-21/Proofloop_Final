-- Run as a database administrator once per environment, before migrations.
-- Supply passwords outside source control and provision these roles separately.
CREATE ROLE proofloop_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE proofloop_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA auth AUTHORIZATION proofloop_migrator;
CREATE SCHEMA app AUTHORIZATION proofloop_migrator;
GRANT CONNECT ON DATABASE proofloop TO proofloop_migrator, proofloop_app;
GRANT USAGE ON SCHEMA auth, app TO proofloop_app;
-- Apply ownership to migration-created objects; runtime is deliberately not owner.
-- Migrations must GRANT runtime access explicitly to required tables/sequences.
