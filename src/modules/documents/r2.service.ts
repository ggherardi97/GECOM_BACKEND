import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2PresignPutResult = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
  bucket: string;
  key: string;
};

export type R2PresignGetResult = {
  url: string;
  method: "GET";
  expiresInSeconds: number;
  bucket: string;
  key: string;
};

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly expiresInSeconds: number;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>("R2_ENDPOINT");
    const accessKeyId = this.config.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("R2_SECRET_ACCESS_KEY");
    const bucket = this.config.get<string>("R2_BUCKET_NAME");
    const expiresInSeconds = Number(this.config.get<string>("R2_PRESIGN_EXPIRES_SECONDS") ?? "900");

    if (!endpoint) throw new Error("Missing env var: R2_ENDPOINT");
    if (!accessKeyId) throw new Error("Missing env var: R2_ACCESS_KEY_ID");
    if (!secretAccessKey) throw new Error("Missing env var: R2_SECRET_ACCESS_KEY");
    if (!bucket) throw new Error("Missing env var: R2_BUCKET_NAME");

    this.bucket = bucket;
    this.expiresInSeconds = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 900;

    // Cloudflare R2 is S3-compatible. Region can be "auto".
    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // Important for R2 compatibility in many setups
    });
  }

  public getBucket(): string {
    return this.bucket;
  }

  public getExpiresInSeconds(): number {
    return this.expiresInSeconds;
  }

  public async presignPutObject(args: {
    key: string;
    contentType: string;
    contentLength?: number;
  }): Promise<R2PresignPutResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: args.key,
      ContentType: args.contentType,
      // Do NOT set Body here (presigned PUT is used by browser)
      // ContentLength isn't always enforced by R2 for presigned PUT,
      // but you can still validate size on backend before signing.
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: this.expiresInSeconds });

    // For PUT with presigned URL, usually no extra headers needed besides Content-Type.
    // Many clients still send Content-Type, so we return it explicitly.
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": args.contentType },
      expiresInSeconds: this.expiresInSeconds,
      bucket: this.bucket,
      key: args.key,
    };
  }

  public async presignGetObject(key: string): Promise<R2PresignGetResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: this.expiresInSeconds });

    return {
      url,
      method: "GET",
      expiresInSeconds: this.expiresInSeconds,
      bucket: this.bucket,
      key,
    };
  }

  public async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }
}