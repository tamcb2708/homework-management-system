import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadConfig } from '../config/env';

export interface StoredObject { key: string }

/** Private object storage. Local driver: files never served statically, only streamed by the API after checks. */
@Injectable()
export class StorageService {
  private s3?: S3Client;

  private get cfg() { return loadConfig(); }

  private client() {
    if (!this.s3) {
      const s = this.cfg.s3;
      this.s3 = new S3Client({ region: s.region, endpoint: s.endpoint, forcePathStyle: s.forcePathStyle, credentials: { accessKeyId: s.accessKeyId!, secretAccessKey: s.secretAccessKey! } });
    }
    return this.s3;
  }

  private localPath(key: string) {
    const root = resolve(this.cfg.storageLocalDir);
    const p = resolve(join(root, key));
    if (!p.startsWith(root + '/')) throw new Error('Invalid storage key');
    return p;
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (this.cfg.storageDriver === 's3') {
      await this.client().send(new PutObjectCommand({ Bucket: this.cfg.s3.bucket, Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const p = this.localPath(key);
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    await writeFile(p, body, { mode: 0o600 });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.localPath(key));
  }

  async remove(key: string) {
    if (this.cfg.storageDriver === 'local') await unlink(this.localPath(key)).catch(() => undefined);
  }

  /** S3 only: short-lived signed GET URL forcing download. */
  async signedUrl(key: string, filename: string, contentType: string): Promise<string | null> {
    if (this.cfg.storageDriver !== 's3') return null;
    return getSignedUrl(this.client(), new GetObjectCommand({
      Bucket: this.cfg.s3.bucket, Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, ResponseContentType: contentType,
    }), { expiresIn: 120 });
  }
}
