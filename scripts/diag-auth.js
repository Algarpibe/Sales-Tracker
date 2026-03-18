const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAuthStatus() {
  console.log('--- Auth Diagnostic ---');
  
  // 1. Check if we can at least reach the API
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (profileError) {
    console.log('❌ Public API Error:', profileError.message);
  } else {
    console.log('✅ Public API reachable. Profiles found:', profileData.length);
  }

  // 2. Try a dummy login to see the exact error response
  console.log('Attempting login with admin@ejemplo.com...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@ejemplo.com',
    password: 'password123'
  });

  if (authError) {
    console.log('❌ Auth Login Error:', authError.message);
    console.log('Full Auth Error Object:', JSON.stringify(authError, null, 2));
  } else {
    console.log('✅ Auth Login SUCCESSFUL!');
    console.log('User ID:', authData.user.id);
  }
}

checkAuthStatus();
