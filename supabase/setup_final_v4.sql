-- ============================================================
-- REPARACIÓN NUCLEAR (Final): Search Path & Identity Fix
-- ============================================================

-- 1. Forzar búsqueda en todos los esquemas necesarios a nivel de Base de Datos
ALTER DATABASE postgres SET search_path TO public, auth, extensions, storage;

-- 2. Asegurar que los roles tengan el search_path correcto
ALTER ROLE authenticator SET search_path TO public, auth, extensions, storage;
ALTER ROLE anon SET search_path TO public, auth, extensions, storage;
ALTER ROLE authenticated SET search_path TO public, auth, extensions, storage;
ALTER ROLE service_role SET search_path TO public, auth, extensions, storage;

-- 3. Permisos de suplantación (FUNDAMENTAL para Login)
-- Permite que el 'authenticator' se convierta en 'anon' o 'authenticated'
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- 4. Garantizar uso de los esquemas a todos los niveles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, authenticator;

-- 5. Recarga total de la caché de la API
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Verificación rápida (Copia y pega esto en una nueva consulta después de ejecutar lo anterior)
-- SHOW search_path;
