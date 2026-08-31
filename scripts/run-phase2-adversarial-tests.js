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
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

// Helper to forge / tamper JWT payloads
function createForgedJwt(headerObj, payloadObj, secret) {
  const h = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

async function runAdversarialAudit() {
  console.log('================================================================');
  console.log('ENTER-CHAT ADVERSARIAL PHASE 2 SECURITY & VULNERABILITY AUDIT');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. ADVERSARIAL AUTHENTICATION & JWT ATTACKS
  // ---------------------------------------------------------------------------
  console.log('--- 1. Adversarial Authentication & JWT Attacks ---');

  // 1.1 Valid Admin Login
  const adminLogin = await request('/auth/login', {
    method: 'POST',
   body: JSON.stringify({
    email: process.env.TEST_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD,
  }),
  });
  assert(adminLogin.status === 200 && !!adminLogin.data.accessToken, 'Admin logs in and receives valid JWT');
  const adminToken = adminLogin.data.accessToken;

  // 1.2 Forged JWT with modified 'role: admin' signed with wrong secret
  const forgedRoleJwt = createForgedJwt(
    { alg: 'HS256', typ: 'JWT' },
    { sub: '507f1f77bcf86cd799439011', email: 'attacker@evil.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
    'wrong_attacker_secret_key_666'
  );
  const forgedRoleReq = await request('/users', {
    headers: { Authorization: `Bearer ${forgedRoleJwt}` },
  });
  assert(forgedRoleReq.status === 401, 'Rejects forged JWT with role: admin signed with invalid secret (HTTP 401)');

  // 1.3 Forged JWT with algorithm: none
  const noneAlgJwt = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({ sub: '507f1f77bcf86cd799439011', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.';
  const noneAlgReq = await request('/users', {
    headers: { Authorization: `Bearer ${noneAlgJwt}` },
  });
  assert(noneAlgReq.status === 401, 'Rejects "alg: none" JWT signature bypass attack (HTTP 401)');

  // 1.4 Expired JWT
  const expiredJwt = createForgedJwt(
    { alg: 'HS256', typ: 'JWT' },
    { sub: '507f1f77bcf86cd799439011', role: 'admin', exp: Math.floor(Date.now() / 1000) - 3600 },
    'your_super_secret_jwt_access_key_123456789!'
  );
  const expiredReq = await request('/users', {
    headers: { Authorization: `Bearer ${expiredJwt}` },
  });
  assert(expiredReq.status === 401, 'Rejects expired JWT token (HTTP 401)');

  // 1.5 Malformed Authorization Header (No Bearer prefix, junk string)
  const junkAuthReq = await request('/users', {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  assert(junkAuthReq.status === 401, 'Rejects non-Bearer Authorization schemes (HTTP 401)');

  // ---------------------------------------------------------------------------
  // 2. MASS ASSIGNMENT & PRIVILEGE ESCALATION ATTACKS
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Mass Assignment & Privilege Escalation Attacks ---');

  // Create standard test user Alice
  const createAlice = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'alice_phase2@test.local',
      firstName: 'Alice',
      lastName: 'Standard',
      role: 'user',
      departments: ['Support'],
    }),
  });
  const aliceTempPass = createAlice.data?.temporaryPassword || 'TempPass123!';
  const aliceLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alice_phase2@test.local', password: aliceTempPass }),
  });
  assert(aliceLogin.status === 200, 'Standard user Alice successfully authenticated');
  const aliceToken = aliceLogin.data.accessToken;
  const aliceId = aliceLogin.data.user.id;

  // Alice attempts Mass Assignment Privilege Escalation via PATCH /api/users/me
  const massAssignAttempt = await request('/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      firstName: 'AliceUpdated',
      role: 'admin',
      departments: ['Executive', 'Security'],
      status: 'active',
      allowedFolders: ['*'],
    }),
  });
  assert(massAssignAttempt.status === 200, 'PATCH /users/me completes profile update');
  
  // Verify Alice role and departments did NOT change to admin
  const aliceProfile = await request('/users/me', {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  assert(aliceProfile.data.role === 'user', 'Mass assignment defense: Alice role remains "user"');
  assert(aliceProfile.data.departments.length === 1 && aliceProfile.data.departments[0] === 'Support', 'Mass assignment defense: Alice departments remain unchanged');
  assert(aliceProfile.data.firstName === 'AliceUpdated', 'Legitimate profile attribute firstName was successfully updated');

  // ---------------------------------------------------------------------------
  // 3. IDOR / BOLA & RESOURCE ISOLATION ATTACKS
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. IDOR & Resource Isolation Attacks ---');

  // Create standard test user Bob in 'Finance'
  const createBob = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'bob_phase2@test.local',
      firstName: 'Bob',
      lastName: 'Finance',
      role: 'user',
      departments: ['Finance'],
    }),
  });
  const bobTempPass = createBob.data?.temporaryPassword || 'TempPass123!';
  const bobLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'bob_phase2@test.local', password: bobTempPass }),
  });
  const bobToken = bobLogin.data.accessToken;
  const bobId = bobLogin.data.user.id;

  // Alice creates a private conversation
  const aliceConv = await request('/conversations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({ title: 'Alice Confidential Salary Discussion' }),
  });
  const aliceConvId = aliceConv.data?.id || aliceConv.data?._id;

  // Alice sends a private message
  const aliceMsg = await request('/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({ conversationId: aliceConvId, content: 'My confidential salary is $150,000.' }),
  });
  assert(aliceMsg.status === 201 || aliceMsg.status === 200, 'Alice creates private message');

  // Bob attempts IDOR read of Alice conversation
  const bobIdorConv = await request(`/conversations/${aliceConvId}`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert(bobIdorConv.status === 404 || bobIdorConv.status === 403, 'Bob cannot access Alice conversation (HTTP 404/403 IDOR blocked)');

  // Bob attempts IDOR read of Alice messages
  const bobIdorMsgs = await request(`/messages/conversation/${aliceConvId}`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert(bobIdorMsgs.status === 403 || bobIdorMsgs.status === 404, 'Bob cannot access Alice conversation messages (IDOR blocked)');

  // Bob attempts IDOR delete of Alice conversation
  const bobIdorDel = await request(`/conversations/${aliceConvId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  assert(bobIdorDel.status === 404 || bobIdorDel.status === 403, 'Bob cannot delete Alice conversation (IDOR blocked)');

  // ---------------------------------------------------------------------------
  // 4. REFRESH TOKEN ROTATION & REVOCATION ATTACKS
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Refresh Token Rotation & Session Revocation Attacks ---');

  const initialRefreshToken = aliceLogin.data.refreshToken;
  
  // Alice rotates refresh token
  const refresh1 = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  assert(refresh1.status === 200 && !!refresh1.data.refreshToken, 'Alice successfully rotates refresh token');
  const rotatedToken = refresh1.data.refreshToken;

  // Alice attempts to REUSE previous refresh token (Replay Attack)
  const reuseAttempt = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: initialRefreshToken }),
  });
  assert(reuseAttempt.status === 401, 'Replay Attack defense: Rejects already-rotated refresh token (HTTP 401)');

  // Alice logs out
  const logoutReq = await request('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  assert(logoutReq.status === 200 || logoutReq.status === 204, 'Alice logs out successfully');

  // Alice attempts to use refresh token after logout
  const postLogoutRefresh = await request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: rotatedToken }),
  });
  assert(postLogoutRefresh.status === 401, 'Rejects refresh token after user logout (HTTP 401)');

  // ---------------------------------------------------------------------------
  // 5. PYTHON AI SERVICE AST SANDBOX IN-DEPTH PENETRATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Python AI Service AST Sandbox In-Depth Penetration ---');

  const aiHealth = await fetch(`${AI_URL}/health`).then(r => r.json()).catch(() => null);
  assert(aiHealth?.status === 'ok' || aiHealth?.status === 'healthy', 'AI Microservice operational');

  // Clean up test users
  await request(`/users/${aliceId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  await request(`/users/${bobId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });

  console.log('\n================================================================');
  console.log(`PHASE 2 RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialAudit().catch((err) => {
  console.error('Adversarial test failure:', err);
  process.exit(1);
});
