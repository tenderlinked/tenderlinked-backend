import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const orgs = [
  "Bhubaneswar Development Authority",
  "Bhubaneswar Smart City Limited",
  "Capital Region Urban Transport",
  "CCE,Anandapur Barrage Project",
  "CCE Brutang and Hadua Irrigation Project Dasapalla",
  "CCE Deo Irr Project Karanjia",
  "CCE Potteru Irr.Project,Balimela",
  "CCE Upper Indravati Irrigation Project Mukhiguda",
  "CE and BM Brahmani Basin Samal",
  "CE AND BM IK BASIN BARINIPUT JEYPORE",
  "CE-BM,B Right Basin,Dhenkanal",
  "CE-BM,BSB Basin,Laxmiposi",
  "CE-BM,LMB Basin,BBSR",
  "CE-BM,RVN Basin,Berhampur",
  "CE-BM, Tel Basin,Bhawanipatna",
  "CE,Drainage,Cuttack",
  "CE Megalift Projects Bhubaneswar",
  "CE,Minor Irrigation,BBSR",
  "CE-NH",
  "CE RW I",
  "CE Survey and Investigation Odisha",
  "Chief Engineer Mech - WR Bhubaneswar",
  "Chief Engineer Quality Assurance Bhubaneswar",
  "Commerce and Transport (Transport) Department",
  "Cuttack Development Authority",
  "DG Odisha Police Cuttack",
  "Directorate of Agriculture and Food Production",
  "Directorate of AYUSH",
  "Directorate of Soil Conservation and Watershed Development",
  "Directorate of Technical Education and Training",
  "EIC-CIVIL",
  "Forest Environment and Climate Change Department",
  "Housing and Urban Development Department",
  "IDCO",
  "Municipal Bodies",
  "National Projects Construction Corporation Limited NPCC",
  "Odisha Agro Industries Corporation Ltd.",
  "Odisha Coal and Power Limited",
  "ODISHA CONSTRUCTION CORPORATION LTD",
  "Odisha Fire And Emergency Service",
  "Odisha Hydro Power Corporation Ltd",
  "Odisha Power Generation Corporation Limited",
  "Odisha Small Industries Corporation Ltd",
  "Odisha State Agricultural Marketing Board",
  "Odisha State Civil Supplies Corp. Ltd.",
  "Odisha State Co. Milk Producers Federation Ltd.",
  "Odisha State Medical Corporation Ltd",
  "Odisha Tourism Devl. Corp.",
  "Odisha University of Technology and Research",
  "OPEPA Bhubaneswar",
  "Orissa Bridge and Construction Corporation Ltd",
  "Orissa Mining Corporation",
  "Orissa State Police Housing and Welfare Corporation Ltd",
  "Orissa State Road Transport Corporation",
  "Orissa Water Supply and Sewerage Board",
  "Panchayati Raj and Drinking Water Department Odisha",
  "PHEO",
  "PURI KONARK DEVELOPMENT AUTHORITY",
  "Rourkela Municipal Corporation",
  "Rural Water Supply and Sanitation",
  "ST and SC Development Deptt",
  "WATCO Bhubaneswar"
];

async function run() {
  console.log('Preloading', orgs.length, 'organisations...');
  let count = 0;
  for (const org of orgs) {
    try {
      await prisma.organisationMapping.upsert({
        where: { rawName: org },
        update: {},
        create: {
          rawName: org,
          state: 'Odisha',
          isMapped: false
        }
      });
      count++;
    } catch (e) {
      console.error('Error with', org, e);
    }
  }
  console.log('Successfully preloaded', count, 'organisations');
}

run();
