-- ============================================================
-- INSPECCIÓN Y REALINEACIÓN DE INSTANCIA (Auth)
-- ============================================================

-- 1. Ver qué ID de instancia está buscando Supabase
-- A veces hay registros de sistema que ya tienen el ID correcto
SELECT instance_id, count(*) 
FROM auth.users 
GROUP BY instance_id;

-- 2. Si no hay usuarios, buscar en la tabla de esquemas/configuración si existe
-- (Depende de la versión de GoTrue)
-- SELECT id FROM auth.instances LIMIT 1;

-- 3. RE-INSERTAR EL USUARIO CON EL ID DE INSTANCIA "POR DEFECTO" 
-- O EL QUE ENCONTREMOS. En Easypanel suele ser ceros, pero vamos a asegurar.

DO $$
DECLARE
  v_instance_id UUID;
BEGIN
  -- Intentamos capturar un ID existente si lo hay
  SELECT instance_id INTO v_instance_id FROM auth.users LIMIT 1;
  
  -- Si no hay ninguno, usamos el estándar de ceros
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  RAISE NOTICE 'Usando instance_id: %', v_instance_id;

  -- Insertar o actualizar
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@ejemplo.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, is_super_admin
    )
    VALUES (
      gen_random_uuid(), v_instance_id, 'authenticated', 'authenticated', 
      'admin@ejemplo.com', crypt('password123', gen_salt('bf')), 
      now(), '{"provider":"email","providers":["email"]}', 
      '{"full_name": "Administrador"}', 
      now(), now(), false
    );
  ELSE
    UPDATE auth.users 
    SET instance_id = v_instance_id,
        encrypted_password = crypt('password123', gen_salt('bf')),
        email_confirmed_at = now()
    WHERE email = 'admin@ejemplo.com';
  END IF;
END $$;

-- 4. Verificar resultado final
SELECT id, email, instance_id, email_confirmed_at FROM auth.users;
