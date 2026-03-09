import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FieldSecurityResolverService } from './field-security-resolver.service';
import { MetadataEntitiesController } from './metadata-entities.controller';
import { MetadataEntitiesService } from './metadata-entities.service';
import { MetadataFieldSecurityController } from './metadata-field-security.controller';
import { MetadataFieldSecurityService } from './metadata-field-security.service';
import { MetadataFieldsController } from './metadata-fields.controller';
import { MetadataFieldsService } from './metadata-fields.service';
import { MetadataFormsController } from './metadata-forms.controller';
import { MetadataFormsService } from './metadata-forms.service';
import { MetadataGuardService } from './metadata-guard.service';
import { MetadataIntrospectionService } from './metadata-introspection.service';
import { MetadataPublishController } from './metadata-publish.controller';
import { MetadataPublishService } from './metadata-publish.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    MetadataEntitiesController,
    MetadataFieldsController,
    MetadataFormsController,
    MetadataPublishController,
    MetadataFieldSecurityController,
  ],
  providers: [
    MetadataEntitiesService,
    MetadataFieldsService,
    MetadataFormsService,
    MetadataPublishService,
    MetadataGuardService,
    MetadataIntrospectionService,
    MetadataFieldSecurityService,
    FieldSecurityResolverService,
  ],
  exports: [
    MetadataEntitiesService,
    MetadataFieldsService,
    MetadataFormsService,
    MetadataPublishService,
    MetadataGuardService,
    MetadataIntrospectionService,
    MetadataFieldSecurityService,
    FieldSecurityResolverService,
  ],
})
export class MetadataDesignerModule {}

