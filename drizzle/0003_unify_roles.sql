-- Unificación de roles: elimina el valor duplicado 'viewer' del enum user_role
-- (se estandariza en 'lector' para el rol de solo lectura) y fija el default.
-- Seguro solo si NINGÚN profile usa 'viewer' (verificado: 0 filas).
-- El arreglo funcional ya está en código (el hook de alta crea 'lector'); esta
-- migración es la limpieza del esquema en BD para que coincida con schema.ts.

BEGIN;

-- Por si quedara alguna fila con 'viewer', pásala a 'lector' antes de recrear.
UPDATE profiles SET role = 'lector' WHERE role = 'viewer';

ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'lector');

ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE profiles
  ALTER COLUMN role TYPE user_role USING role::text::user_role;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'lector';

DROP TYPE user_role_old;

COMMIT;
