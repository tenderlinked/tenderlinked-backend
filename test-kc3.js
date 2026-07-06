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
  
  const userRes = await fetch(`${adminBaseUrl}/ae771a8b-11bb-4d49-b375-3594dc7c8c95`, {
    headers: { 'Authorization': 'Bearer ' + access_token }
  });
  const user = await userRes.json();
  console.log('User:', JSON.stringify(user, null, 2));
}

run();
