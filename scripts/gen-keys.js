const jwt = require('jsonwebtoken');

const secret = 'your-super-secret-jwt-token-with-at-least-32-characters-long';

const anonPayload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
};

const servicePayload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
};

const anonKey = jwt.sign(anonPayload, secret);
const serviceKey = jwt.sign(servicePayload, secret);

console.log('--- NEW KEYS ---');
console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceKey);
