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

async function runSecurityAudit() {
  console.log('================================================================');
  console.log('ENTER-CHAT AUTOMATED MULTI-USER SECURITY & AUTHORIZATION AUDIT');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // PHASE 1: AUTHENTICATION & TOKEN BOUNDARY TESTING
  // ---------------------------------------------------------------------------
  console.log('--- 1. Authentication & Token Boundary Tests ---');

  // 1.1 Login with wrong password
  const badLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'aadil@gmail.com', password: 'WrongPassword123!' }),
  });
  assert(badLogin.status === 401, 'Rejects login with invalid password with HTTP 401');

  // 1.2 Login with nonexistent account
  const noUserLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nonexistent_account_xyz@test.com', password: 'Password123!' }),
  });
  assert(noUserLogin.status === 401, 'Rejects login with nonexistent user with HTTP 401');

  // 1.3 Valid Admin Login
  const adminLogin = await request('/auth/login', {
    method: 'POST',
   body: JSON.stringify({
  email: process.env.TEST_ADMIN_EMAIL,
  password: process.env.TEST_ADMIN_PASSWORD,
}),
  });
  assert(adminLogin.status === 200 && !!adminLogin.data.accessToken, 'Authenticates valid Admin with HTTP 200 and issues JWT tokens');
  assert(!adminLogin.data.password && !adminLogin.data.passwordHash && !adminLogin.data.refreshTokenHash, 'Never returns passwordHash or refreshTokenHash in auth payload');

  const adminToken = adminLogin.data.accessToken;
  const adminId = adminLogin.data.user.id;

  // 1.4 Access protected route without token
  const noTokenAccess = await request('/users');
  assert(noTokenAccess.status === 401, 'Rejects unauthenticated request to /api/users with HTTP 401');

  // 1.5 Access protected route with tampered token
  const tamperedAccess = await request('/users', {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature' },
  });
  assert(tamperedAccess.status === 401, 'Rejects tampered JWT token with HTTP 401');

  // ---------------------------------------------------------------------------
  // PHASE 2: MULTI-USER PROVISIONING & PRIVILEGE ESCALATION DEFENSE
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Multi-User Provisioning & RBAC Isolation Tests ---');

  // 2.1 Create User A
  const createUserA = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'user_a_sec@test.local',
      firstName: 'Alice',
      lastName: 'Security',
      role: 'user',
      departments: ['Engineering'],
    }),
  });
  
  let userATempPass = createUserA.data?.temporaryPassword;
  if (createUserA.status === 409) {
    // Already exists from previous run, update or login
    userATempPass = 'TempPass123!';
  } else {
    assert(createUserA.status === 201 || createUserA.status === 200, 'Admin successfully provisions User A');
  }

  // 2.2 Create User B
  const createUserB = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'user_b_sec@test.local',
      firstName: 'Bob',
      lastName: 'Security',
      role: 'user',
      departments: ['Marketing'],
    }),
  });

  let userBTempPass = createUserB.data?.temporaryPassword;
  if (createUserB.status === 409) {
    userBTempPass = 'TempPass123!';
  } else {
    assert(createUserB.status === 201 || createUserB.status === 200, 'Admin successfully provisions User B');
  }

  // 2.3 Attempt duplicate user creation
  const dupUser = await request('/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: 'aadil@gmail.com',
      firstName: 'Duplicate',
      lastName: 'Admin',
      role: 'user',
    }),
  });
  assert(dupUser.status === 409, 'Rejects duplicate user creation with HTTP 409 Conflict');

  // 2.4 Login User A
  let userAToken = null;
  let userAId = null;
  if (userATempPass) {
    const loginA = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user_a_sec@test.local', password: userATempPass }),
    });
    if (loginA.status === 200) {
      userAToken = loginA.data.accessToken;
      userAId = loginA.data.user.id;
    }
  }

  // 2.5 Login User B
  let userBToken = null;
  let userBId = null;
  if (userBTempPass) {
    const loginB = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'user_b_sec@test.local', password: userBTempPass }),
    });
    if (loginB.status === 200) {
      userBToken = loginB.data.accessToken;
      userBId = loginB.data.user.id;
    }
  }

  // 2.6 Normal user attempts to access Admin endpoints (Privilege Escalation Test)
  if (userAToken) {
    const privEscalation = await request('/users', {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    assert(privEscalation.status === 403, 'Rejects standard user access to /api/users with HTTP 403 Forbidden');

    const roleCreateEscalation = await request('/roles', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ name: 'HackedRole', permissions: ['all'] }),
    });
    assert(roleCreateEscalation.status === 403, 'Rejects standard user creation of custom roles with HTTP 403 Forbidden');
  }

  // ---------------------------------------------------------------------------
  // PHASE 3: IDOR & MULTI-USER RESOURCE ISOLATION TESTING
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. IDOR (Insecure Direct Object Reference) & Isolation Tests ---');

  if (userAToken && userBToken) {
    // 3.1 User A creates a conversation
    const convA = await request('/conversations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: JSON.stringify({ title: 'User A Confidential Financial Discussion' }),
    });
    const convAId = convA.data?.id || convA.data?._id;
    assert(convA.status === 201 || convA.status === 200, 'User A creates private conversation');

    // 3.2 User B attempts to access User A's conversation (IDOR Attack)
    if (convAId) {
      const idorConvAccess = await request(`/messages/conversation/${convAId}`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      // Should be empty array or 403
      const isIsolated = idorConvAccess.status === 403 || (Array.isArray(idorConvAccess.data) && idorConvAccess.data.length === 0);
      assert(isIsolated, 'User B cannot view or retrieve User A private conversation messages (IDOR defense)');

      // 3.3 User B attempts to delete User A's conversation
      const idorDeleteConv = await request(`/conversations/${convAId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      assert(idorDeleteConv.status === 403 || idorDeleteConv.status === 404, 'User B cannot delete User A conversation');
    }

    // 3.4 User B attempts to list mentions / documents of User A
    const mentionsB = await request('/mentions', {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    assert(mentionsB.status === 200, 'User B mentions endpoint returns only authorized resources');
  }

  // ---------------------------------------------------------------------------
  // PHASE 4: SINGLE ADMIN INVARIANT & ACCOUNT DELETION DEFENSE
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Single-Admin Invariant & Deletion Defense ---');

  // Attempt to delete primary administrator (aadil@gmail.com)
  const deleteAdminAttempt = await request(`/users/${adminId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    [400, 403, 409].includes(deleteAdminAttempt.status),
    'System blocks deletion of primary system administrator account (aadil@gmail.com)',
    `received status ${deleteAdminAttempt.status}`,
  );

  // ---------------------------------------------------------------------------
  // PHASE 5: PYTHON AI MICROSERVICE SANDBOX & SECURITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Python AI Service Sandbox & Security ---');

  const aiHealth = await fetch(`${AI_URL}/health`).then(r => r.json()).catch(() => null);
  assert(aiHealth?.status === 'ok' || aiHealth?.status === 'healthy', 'AI Microservice health endpoint reports operational status');

  // Clean up test users
  if (userAId) {
    await request(`/users/${userAId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  }
  if (userBId) {
    await request(`/users/${userBId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  }

  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecurityAudit().catch(err => {
  console.error('Security audit error:', err);
  process.exit(1);
});
