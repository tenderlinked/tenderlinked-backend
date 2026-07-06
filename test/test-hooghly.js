const axios = require('axios');
const { parseTenderPage } = require('./dist/scraper/parser');
axios.get('https://hooghly.nic.in/notice_category/tenders/', {
  httpsAgent: new (require('https').Agent)({rejectUnauthorized: false})
}).then(res => {
  const result = parseTenderPage(res.data, 'Hooghly', 'https://hooghly.nic.in/notice_category/tenders/');
  console.log(JSON.stringify(result, null, 2));
}).catch(console.error);
