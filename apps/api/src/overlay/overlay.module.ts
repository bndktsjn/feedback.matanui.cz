import { Module } from '@nestjs/common';
import { OverlayController } from './overlay.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  controllers: [OverlayController],
  providers: [ApiKeyGuard],
})
export class OverlayModule {}
