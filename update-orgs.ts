import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const mappings: Record<string, string> = {
  "Bhubaneswar Development Authority": "Bhubaneswar Development Authority",
  "Bhubaneswar Smart City Limited": "Bhubaneswar Smart City Limited",
  "Capital Region Urban Transport": "Capital Region Urban Transport",
  "CCE,Anandapur Barrage Project": "Chief Construction Engineer",
  "CCE Brutang and Hadua Irrigation Project Dasapalla": "Chief Construction Engineer",
  "CCE Deo Irr Project Karanjia": "Chief Construction Engineer",
  "CCE Potteru Irr.Project,Balimela": "Chief Construction Engineer",
  "CCE Upper Indravati Irrigation Project Mukhiguda": "Chief Construction Engineer",
  "CE and BM Brahmani Basin Samal": "Chief Engineer and Basin Manager",
  "CE AND BM IK BASIN BARINIPUT JEYPORE": "Chief Engineer and Basin Manager",
  "CE-BM,B Right Basin,Dhenkanal": "Chief Engineer and Basin Manager",
  "CE-BM,BSB Basin,Laxmiposi": "Chief Engineer and Basin Manager",
  "CE-BM,LMB Basin,BBSR": "Chief Engineer and Basin Manager",
  "CE-BM,RVN Basin,Berhampur": "Chief Engineer and Basin Manager",
  "CE-BM, Tel Basin,Bhawanipatna": "Chief Engineer and Basin Manager",
  "CE,Drainage,Cuttack": "Chief Engineer",
  "CE Megalift Projects Bhubaneswar": "Chief Engineer",
  "CE,Minor Irrigation,BBSR": "Chief Engineer",
  "CE-NH": "Chief Engineer",
  "CE RW I": "Chief Engineer",
  "CE Survey and Investigation Odisha": "Chief Engineer",
  "Chief Engineer Mech - WR Bhubaneswar": "Chief Engineer",
  "Chief Engineer Quality Assurance Bhubaneswar": "Chief Engineer",
  "Commerce and Transport (Transport) Department": "Commerce and Transport Department",
  "Cuttack Development Authority": "Cuttack Development Authority",
  "DG Odisha Police Cuttack": "Director General of Police, Odisha",
  "Directorate of Agriculture and Food Production": "Directorate of Agriculture and Food Production",
  "Directorate of AYUSH": "Directorate of AYUSH",
  "Directorate of Soil Conservation and Watershed Development": "Directorate of Soil Conservation and Watershed Development",
  "Directorate of Technical Education and Training": "Directorate of Technical Education and Training",
  "EIC-CIVIL": "Engineer in Chief, Civil",
  "Forest Environment and Climate Change Department": "Forest, Environment and Climate Change Department",
  "Housing and Urban Development Department": "Housing and Urban Development Department",
  "IDCO": "Odisha Industrial Infrastructure Development Corporation",
  "Municipal Bodies": "Municipal Bodies",
  "National Projects Construction Corporation Limited NPCC": "National Projects Construction Corporation Limited",
  "Odisha Agro Industries Corporation Ltd.": "Odisha Agro Industries Corporation Limited",
  "Odisha Coal and Power Limited": "Odisha Coal and Power Limited",
  "ODISHA CONSTRUCTION CORPORATION LTD": "Odisha Construction Corporation Limited",
  "Odisha Fire And Emergency Service": "Odisha Fire and Emergency Service",
  "Odisha Hydro Power Corporation Ltd": "Odisha Hydro Power Corporation Limited",
  "Odisha Power Generation Corporation Limited": "Odisha Power Generation Corporation Limited",
  "Odisha Small Industries Corporation Ltd": "Odisha Small Industries Corporation Limited",
  "Odisha State Agricultural Marketing Board": "Odisha State Agricultural Marketing Board",
  "Odisha State Civil Supplies Corp. Ltd.": "Odisha State Civil Supplies Corporation Limited",
  "Odisha State Co. Milk Producers Federation Ltd.": "Odisha State Cooperative Milk Producers Federation Limited",
  "Odisha State Medical Corporation Ltd": "Odisha State Medical Corporation Limited",
  "Odisha Tourism Devl. Corp.": "Odisha Tourism Development Corporation",
  "Odisha University of Technology and Research": "Odisha University of Technology and Research",
  "OPEPA Bhubaneswar": "Odisha Primary Education Programme Authority",
  "Orissa Bridge and Construction Corporation Ltd": "Odisha Bridge and Construction Corporation Limited",
  "Orissa Mining Corporation": "Odisha Mining Corporation",
  "Orissa State Police Housing and Welfare Corporation Ltd": "Odisha State Police Housing and Welfare Corporation Limited",
  "Orissa State Road Transport Corporation": "Odisha State Road Transport Corporation",
  "Orissa Water Supply and Sewerage Board": "Odisha Water Supply and Sewerage Board",
  "Panchayati Raj and Drinking Water Department Odisha": "Panchayati Raj and Drinking Water Department, Odisha",
  "PHEO": "Public Health Engineering Organisation",
  "PURI KONARK DEVELOPMENT AUTHORITY": "Puri Konark Development Authority",
  "Rourkela Municipal Corporation": "Rourkela Municipal Corporation",
  "Rural Water Supply and Sanitation": "Rural Water Supply and Sanitation",
  "ST and SC Development Deptt": "ST and SC Development Department",
  "WATCO Bhubaneswar": "Water Corporation of Odisha"
};

async function run() {
  console.log('Stripping project names from', Object.keys(mappings).length, 'organisations...');
  let count = 0;
  for (const [rawName, normalizedName] of Object.entries(mappings)) {
    try {
      await prisma.organisationMapping.update({
        where: { rawName: rawName },
        data: {
          normalizedName: normalizedName,
          isMapped: true
        }
      });
      count++;
    } catch (e) {
      console.error('Error with', rawName, e);
    }
  }
  console.log('Successfully stripped project names from', count, 'organisations');
}

run();
