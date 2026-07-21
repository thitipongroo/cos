// Files module — photo annotations (ADR-056). The GET endpoint lives here; the write path is the
// sync module, which imports this module's AnnotationService to handle the "photo_annotation" push.

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { AnnotationController } from './annotation.controller';
import { AnnotationService } from './annotation.service';
import { AnnotationRepository } from './annotation.repository';
import { FileServiceClient } from './file-service-client.service';

@Module({
  imports: [TenantModule],
  controllers: [AnnotationController],
  providers: [AnnotationService, AnnotationRepository, FileServiceClient],
  exports: [AnnotationService, FileServiceClient],
})
export class FilesModule {}
