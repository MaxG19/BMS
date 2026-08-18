import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get API welcome message' })
  @ApiOkResponse({
    description: 'API is available',
    schema: {
      example: {
        success: true,
        data: 'Hello World!',
      },
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
