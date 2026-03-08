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
    const record = await this.prisma.attachment.create({
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
    return { ...record, sizeBytes: Number(record.sizeBytes) };
  }

  async findAll(attachableType: string, attachableId: string): Promise<Record<string, unknown>[]> {
    const records = await this.prisma.attachment.findMany({
      where: { attachableType, attachableId },
      include: {
        uploader: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((r) => ({ ...r, sizeBytes: Number(r.sizeBytes) }));
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
