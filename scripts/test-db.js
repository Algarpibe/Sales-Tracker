const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing connection to:', supabaseUrl);
  
  // Try to fetch categories (should be empty but not error if schema is ok)
  const { data, error } = await supabase
    .from('categories')
    .select('count', { count: 'exact', head: true });

  if (error) {
    console.error('Connection Error:', error.message);
    console.error('Full Error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Connection Successful! Schema "categories" is available.');
    console.log('Data count:', data);
  }
}

testConnection();
