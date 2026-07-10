import { Injectable, Logger } from '@nestjs/common';
import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  GetObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || 'tenderlinked-docs';
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    });
  }

  get client(): S3Client {
    return this.s3Client;
  }

  get bucketName(): string {
    return this.bucket;
  }

  /**
   * Upload a local file to S3 and then optionally delete it locally.
   */
  async uploadFile(localFilePath: string, s3Key: string, deleteAfterUpload = false): Promise<string> {
    const fileStream = fs.createReadStream(localFilePath);
    
    // Determine content type based on extension
    let contentType = 'application/octet-stream';
    if (localFilePath.endsWith('.pdf')) contentType = 'application/pdf';
    else if (localFilePath.endsWith('.zip')) contentType = 'application/zip';
    else if (localFilePath.endsWith('.xls') || localFilePath.endsWith('.xlsx')) contentType = 'application/vnd.ms-excel';

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Uploaded to S3: s3://${this.bucket}/${s3Key}`);
      
      if (deleteAfterUpload) {
        fs.unlinkSync(localFilePath);
      }
      
      return s3Key;
    } catch (error) {
      this.logger.error(`Failed to upload ${localFilePath} to S3:`, error);
      throw error;
    }
  }

  /**
   * Generate a Presigned URL for an S3 Object (valid for 1 hour by default)
   */
  async getPresignedUrl(s3Key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * List objects with a specific prefix
   */
  async listObjects(prefix: string): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    try {
      const response = await this.s3Client.send(command);
      if (!response.Contents) return [];
      
      return response.Contents
        .map(obj => obj.Key as string)
        .filter(key => Boolean(key));
    } catch (error) {
      this.logger.error(`Failed to list objects in S3 with prefix ${prefix}:`, error);
      return [];
    }
  }

  /**
   * Get an object stream from S3
   */
  async getObjectStream(s3Key: string): Promise<any> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    const response = await this.s3Client.send(command);
    return response.Body; // This is a ReadableStream in Node.js
  }
}
