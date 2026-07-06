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
  
  const userRes = await fetch(`${adminBaseUrl}?username=mymail.sahadeb@gmail.com`, {
    headers: { 'Authorization': 'Bearer ' + access_token }
  });
  const users = await userRes.json();
  console.log('User:', JSON.stringify(users, null, 2));
}

run();
