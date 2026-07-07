import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { QueueService } from './src/queue/queue.service';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const queueService = app.get(QueueService);
  console.log('Testing Queue Process...');
  const result = await queueService.processQueue();
  console.log('Result:', result);
  await app.close();
}

test();
