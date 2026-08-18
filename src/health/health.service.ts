import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<{ status: string }> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
    };
  }
}
