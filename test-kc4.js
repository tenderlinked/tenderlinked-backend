const tokenUrl = 'https://auth.enfycon.com/realms/enfycon-tender/protocol/openid-connect/token';
const adminBaseUrl = 'https://auth.enfycon.com/admin/realms/enfycon-tender/users';

async function run() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: 'enfycon-tender',
    client_secret: 'QPumFFxu83otPHheKgsYzc3YouvBGkpU'
  });
  
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const { access_token } = await tokenRes.json();
  
  const tempEmail = 'test_kc_3_' + Date.now() + '@example.com';
  const tempPassword = 'Password123!';
  
  const createRes = await fetch(adminBaseUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: tempEmail,
      email: tempEmail,
      firstName: 'Test',
      lastName: 'User',
      enabled: true,
      emailVerified: true,
      credentials: [{
        type: 'password',
        value: tempPassword,
        temporary: false
      }]
    })
  });
  
  console.log('Create status:', createRes.status);
  
  // Test login
  const loginParams = new URLSearchParams({
    grant_type: 'password',
    client_id: 'enfycon-tender',
    client_secret: 'QPumFFxu83otPHheKgsYzc3YouvBGkpU',
    username: tempEmail,
    password: tempPassword,
    scope: 'openid profile email'
  });
  const loginRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginParams.toString()
  });
  
  console.log('Login status:', loginRes.status);
  console.log('Login body:', await loginRes.text());
}

run();
