import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parsing
  app.use(cookieParser());

  // Enable CORS for the frontend
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global /api prefix to match existing frontend call paths
  app.setGlobalPrefix('api');

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Tender Scrapper API')
    .setDescription('The Tender Scrapper Backend API documentation')
    .setVersion('1.0')
    .addTag('Auth', 'Authentication and token endpoints')
    .addBearerAuth()
    .addOAuth2({
      type: 'oauth2',
      flows: {
        password: {
          tokenUrl: 'https://auth.enfycon.com/realms/enfycon-tender/protocol/openid-connect/token',
          scopes: {},
        },
      },
    })
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'cron-secret',
    )
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      initOAuth: {
        clientId: 'enfycon-tender',
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'QPumFFxu83otPHheKgsYzc3YouvBGkpU',
      }
    }
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`[NestJS] Backend running on http://localhost:${port}/api`);
  console.log(`[Swagger] Documentation available on http://localhost:${port}/`);
}

bootstrap();
