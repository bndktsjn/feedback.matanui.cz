import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PresignUploadDto } from './dto';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async presignUpload(
    dto: PresignUploadDto,
    _userId: string,
  ): Promise<{
    uploadUrl: string;
    publicUrl: string;
    storageKey: string;
  }> {
    const folder = `${dto.attachableType}/${dto.attachableId}`;
    return this.storage.getPresignedUploadUrl(folder, dto.filename, dto.mimeType);
  }

  async confirmUpload(
    attachableType: string,
    attachableId: string,
    filename: string,
    storageKey: string,
    url: string,
    mimeType: string,
    sizeBytes: number,
    userId: string,
  ): Promise<Record<string, unknown>> {
    console.log('confirmUpload called', {
      attachableType,
      attachableId,
      filename,
      storageKey,
      url,
      mimeType,
      sizeBytes,
      userId,
    });
    try {
      const result = await this.prisma.attachment.create({
        data: {
          attachableType,
          attachableId,
          filename,
          storageKey,
          url,
          mimeType,
          sizeBytes,
          uploadedBy: userId,
        },
      });
      console.log('Attachment created successfully', result);
      return result;
    } catch (error) {
      console.error('Failed to create attachment:', error);
      throw error;
    }
  }

  async findAll(attachableType: string, attachableId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.attachment.findMany({
      where: { attachableType, attachableId },
      include: {
        uploader: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(attachmentId: string, _userId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.storage.delete(attachment.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
  }
}
