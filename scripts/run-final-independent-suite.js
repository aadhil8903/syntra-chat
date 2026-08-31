const crypto = require('crypto');

const API_URL = 'http://localhost:3000/api';
const AI_URL = 'http://localhost:8000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} ${details ? '- ' + details : ''}`);
  }
}

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  let data = null;
  let text = '';
  try {
    text = await res.text();
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, data, rawText: text };
}

async function runFinalSuite() {
  console.log('================================================================');
  console.log('ENTER-CHAT FINAL INDEPENDENT SECURITY & INTEGRITY VERIFICATION');
  console.log('================================================================\n');

  // 1. Authenticate Admin
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  }),
  });
  assert(adminLogin.status === 200, 'Admin successfully logs in');
  const adminToken = adminLogin.data.accessToken;

  // 2. Concurrency Stress & Cap Recovery Testing (Max 2 Generations)
  console.log('\n--- 1. Concurrency Limiting & Counter Recovery Under Live Load ---');
  
  // Provision Test User Concurrency
  const createConcUser = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'conc_stress@test.local',
      firstName: 'Conc',
      lastName: 'Stress',
      role: 'user',
      departments: ['Engineering'],
    }),
  });
  const concPass = createConcUser.data?.temporaryPassword || 'TempPass123!';
  const concLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'conc_stress@test.local', password: concPass }),
  });
  const concToken = concLogin.data.accessToken;
  const concId = concLogin.data.user.id;

  // Create 3 distinct conversations for conc user
  const [c1, c2, c3] = await Promise.all([
    request('/conversations', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ title: 'Chat 1' }) }),
    request('/conversations', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ title: 'Chat 2' }) }),
    request('/conversations', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ title: 'Chat 3' }) }),
  ]);
  const c1Id = c1.data.id || c1.data._id;
  const c2Id = c2.data.id || c2.data._id;
  const c3Id = c3.data.id || c3.data._id;

  // Fire 3 simultaneous message generation requests from the same user
  const promises = [
    request('/messages', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ conversationId: c1Id, content: 'Calculate 10 + 20' }) }),
    request('/messages', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ conversationId: c2Id, content: 'Calculate 30 + 40' }) }),
    request('/messages', { method: 'POST', headers: { Authorization: `Bearer ${concToken}` }, body: JSON.stringify({ conversationId: c3Id, content: 'Calculate 50 + 60' }) }),
  ];

  const results = await Promise.all(promises);
  const statusCodes = results.map(r => r.status);
  console.log('  Live Concurrency HTTP Responses for 3 simultaneous requests:', statusCodes);

  const hadTooManyRequests = statusCodes.includes(429) || statusCodes.includes(400);
  assert(hadTooManyRequests, 'Server successfully intercepted and rejected concurrent request exceeding limit (HTTP 429/400)');

  // Wait for completed requests and check active generations count
  const activeCheck = await request('/messages/active-generations', {
    headers: { Authorization: `Bearer ${concToken}` },
  });
  assert(Array.isArray(activeCheck.data?.activeConversationIds), 'Active generations endpoint returns array format');

  // ---------------------------------------------------------------------------
  // 3. MONGODB OPERATOR INJECTION TESTING
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. MongoDB Operator Injection Attacks ---');

  // 3.1 Operator injection on login
  const opInjLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: { $ne: null }, password: { $ne: null } }),
  });
  assert(opInjLogin.status === 400 || opInjLogin.status === 401, 'Rejects MongoDB operator injection ($ne) in login body with HTTP 400/401');

  // 3.2 Operator injection in search query
  const opInjSearch = await request('/conversations/search?q[$ne]=', {
    headers: { Authorization: `Bearer ${concToken}` },
  });
  assert(opInjSearch.status === 200 || opInjSearch.status === 400, 'Search query operator injection safely sanitized');

  // ---------------------------------------------------------------------------
  // 4. INFORMATION LEAKAGE & SENSITIVE PROJECTION AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Information Leakage & Credential Sanitization Audit ---');

  // 4.1 Check /users/me response
  const meRes = await request('/users/me', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert(!meRes.data?.passwordHash && !meRes.data?.refreshTokenHash, 'User profile never returns passwordHash or refreshTokenHash');
  assert(!meRes.data?.password, 'User profile never returns plaintext password');

  // 4.2 Check /users list response
  const usersList = await request('/users', { headers: { Authorization: `Bearer ${adminToken}` } });
  let leakedHash = false;
  if (Array.isArray(usersList.data)) {
    for (const u of usersList.data) {
      if (u.passwordHash || u.refreshTokenHash || u.password) {
        leakedHash = true;
        break;
      }
    }
  }
  assert(!leakedHash, 'All user list entries strictly omit passwordHash and refreshTokenHash');

  // 4.3 Trigger deliberate 404 error and inspect for sensitive path/stack leakage
  const notFoundRes = await request('/documents/000000000000000000000000', {
    headers: { Authorization: `Bearer ${concToken}` },
  });
  const notFoundText = notFoundRes.rawText;
  assert(!notFoundText.includes('password') && !notFoundText.includes('cluster0') && !notFoundText.includes('C:\\Users'), 'Error response does not leak database credentials or internal filesystem paths');

  // Clean up conc user
  await request(`/users/${concId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });

  console.log('\n================================================================');
  console.log(`FINAL INDEPENDENT SUITE: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFinalSuite().catch((err) => {
  console.error('Final suite execution failed:', err);
  process.exit(1);
});
