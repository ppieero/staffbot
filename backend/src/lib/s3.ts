import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

/**
 * Generate a presigned download URL for an object (expires in 5 minutes).
 * The key is extracted from the stored file_url.
 */
export async function getPresignedDownloadUrl(fileUrl: string, filename: string): Promise<string> {
  const bkt = bucket();
  // Extract key from URL: remove endpoint+bucket prefix
  const endpoint = process.env.AWS_ENDPOINT_URL ?? "";
  let key = fileUrl;
  if (endpoint && fileUrl.startsWith(endpoint)) {
    key = fileUrl.slice(endpoint.length).replace(/^\/[^/]+\//, ""); // strip /bucket/
  } else if (fileUrl.includes(`/${bkt}/`)) {
    key = fileUrl.split(`/${bkt}/`)[1];
  }

  const command = new GetObjectCommand({
    Bucket: bkt,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}

/** Delete an object from S3/MinIO by key. */
export async function deleteFile(key: string): Promise<void> {
  await getS3().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key })
  );
}
