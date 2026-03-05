import { Global, Module } from '@nestjs/common';
import { MentionsService } from './mentions.service';

@Global()
@Module({
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}
