import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check backend and database health' })
  @ApiOkResponse({
    description: 'Backend and database are healthy',
    schema: {
      example: {
        success: true,
        data: {
          status: 'ok',
        },
      },
    },
  })
  check() {
    return this.healthService.check();
  }
}
