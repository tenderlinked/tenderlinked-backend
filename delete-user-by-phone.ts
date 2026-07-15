import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.error('Failed to parse .env file', e);
}

const prisma = new PrismaClient();

async function main() {
  const targetPhone = '8513945305';
  
  console.log(`Searching for UserProfile with phone number containing: ${targetPhone}...`);
  const profile = await prisma.userProfile.findFirst({
    where: { phoneNumber: { contains: targetPhone } }
  });
  
  if (!profile) {
    console.error(`No user profile found with phone containing ${targetPhone}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  
  const { userId, email, phoneNumber } = profile;
  console.log(`Found User Profile:`);
  console.log(`  ID: ${profile.id}`);
  console.log(`  Keycloak User ID: ${userId}`);
  console.log(`  Email: ${email}`);
  console.log(`  Phone: ${phoneNumber}`);
  
  // 1. Authenticate with Keycloak Admin API
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('KEYCLOAK_CLIENT_ID or KEYCLOAK_CLIENT_SECRET is missing from .env');
    await prisma.$disconnect();
    process.exit(1);
  }
  
  console.log('Fetching Keycloak Admin Token...');
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });
  
  try {
    const tokenRes = await fetch('https://auth.enfycon.com/realms/enfycon-tender/protocol/openid-connect/token', {
      method: 'POST',
      body: tokenParams,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    
    if (!tokenRes.ok) {
      throw new Error(`Failed to get Keycloak token: ${tokenRes.statusText}`);
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      throw new Error('Keycloak access token was empty');
    }
    
    console.log(`Deleting user ${userId} from Keycloak...`);
    const deleteRes = await fetch(`https://auth.enfycon.com/admin/realms/enfycon-tender/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (deleteRes.ok || deleteRes.status === 404) {
      console.log('Successfully deleted user from Keycloak (or user did not exist in Keycloak)');
    } else {
      const errorText = await deleteRes.text();
      console.error(`Failed to delete user from Keycloak: ${errorText}`);
    }
  } catch (error: any) {
    console.error('Error interacting with Keycloak:', error.message);
  }
  
  console.log('Proceeding with database cleanup...');
  
  // 2. Delete from DB
  // Delete TenantMember first
  const deletedMembers = await prisma.tenantMember.deleteMany({
    where: { userId }
  });
  console.log(`Deleted ${deletedMembers.count} TenantMember record(s).`);
  
  // Delete UserProfile
  await prisma.userProfile.delete({
    where: { userId }
  });
  console.log('Deleted UserProfile record.');
  
  console.log('Cleanup completed successfully.');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
