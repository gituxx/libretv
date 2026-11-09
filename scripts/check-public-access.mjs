// Exercise the built Worker without cookies before and after deployment.
// Checking only that the bundle compiles misses Worker startup failures.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const origin = (process.argv[2] || 'https://libretv.oinnn.top').replace(/\/$/, '');

async function request(path, init) {
  return fetch(origin + path, { ...init, signal: AbortSignal.timeout(5000), cache: 'no-store' });
}

let status;
let lastError;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await request('/api/status');
    assert.equal(response.status, 200, 'Status endpoint must be available');
    status = await response.json();
    break;
  } catch (error) {
    lastError = error;
    await delay(2000);
  }
}
if (!status) throw lastError;
assert.equal(status.passwordRequired, false, 'Public deployment must not require a password');
assert.equal(status.verified, true, 'Visitors must be verified without a cookie');

for (const path of ['/', '/watch']) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must render`);
  await response.arrayBuffer();
}
const auth = await request('/api/auth');
assert.equal(auth.status, 200);
assert.equal((await auth.json()).verified, true);
const login = await request('/api/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(login.status, 200, 'Anonymous access must not need a password');
assert.equal((await login.json()).success, true);
const detail = await request('/api/detail');
assert.equal(detail.status, 400, 'Detail validation must run without an authentication barrier');
console.log(JSON.stringify({ origin, publicAccess: true, pages: ['/', '/watch'] }));
