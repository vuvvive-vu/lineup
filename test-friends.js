// Friends API test — run: node test-friends.js
const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS', name); }
  else { failed++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function api(path, method, body, token) {
  const r = await fetch(BASE + path, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { code: r.status, json: await r.json().catch(() => ({})) };
}

async function register(name) {
  const email = name + '@test.local';
  const reg = await api('/api/auth/register-email', 'POST', { displayName: name, username: name, email, password: 'test1234' });
  if (!reg.json.token) throw new Error('register failed: ' + JSON.stringify(reg.json));
  // get code from server log is hard here; memory mode sets verifyCode — but no endpoint. Instead: login-email also works pre-verify? Try verify via /api/auth/verify-code needs code.
  // In memory mode register returns token immediately; emailVerified=false. Many /api require just parseToken.
  return reg.json.token;
}

(async () => {
  const A = await register('fruser_a');
  const B = await register('fruser_b');
  check('both registered', !!A && !!B);

  // 1. search
  let r = await api('/api/search/users?q=fruser', null, null, A);
  check('search finds B (prefix)', r.json.users && r.json.users.some(u => u.username === 'fruser_b'), r.json);
  r = await api('/api/search/users?q=@fruser_b', null, null, A);
  check('search with @ works', r.json.users && r.json.users.length === 1 && r.json.users[0].username === 'fruser_b', r.json);
  r = await api('/api/search/users?q=fruser_a', null, null, A);
  check('search excludes self', (r.json.users || []).length === 0, r.json);
  r = await api('/api/search/users?q=ab', null, null, A);
  check('short query returns empty', (r.json.users || []).length === 0, r.json);
  r = await api('/api/search/users?q=fruser_b');
  check('search unauthorized rejected', r.code === 401, r.code);

  // 2. relationship before anything
  r = await api('/api/relationship/fruser_b', null, null, A);
  check('relationship none initially', r.json.status === 'none', r.json);

  // 3. self-request rejected
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_a' }, A);
  check('self request rejected', r.code === 400, r.json);

  // 4. A sends to B
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  check('request sent', r.json.status === 'pending_sent', r.json);
  const reqId = r.json.requestId;

  // 5. duplicate pending rejected
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  check('duplicate pending rejected', r.code === 400, r.json);

  // 6. relationship pending_sent
  r = await api('/api/relationship/fruser_b', null, null, A);
  check('A sees pending_sent', r.json.status === 'pending_sent' && r.json.requestId === reqId, r.json);
  r = await api('/api/relationship/fruser_a', null, null, B);
  check('B sees pending_received', r.json.status === 'pending_received' && r.json.requestId === reqId, r.json);

  // 7. B cannot cancel A's request
  r = await api('/api/friend-requests/' + reqId + '/cancel', 'POST', null, B);
  check('B cannot cancel A request', r.code === 403, r.json);

  // 8. incoming/outgoing lists
  r = await api('/api/friend-requests/incoming', null, null, B);
  check('B incoming has 1', r.json.requests.length === 1 && r.json.requests[0].user.username === 'fruser_a', r.json);
  r = await api('/api/friend-requests/outgoing', null, null, A);
  check('A outgoing has 1', r.json.requests.length === 1, r.json);

  // 9. A cannot accept own request
  r = await api('/api/friend-requests/' + reqId + '/accept', 'POST', null, A);
  check('A cannot accept own request', r.code === 403, r.json);

  // 10. B accepts
  r = await api('/api/friend-requests/' + reqId + '/accept', 'POST', null, B);
  check('B accepts', r.json.status === 'accepted', r.json);

  // 11. friends lists both sides
  r = await api('/api/friends', null, null, A);
  check('A friends has B', r.json.friends.some(u => u.username === 'fruser_b'), r.json);
  r = await api('/api/friends', null, null, B);
  check('B friends has A', r.json.friends.some(u => u.username === 'fruser_a'), r.json);

  // 12. relationship accepted; new request rejected
  r = await api('/api/relationship/fruser_b', null, null, A);
  check('relationship accepted', r.json.status === 'accepted', r.json);
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  check('request when already friends rejected', r.code === 400, r.json);

  // 13. summary counts
  r = await api('/api/friends/summary', null, null, B);
  check('B summary friends=1 incoming=0', r.json.friends === 1 && r.json.incoming === 0, r.json);

  // 14. unfriend
  r = await api('/api/friends/remove', 'POST', { username: 'fruser_b' }, A);
  check('A removes B', r.json.status === 'removed', r.json);
  r = await api('/api/friends', null, null, B);
  check('B friends empty after remove', r.json.friends.length === 0, r.json);

  // 15. cancel flow: A sends, A cancels
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  check('re-send after remove ok', r.json.status === 'pending_sent', r.json);
  const id2 = r.json.requestId;
  r = await api('/api/friend-requests/' + id2 + '/cancel', 'POST', null, A);
  check('A cancels', r.json.status === 'cancelled', r.json);
  r = await api('/api/relationship/fruser_b', null, null, A);
  check('relationship none after cancel', r.json.status === 'none', r.json);

  // 16. reject flow: A sends, B rejects, A re-sends (creates new pending)
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  const id3 = r.json.requestId;
  r = await api('/api/friend-requests/' + id3 + '/reject', 'POST', null, B);
  check('B rejects', r.json.status === 'rejected', r.json);
  r = await api('/api/friend-requests/incoming', null, null, B);
  check('rejected not in incoming', r.json.requests.length === 0, r.json);
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' }, A);
  check('re-send after reject ok', r.json.status === 'pending_sent', r.json);
  const id4 = r.json.requestId;
  check('new request id differs', id4 !== id3);

  // 17. counter-request auto-accepts: B sends to A while A's pending exists -> auto accept
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_a' }, B);
  check('counter request auto-accepts', r.json.status === 'accepted' && r.json.autoAccepted === true, r.json);
  r = await api('/api/friends', null, null, A);
  check('A friends B after counter', r.json.friends.some(u => u.username === 'fruser_b'), r.json);

  // 18. non-existent user
  r = await api('/api/friend-requests', 'POST', { username: 'no_such_user' }, A);
  check('nonexistent target 404', r.code === 404, r.json);
  r = await api('/api/relationship/no_such_user', null, null, A);
  check('nonexistent relationship 404', r.code === 404, r.json);

  // 19. unauthorized actions
  r = await api('/api/friend-requests', 'POST', { username: 'fruser_b' });
  check('unauthorized send rejected', r.code === 401, r.code);
  r = await api('/api/friends');
  check('unauthorized friends list rejected', r.code === 401, r.code);

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
