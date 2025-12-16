import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const appTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs',
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

const errorTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs',
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
});

const webhookTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs/webhooks',
  filename: 'webhook-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  format: logFormat,
});

const jobTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs/jobs',
  filename: 'job-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

export const winstonConfig = {
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    appTransport,
    errorTransport,
    webhookTransport,
    jobTransport,
  ],
};

export const webhookLogger = winston.createLogger({
  defaultMeta: { service: 'webhook' },
  transports: [webhookTransport, errorTransport],
  format: logFormat,
});

export const jobLogger = winston.createLogger({
  defaultMeta: { service: 'job' },
  transports: [jobTransport, errorTransport],
  format: logFormat,
});
