-- Least-privilege login roles for the api and worker, each with its own timeouts. Idempotent: re-run it to rotate a
-- password or change a timeout. Run as the migration owner (POSTGRES_USER): default privileges below are recorded for
-- the role running the script, which is the role that creates every future table through migrations.
--
--   docker compose -f docker-compose.staging.yml exec -T postgres sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v api_password="$API_PW" -v worker_password="$WORKER_PW"' \
--     < deploy/db-roles.sql
--
-- (pass API_PW / WORKER_PW into the container with `exec -e API_PW=... -e WORKER_PW=...`)
--
-- Timeouts from ALTER ROLE apply when a connection opens: restart api and worker after changing them.

\set ON_ERROR_STOP on

-- Raised as an error, not \quit, so a missing password exits non-zero instead of looking like success.
\if :{?api_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Missing -v api_password=...'; END $$;
\endif
\if :{?worker_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Missing -v worker_password=...'; END $$;
\endif

BEGIN;

SELECT format('CREATE ROLE %I', r)
FROM unnest(ARRAY['bonlift_api', 'bonlift_worker']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
\gexec

ALTER ROLE bonlift_api    WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_password';
ALTER ROLE bonlift_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_password';

-- api: request-path queries; anything slower than 30s is a bug, not a workload.
ALTER ROLE bonlift_api SET statement_timeout = '30s';
ALTER ROLE bonlift_api SET idle_in_transaction_session_timeout = '30s';

-- worker: batch calculations run in seconds at staging volume; 5min caps a bad plan to 5 minutes of one core.
ALTER ROLE bonlift_worker SET statement_timeout = '5min';
ALTER ROLE bonlift_worker SET idle_in_transaction_session_timeout = '2min';

GRANT CONNECT ON DATABASE :"DBNAME" TO bonlift_api, bonlift_worker;
GRANT USAGE ON SCHEMA public TO bonlift_api, bonlift_worker;

-- Row access only: no DDL, no TRUNCATE, no ownership.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bonlift_api, bonlift_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bonlift_api, bonlift_worker;

-- Tables and sequences created later by migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bonlift_api, bonlift_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO bonlift_api, bonlift_worker;

-- Migration history belongs to the migrate job only.
REVOKE ALL ON TABLE pgmigrations FROM bonlift_api, bonlift_worker;

COMMIT;
