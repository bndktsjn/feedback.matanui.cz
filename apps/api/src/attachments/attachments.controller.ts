import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { PresignUploadDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsString, IsEnum, IsUUID, IsNumber, MaxLength } from 'class-validator';

class ConfirmUploadDto {
  @IsEnum(['thread', 'comment', 'task'])
  attachableType!: string;

  @IsUUID()
  attachableId!: string;

  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(512)
  storageKey!: string;

  @IsString()
  @MaxLength(512)
  url!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsNumber()
  sizeBytes!: number;
}

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/attachments')
@UseGuards(SessionGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('presign')
  @UseGuards(CsrfGuard)
  async presignUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignUploadDto,
  ): Promise<{ uploadUrl: string; publicUrl: string; storageKey: string }> {
    return this.attachmentsService.presignUpload(dto, user.id);
  }

  @Post('confirm')
  @UseGuards(CsrfGuard)
  async confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ): Promise<Record<string, unknown>> {
    console.log('[AttachmentsController] confirmUpload called', {
      attachableType: dto.attachableType,
      attachableId: dto.attachableId,
      filename: dto.filename,
      storageKey: dto.storageKey,
      url: dto.url,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      sizeBytesType: typeof dto.sizeBytes,
      userId: user.id,
    });
    try {
      const result = await this.attachmentsService.confirmUpload(
        dto.attachableType,
        dto.attachableId,
        dto.filename,
        dto.storageKey,
        dto.url,
        dto.mimeType,
        dto.sizeBytes,
        user.id,
      );
      console.log('[AttachmentsController] confirmUpload success', result);
      return result;
    } catch (err) {
      console.error('[AttachmentsController] confirmUpload FAILED', err);
      throw err;
    }
  }

  @Get()
  async findAll(
    @Query('attachableType') attachableType: string,
    @Query('attachableId') attachableId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.attachmentsService.findAll(attachableType, attachableId);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.attachmentsService.remove(id, user.id);
    return { message: 'Attachment deleted' };
  }
}
