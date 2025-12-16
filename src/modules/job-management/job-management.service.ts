import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

@Injectable()
export class JobManagementService {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('order-expiry') private orderExpiryQueue: Queue,
    @InjectQueue('payment-processing') private paymentQueue: Queue,
  ) {}

  private getQueue(queueName: string): Queue {
    const queues: Record<string, Queue> = {
      email: this.emailQueue,
      'order-expiry': this.orderExpiryQueue,
      'payment-processing': this.paymentQueue,
    };

    const queue = queues[queueName];
    if (!queue) {
      throw new NotFoundException(`Queue ${queueName} not found`);
    }

    return queue;
  }

  async getFailedJobs(queueName?: string, limit = 50) {
    if (queueName) {
      const queue = this.getQueue(queueName);
      const failed = await queue.getFailed(0, limit - 1);
      return {
        queue: queueName,
        count: failed.length,
        jobs: failed.map((job) => ({
          id: job.id,
          data: job.data,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        })),
      };
    }

    const allFailed = await Promise.all([
      this.getFailedJobs('email', limit),
      this.getFailedJobs('order-expiry', limit),
      this.getFailedJobs('payment-processing', limit),
    ]);

    return {
      queues: allFailed,
      totalFailed: allFailed.reduce((sum, q) => sum + q.count, 0),
    };
  }

  async retryJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(
        `Job ${jobId} not found in queue ${queueName}`,
      );
    }

    await job.retry();

    return {
      success: true,
      message: `Job ${jobId} queued for retry`,
      queue: queueName,
      jobId,
    };
  }

  async retryAllFailedJobs(queueName: string) {
    const queue = this.getQueue(queueName);
    const failed = await queue.getFailed();

    let retried = 0;
    for (const job of failed) {
      await job.retry();
      retried++;
    }

    return {
      success: true,
      message: `Retried ${retried} failed jobs in queue ${queueName}`,
      queue: queueName,
      retriedCount: retried,
    };
  }

  async cleanJobs(
    queueName: string,
    status: 'completed' | 'failed',
    age?: number,
  ) {
    const queue = this.getQueue(queueName);

    const cleaned = await queue.clean(age || 24 * 60 * 60 * 1000, status);

    return {
      success: true,
      message: `Cleaned ${cleaned.length} ${status} jobs from ${queueName}`,
      queue: queueName,
      cleanedCount: cleaned.length,
    };
  }

  async getQueueStats() {
    const queues = ['email', 'order-expiry', 'payment-processing'];

    const stats = await Promise.all(
      queues.map(async (queueName) => {
        const queue = this.getQueue(queueName);
        const counts = await queue.getJobCounts();
        const isPaused = await queue.isPaused();

        return {
          name: queueName,
          isPaused,
          ...counts,
        };
      }),
    );

    return {
      queues: stats,
      timestamp: new Date().toISOString(),
    };
  }

  async pauseQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.pause();

    return {
      success: true,
      message: `Queue ${queueName} paused`,
      queue: queueName,
    };
  }

  async resumeQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.resume();

    return {
      success: true,
      message: `Queue ${queueName} resumed`,
      queue: queueName,
    };
  }
}
