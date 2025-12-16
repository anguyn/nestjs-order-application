import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { JobManagementService } from './job-management.service';

@ApiTags('Admin - Job Management')
@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT')
export class JobManagementController {
  constructor(private readonly jobService: JobManagementService) {}

  /**
   * Get failed jobs from a queue
   */
  @Get('failed')
  @Permissions(Permission.ADMIN_JOB_VIEW)
  @ApiOperation({ summary: 'List all failed jobs across queues' })
  async getFailedJobs(
    @Query('queue') queueName?: string,
    @Query('limit') limit?: number,
  ) {
    return this.jobService.getFailedJobs(queueName, limit);
  }

  /**
   * Retry specific job by ID
   */
  @Post(':jobId/retry')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ADMIN_JOB_RETRY)
  @ApiOperation({ summary: 'Retry a specific failed job' })
  async retryJob(
    @Param('jobId') jobId: string,
    @Query('queue') queueName: string,
  ) {
    return this.jobService.retryJob(queueName, jobId);
  }

  /**
   * Retry all failed jobs in a queue
   */
  @Post('retry-all')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ADMIN_JOB_RETRY)
  @ApiOperation({ summary: 'Retry all failed jobs in a queue' })
  async retryAllFailedJobs(@Query('queue') queueName: string) {
    return this.jobService.retryAllFailedJobs(queueName);
  }

  /**
   * Clean completed jobs
   */
  @Post('clean')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ADMIN_JOB_CLEAN)
  @ApiOperation({ summary: 'Clean old completed/failed jobs' })
  async cleanJobs(
    @Query('queue') queueName: string,
    @Query('status') status: 'completed' | 'failed',
    @Query('age') age?: number, // milliseconds
  ) {
    return this.jobService.cleanJobs(queueName, status, age);
  }

  /**
   * Get queue stats
   */
  @Get('stats')
  @Permissions(Permission.ADMIN_JOB_VIEW)
  @ApiOperation({ summary: 'Get statistics for all queues' })
  async getQueueStats() {
    return this.jobService.getQueueStats();
  }

  /**
   * Pause/Resume queue
   */
  @Post(':queue/pause')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ADMIN_JOB_MANAGE)
  @ApiOperation({ summary: 'Pause a queue' })
  async pauseQueue(@Param('queue') queueName: string) {
    return this.jobService.pauseQueue(queueName);
  }

  @Post(':queue/resume')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ADMIN_JOB_MANAGE)
  @ApiOperation({ summary: 'Resume a paused queue' })
  async resumeQueue(@Param('queue') queueName: string) {
    return this.jobService.resumeQueue(queueName);
  }
}
