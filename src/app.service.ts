import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getRoot() {
    return {
      name: 'NestJS E-commerce API',
      version: '1.0.0',
      description: 'E-commerce API with Voucher System',
      documentation: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async getDetailedHealth() {
    const startTime = Date.now();

    // Check database
    let dbStatus = 'ok';
    let dbResponseTime = 0;
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbResponseTime = Date.now() - dbStart;
    } catch (error) {
      dbStatus = 'error';
    }

    // Check Redis (optional, if Redis service is injected)
    const redisStatus = 'ok';
    // const redisStart = Date.now();
    // try {
    //   await this.redis.ping();
    // } catch (error) {
    //   redisStatus = 'error';
    // }

    const totalResponseTime = Date.now() - startTime;

    return {
      status:
        dbStatus === 'ok' && redisStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.config.get('NODE_ENV'),
      services: {
        database: {
          status: dbStatus,
          responseTime: `${dbResponseTime}ms`,
        },
        redis: {
          status: redisStatus,
          responseTime: 'N/A',
        },
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        },
      },
      totalResponseTime: `${totalResponseTime}ms`,
    };
  }
}
