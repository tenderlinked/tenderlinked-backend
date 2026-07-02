import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ForbiddenException('Missing or invalid Authorization header. A valid Keycloak token is required.');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Decode the JWT payload (the middle part of the token) without needing external libraries
      const payloadBase64 = token.split('.')[1];
      
      // Keycloak tokens are base64url encoded
      const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));

      // Keycloak puts realm roles inside the `realm_access.roles` array
      const roles = decodedPayload?.realm_access?.roles || [];

      // Accept both uppercase and lowercase variations just to be safe
      if (!roles.includes('SUPER_ADMIN') && !roles.includes('super_admin')) {
        throw new ForbiddenException('Access Denied: You do not have the SUPER_ADMIN role assigned in Keycloak.');
      }

      return true;
    } catch (e) {
      throw new ForbiddenException('Invalid token format or failed to decode Keycloak token.');
    }
  }
}
