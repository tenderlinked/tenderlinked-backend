const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const stateDistricts = {
  'Maharashtra': ['ahmednagar', 'akola', 'amravati', 'aurangabad', 'beed', 'bhandara', 'buldhana', 'chandrapur', 'dhule', 'gadchiroli', 'gondia', 'hingoli', 'jalgaon', 'jalna', 'kolhapur', 'latur', 'mumbai', 'nagpur', 'nanded', 'nandurbar', 'nashik', 'osmanabad', 'palghar', 'parbhani', 'pune', 'raigad', 'ratnagiri', 'sangli', 'satara', 'sindhudurg', 'solapur', 'thane', 'wardha', 'washim', 'yavatmal'],
  'Uttar Pradesh': ['agra', 'aligarh', 'prayagraj', 'ambedkar-nagar', 'amethi', 'amroha', 'auraiya', 'ayodhya', 'azamgarh', 'baghpat', 'bahraich', 'ballia', 'balrampur', 'banda', 'barabanki', 'bareilly', 'basti', 'bijnor', 'budaun', 'bulandshahr', 'chandauli', 'chitrakoot', 'deoria', 'etah', 'etawah', 'farrukhabad', 'fatehpur', 'firozabad', 'gautam-buddha-nagar', 'ghaziabad', 'ghazipur', 'gonda', 'gorakhpur', 'hamirpur', 'hapur', 'hardoi', 'hathras', 'jalaun', 'jaunpur', 'jhansi', 'kannauj', 'kanpur', 'kasganj', 'kaushambi', 'kheri', 'kushinagar', 'lalitpur', 'lucknow', 'maharajganj', 'mahoba', 'mainpuri', 'mathura', 'mau', 'meerut', 'mirzapur', 'moradabad', 'muzaffarnagar', 'pilibhit', 'pratapgarh', 'raebareli', 'rampur', 'saharanpur', 'sambhal', 'sant-kabir-nagar', 'shahjahanpur', 'shamli', 'shravasti', 'siddharthnagar', 'sitapur', 'sonbhadra', 'sultanpur', 'unnao', 'varanasi'],
  'West Bengal': ['alipurduar', 'bankura', 'birbhum', 'cooch-behar', 'dakshin-dinajpur', 'darjeeling', 'hooghly', 'howrah', 'jalpaiguri', 'jhargram', 'kalimpong', 'kolkata', 'malda', 'murshidabad', 'nadia', 'north-24-parganas', 'paschim-bardhaman', 'paschim-medinipur', 'purba-bardhaman', 'purba-medinipur', 'purulia', 'south-24-parganas', 'uttar-dinajpur'],
  'Kerala': ['alappuzha', 'ernakulam', 'idukki', 'kannur', 'kasaragod', 'kollam', 'kottayam', 'kozhikode', 'malappuram', 'palakkad', 'pathanamthitta', 'thiruvananthapuram', 'thrissur', 'wayanad'],
  'Tamil Nadu': ['ariyalur', 'chengalpattu', 'chennai', 'coimbatore', 'cuddalore', 'dharmapuri', 'dindigul', 'erode', 'kallakurichi', 'kanchipuram', 'kanyakumari', 'karur', 'krishnagiri', 'madurai', 'nagapattinam', 'namakkal', 'nilgiris', 'perambalur', 'pudukkottai', 'ramanathapuram', 'ranipet', 'salem', 'sivaganga', 'tenkasi', 'thanjavur', 'theni', 'thoothukudi', 'tiruchirappalli', 'tirunelveli', 'tirupathur', 'tiruppur', 'tiruvallur', 'tiruvannamalai', 'tiruvarur', 'vellore', 'viluppuram', 'virudhunagar'],
  'Punjab': ['amritsar', 'barnala', 'bathinda', 'faridkot', 'fatehgarh-sahib', 'fazilka', 'ferozepur', 'gurdaspur', 'hoshiarpur', 'jalandhar', 'kapurthala', 'ludhiana', 'mansa', 'moga', 'muktsar', 'pathankot', 'patiala', 'rupngar', 'sangrur', 'mohali', 'sbs-nagar', 'tarn-taran'],
  'Haryana': ['ambala', 'bhiwani', 'charkhi-dadri', 'faridabad', 'fatehabad', 'gurugram', 'hisar', 'jhajjar', 'jind', 'kaithal', 'karnal', 'kurukshetra', 'mahendragarh', 'nuh', 'palwal', 'panchkula', 'panipat', 'rewari', 'rohtak', 'sirsa', 'sonipat', 'yamunanagar'],
  'Assam': ['baksa', 'barpeta', 'biswanath', 'bongaigaon', 'cachar', 'charaideo', 'chirang', 'darrang', 'dhemaji', 'dhubri', 'dibrugarh', 'dima-hasao', 'goalpara', 'golaghat', 'hailakandi', 'hojai', 'jorhat', 'kamrup', 'karbi-anglong', 'karimganj', 'kokrajhar', 'lakhimpur', 'majuli', 'morigaon', 'nagaon', 'nalbari', 'sivasagar', 'sonitpur', 'south-salmara', 'tinsukia', 'udalguri', 'west-karbi-anglong'],
  'Bihar': ['araria', 'arwal', 'aurangabad', 'banka', 'begusarai', 'bhagalpur', 'bhojpur', 'buxar', 'darbhanga', 'east-champaran', 'gaya', 'gopalganj', 'jamui', 'jehanabad', 'kaimur', 'katihar', 'khagaria', 'kishanganj', 'lakhisarai', 'madhepura', 'madhubani', 'munger', 'muzaffarpur', 'nalanda', 'nawada', 'patna', 'purnia', 'rohtas', 'saharsa', 'samastipur', 'saran', 'sheikhpura', 'sheohar', 'sitamarhi', 'siwan', 'supaul', 'vaishali', 'west-champaran'],
  'Jharkhand': ['bokaro', 'chatra', 'deoghar', 'dhanbad', 'dumka', 'east-singhbhum', 'garhwa', 'giridih', 'godda', 'gumla', 'hazaribagh', 'jamtara', 'khunti', 'koderma', 'latehar', 'lohardaga', 'pakur', 'palamu', 'ramgarh', 'ranchi', 'sahibganj', 'seraikela-kharsawan', 'simdega', 'west-singhbhum']
};

async function seedDistricts() {
  let count = 0;
  for (const [state, districts] of Object.entries(stateDistricts)) {
    for (const d of districts) {
      const url = `https://${d}.nic.in/en/tender`; // Standard NIC district url format
      const exists = await prisma.scraperTarget.findFirst({ where: { url } });
      if (!exists) {
        await prisma.scraperTarget.create({
          data: {
            name: d.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' District',
            type: 'DISTRICT',
            url: url,
            isActive: true,
            state: state
          }
        });
        count++;
      }
    }
  }
  console.log(`Added ${count} new districts across 10 states.`);
}

seedDistricts().finally(() => prisma.$disconnect());
