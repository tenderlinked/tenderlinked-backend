import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('http://localhost:3001/api/subscriptions/2e76adb8-b503-4d1c-9392-99dc0d809e7a/active', {
      headers: {
        'x-internal-secret': 'fallback-internal-secret-xyz'
      }
    });
    console.log(res.data);
  } catch (e: any) {
    console.error(e.response?.status, e.response?.data);
  }
}
main();
