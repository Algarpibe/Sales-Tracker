-- ============================================================
-- SETUP FINAL (V3): User Creation & Permissions Repair
-- ============================================================

-- 1. Grant permissions to auth schema
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO anon, authenticated, service_role;

-- 2. Ensure public schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 3. Create Admin User manually
-- Datos: admin@ejemplo.com / password123
DO $$
DECLARE
  new_uid UUID;
  new_company_id UUID := uuid_generate_v4();
BEGIN
  -- 3.1. Crear Empresa
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE name = 'Mi Empresa Pro') THEN
    INSERT INTO public.companies (id, name) VALUES (new_company_id, 'Mi Empresa Pro');
  ELSE
    SELECT id INTO new_company_id FROM public.companies WHERE name = 'Mi Empresa Pro' LIMIT 1;
  END IF;

  -- 3.2. Crear Usuario en auth.users (si no existe)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@ejemplo.com') THEN
    new_uid := uuid_generate_v4();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, is_super_admin
    )
    VALUES (
      new_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
      'admin@ejemplo.com', crypt('password123', gen_salt('bf')), 
      now(), '{"provider":"email","providers":["email"]}', 
      '{"full_name": "Administrador", "company_name": "Mi Empresa Pro"}', 
      now(), now(), false
    );
  ELSE
    SELECT id INTO new_uid FROM auth.users WHERE email = 'admin@ejemplo.com';
    UPDATE auth.users SET encrypted_password = crypt('password123', gen_salt('bf')) WHERE id = new_uid;
  END IF;

  -- 3.3. Forzar inserción en profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_uid) THEN
    INSERT INTO public.profiles (id, company_id, email, full_name, role)
    VALUES (new_uid, new_company_id, 'admin@ejemplo.com', 'Administrador', 'admin');
  ELSE
    UPDATE public.profiles SET role = 'admin', company_id = new_company_id WHERE id = new_uid;
  END IF;

END $$;

-- 4. Reload PostgREST Cache
NOTIFY pgrst, 'reload schema';
