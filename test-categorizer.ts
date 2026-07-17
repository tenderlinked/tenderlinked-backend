import { categorizeTender } from './src/common/utils/tender-categorizer.util';
const title = 'WBPWD/AE/NRSH/NIT-06/2026-27 1';
const description = 'NRS Medical College AND Hospital Nurses Hostel compound Cleaning of compound premises at by removing garbage AND rubbish materials during the FY 2026 27';

const result = categorizeTender(title, description);
console.log(result);
