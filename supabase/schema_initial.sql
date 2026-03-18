-- ==========================================
-- SalesTracker Pro: Initial Schema
-- Target: Supabase Cloud
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE record_type AS ENUM ('SALES_ORDER', 'INVOICE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual', 'quarterly', 'one-time');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'trial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_category AS ENUM (
      'Marketing', 'Development', 'Design', 'HR', 'Finance', 'Operations', 
      'Communication', 'Analytics', 'Security', 'Infrastructure', 'General'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES

-- Companies
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    tax_id TEXT,
    country TEXT,
    industry TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6' NOT NULL,
    sort_order INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Sales Records
CREATE TABLE IF NOT EXISTS public.sales_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    record_type record_type DEFAULT 'SALES_ORDER' NOT NULL,
    amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
    record_month INT NOT NULL CHECK (record_month >= 1 AND record_month <= 12),
    record_year INT NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tool_name TEXT NOT NULL,
    provider TEXT,
    category subscription_category DEFAULT 'General' NOT NULL,
    description TEXT,
    monthly_cost_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
    billing_cycle billing_cycle DEFAULT 'monthly' NOT NULL,
    annual_cost_usd NUMERIC(15,2),
    status subscription_status DEFAULT 'active' NOT NULL,
    renewal_date DATE,
    start_date DATE DEFAULT CURRENT_DATE NOT NULL,
    cancel_date DATE,
    url TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. VIEWS

-- Monthly Totals
CREATE OR REPLACE VIEW public.v_monthly_totals AS
SELECT 
    company_id,
    record_type,
    record_year,
    record_month,
    SUM(amount_usd) as total_usd
FROM public.sales_records
GROUP BY company_id, record_type, record_year, record_month;

-- Annual by Category
CREATE OR REPLACE VIEW public.v_annual_by_category AS
SELECT 
    sr.company_id,
    sr.record_type,
    sr.record_year,
    sr.category_id,
    c.name as category_name,
    c.color as category_color,
    SUM(sr.amount_usd) as total_usd
FROM public.sales_records sr
JOIN public.categories c ON sr.category_id = c.id
GROUP BY sr.company_id, sr.record_type, sr.record_year, sr.category_id, c.name, c.color;

-- 5. RLS POLICIES (Básicas por empresa)

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Evitar duplicados en políticas si se re-ejecuta
DO $$ BEGIN
    CREATE POLICY companies_view_own ON public.companies FOR SELECT USING (id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY profiles_view_own_company ON public.profiles FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY categories_company_isolation ON public.categories FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY sales_records_company_isolation ON public.sales_records FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY subscriptions_company_isolation ON public.subscriptions FOR ALL USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. TRIGGERS para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_companies_updated_at ON public.companies;
CREATE TRIGGER tr_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_categories_updated_at ON public.categories;
CREATE TRIGGER tr_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_sales_records_updated_at ON public.sales_records;
CREATE TRIGGER tr_sales_records_updated_at BEFORE UPDATE ON public.sales_records FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS tr_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER tr_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 7. AUTH TRIGGER (Automatically create profile on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_company_id UUID;
BEGIN
    INSERT INTO public.companies (name) VALUES ('Mi Empresa') RETURNING id INTO default_company_id;

    INSERT INTO public.profiles (id, company_id, email, full_name, role)
    VALUES (
        NEW.id,
        default_company_id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'admin'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
