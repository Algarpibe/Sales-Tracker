-- AUDITORÍA DE ARQUITECTO SENIOR - SalesTracker Pro
-- Objetivo: Identificar la causa del Error 500 en el servicio de Auth

-- 1. Verificar extensiones y sus esquemas (GoTrue las necesita)
SELECT n.nspname as schema_name, e.extname as extension_name
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname IN ('pgcrypto', 'uuid-ossp');

-- 2. Verificar triggers en auth.users (si uno falla, el API devuelve 500)
SELECT tgname as trigger_name, tgenabled as status, tgtype
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass;

-- 3. Ver el estado de los usuarios y su instancia
-- Buscamos discordancias en instance_id o aud
SELECT id, email, instance_id, aud, role, last_sign_in_at 
FROM auth.users;

-- 4. Verificar qué roles pueden ver qué esquemas (Auditando PostgREST vs GoTrue)
SELECT grantee, object_schema, privilege_type
FROM information_schema.usage_privileges 
WHERE object_schema IN ('auth', 'public', 'extensions');

-- 5. Prueba de hashing (¿Funciona crypt en el contexto actual?)
SELECT crypt('password123', gen_salt('bf')) as test_hash;
