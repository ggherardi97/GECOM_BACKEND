import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export function isPrismaError(error: unknown): error is { code: string } {
  if (typeof error !== 'object' || error === null) return false;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (
    Object.prototype.hasOwnProperty.call(error, 'code') &&
    typeof (error as { code: unknown }).code === ('string' as any)
  );
}

export function handlePrismaError(error: unknown, action: string): never {
  console.error(`❌ Prisma error while ${action}:`, error);

  if (isPrismaError(error)) {
    switch (error.code) {
      case 'P2002':
        throw new ConflictException(`Record already exists (unique constraint failed).`);

      case 'P2025':
        throw new NotFoundException(`Record not found when ${action}.`);

      case 'P2000':
      case 'P2001':
        throw new BadRequestException(`Invalid data provided when ${action}.`);
    }
  }

  // Fallback error
  throw new InternalServerErrorException(`Unexpected database error occurred while ${action}.`);
}
