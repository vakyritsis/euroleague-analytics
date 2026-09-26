DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'euroleague') THEN
        CREATE ROLE euroleague LOGIN PASSWORD 'euroleague';
    END IF;
END
$$;

ALTER ROLE euroleague PASSWORD 'euroleague';

SELECT 'CREATE DATABASE euroleague OWNER euroleague'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'euroleague')\gexec
