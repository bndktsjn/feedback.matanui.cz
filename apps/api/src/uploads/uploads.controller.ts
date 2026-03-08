import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';

@Controller('v1/uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Upload a file via multipart form data.
   * Returns { storageKey, url, filename, mimeType, sizeBytes }.
   * The url routes through the API proxy so it works in all environments.
   */
  @Post()
  @UseGuards(SessionGuard, CsrfGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ storageKey: string; url: string; filename: string; mimeType: string; sizeBytes: number }> {
    if (!file) throw new BadRequestException('No file provided');

    const { storageKey, url } = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    return {
      storageKey,
      url,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  /**
   * Serve a file from S3/MinIO by proxying through the API.
   * Route: GET /v1/uploads/file/:key(*)
   */
  @Get('file/*')
  async serveFile(@Param() params: Record<string, string>, @Res() res: Response) {
    // NestJS wildcard: params['0'] contains the full path after 'file/'
    const storageKey = params['0'] || params['key'];
    if (!storageKey) {
      res.status(400).json({ error: 'Missing storage key' });
      return;
    }

    try {
      const { body, contentType } = await this.storage.getObject(storageKey);
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      (body as NodeJS.ReadableStream).pipe(res);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  }
}
