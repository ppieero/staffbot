import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Lazy singleton — created on first use so dotenv.config() runs first
let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      ...(process.env.AWS_ENDPOINT_URL
        ? {
            endpoint: process.env.AWS_ENDPOINT_URL,
            forcePathStyle: true, // required for MinIO path-style URLs
          }
        : {}),
    });
  }
  return _s3;
}

const bucket = () => process.env.AWS_S3_BUCKET!;

/**
 * Upload a file buffer to S3/MinIO.
 * Key format: {tenantId}/{profileId}/{documentId}/{filename}
 * Returns the public URL of the uploaded object.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimetype: string
): Promise<string> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  const endpoint =
    process.env.AWS_ENDPOINT_URL ?? `https://s3.amazonaws.com`;
  return `${endpoint}/${bucket()}/${key}`;
}

/** Delete an object from S3/MinIO by key. */
export async function deleteFile(key: string): Promise<void> {
  await getS3().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key })
  );
}
