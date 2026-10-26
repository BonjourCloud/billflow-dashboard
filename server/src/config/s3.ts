
import { S3Client } from "@aws-sdk/client-s3";

export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_s3Client) {
    if (!isS3Configured()) {
      throw new Error(
        "AWS S3 credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are not configured.",
      );
    }
    const region = process.env.AWS_REGION || "us-east-1";
    _s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3Client;
}

export function resetS3ClientForTesting(): void {
  _s3Client = null;
}

export const s3Bucket = process.env.AWS_S3_BUCKET || "bill-flow";
