import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand as PutCmd } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private client: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET || 'feedback-uploads';

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (err) {
        console.warn('Could not create S3 bucket:', err);
      }
    }
  }

  /** Build a public URL that routes through the API (not direct to S3).
   *  Uses relative path so it works in any environment (dev/prod). */
  getPublicUrl(storageKey: string): string {
    return `/api/v1/uploads/file/${storageKey}`;
  }

  /** Normalize a stored URL — strip any absolute localhost/dev prefix
   *  so it becomes a relative path that works on the current host. */
  static normalizeUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    // Strip http://localhost:XXXX prefix or any http(s)://host prefix before /api/
    const apiIdx = url.indexOf('/api/v1/uploads/file/');
    if (apiIdx > 0) return url.slice(apiIdx);
    return url;
  }

  async upload(
    file: Buffer,
    originalName: string,
    mimeType: string,
    folder: string = 'attachments',
  ): Promise<{ storageKey: string; url: string }> {
    const ext = path.extname(originalName);
    const storageKey = `${folder}/${randomUUID()}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: file,
        ContentType: mimeType,
      }),
    );

    const url = this.getPublicUrl(storageKey);
    return { storageKey, url };
  }

  async getObject(storageKey: string): Promise<{ body: NodeJS.ReadableStream; contentType: string }> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
    return {
      body: result.Body as NodeJS.ReadableStream,
      contentType: result.ContentType || 'application/octet-stream',
    };
  }

  async getPresignedUploadUrl(
    folder: string,
    filename: string,
    mimeType: string,
    expiresIn: number = 300,
  ): Promise<{ storageKey: string; uploadUrl: string; publicUrl: string }> {
    const ext = path.extname(filename);
    const storageKey = `${folder}/${randomUUID()}${ext}`;

    const command = new PutCmd({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    const publicUrl = `${this.endpoint}/${this.bucket}/${storageKey}`;

    return { storageKey, uploadUrl, publicUrl };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }
}
