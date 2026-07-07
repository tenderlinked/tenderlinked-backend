import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { QueueService } from './src/queue/queue.service';

async function bootstrap() {
  console.log("Initializing Nest App to run Queue manually...");
  const app = await NestFactory.createApplicationContext(AppModule);
  const queueService = app.get(QueueService);
  
  console.log("Starting Queue processing...");
  const result = await queueService.processQueue();
  console.log("Queue Results:", result);
  
  await app.close();
}
bootstrap();
