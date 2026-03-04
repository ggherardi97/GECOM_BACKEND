import { SetMetadata } from '@nestjs/common';

export const ACCESS_RESOURCE_KEY = 'accessResource';

export const AccessResource = (resource: string) => SetMetadata(ACCESS_RESOURCE_KEY, resource);
