require('dotenv').config();
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

async function emptyS3Directory(bucket, dir) {
  const listParams = {
    Bucket: bucket,
    Prefix: dir
  };

  const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

  if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
    console.log(`No objects found in ${dir}`);
    return;
  }

  const deleteParams = {
    Bucket: bucket,
    Delete: { Objects: [] }
  };

  listedObjects.Contents.forEach(({ Key }) => {
    deleteParams.Delete.Objects.push({ Key });
  });

  const res = await s3Client.send(new DeleteObjectsCommand(deleteParams));
  console.log(`Deleted ${res.Deleted.length} objects from ${dir}`);

  if (listedObjects.IsTruncated) {
    await emptyS3Directory(bucket, dir);
  }
}

async function run() {
  try {
    await emptyS3Directory(BUCKET_NAME, 'tenderlinked/assam/');
    console.log('Successfully deleted all Assam files from S3');
  } catch(e) {
    console.error(e);
  }
}

run();
