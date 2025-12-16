import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { JwtModule } from '@nestjs/jwt';

import {
  I18nModule,
  QueryResolver,
  AcceptLanguageResolver,
  HeaderResolver,
} from 'nestjs-i18n';
import { join } from 'path';

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '@shared/guards/permissions.guard';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from '@database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { ProductsModule } from '@modules/products/products.module';
import { CartModule } from '@modules/cart/cart.module';
import { EventsModule } from '@modules/events/events.module';
import { VoucherTemplatesModule } from './modules/voucher-templates/voucher-templates.module';
import { VoucherInstancesModule } from './modules/voucher-instances/voucher-instances.module';
import { OrdersModule } from '@modules/orders/orders.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { EmailModule } from '@modules/email/email.module';
import { EditLocksModule } from '@modules/edit-locks/edit-locks.module';
import { HealthModule } from '@modules/health/health.module';
import { WinstonModule } from 'nest-winston';
import { JobManagementModule } from '@modules/job-management/job-management.module';

import { winstonConfig } from '@config/logger.config';
import jwtConfig from '@config/jwt.config';
import databaseConfig from '@config/database.config';
import redisConfig from '@config/redis.config';
import emailConfig from '@config/email.config';

import { CleanupService } from './jobs/cleanup.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, databaseConfig, redisConfig, emailConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    JwtModule.registerAsync({
      global: true,
      useFactory: (configService: ConfigService) =>
        ({
          secret: configService.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: configService.get<string>('jwt.accessTokenExpiry'),
          },
        }) as any,
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    NotificationsModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB ?? '1', 10),
          // tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),
    ScheduleModule.forRoot(),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      autoSchemaFile: true,
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      context: ({ req, res }) => ({ req, res }),
      formatError: (error) => {
        return {
          message: error.message,
          code: error.extensions?.code,
          path: error.path,
        };
      },
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
    WinstonModule.forRoot(winstonConfig),
    JobManagementModule,

    AuthModule,
    UsersModule,
    ProductsModule,
    CartModule,
    EventsModule,
    VoucherTemplatesModule,
    VoucherInstancesModule,
    OrdersModule,
    PaymentsModule,
    EmailModule,
    EditLocksModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CleanupService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
