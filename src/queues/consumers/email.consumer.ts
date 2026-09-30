import type { Channel, ConsumeMessage } from 'amqplib';
import { env } from '../../config';
import { logger } from '../../utils/logger';
import { sendMail } from '../../lib/mailer/mailer';
import { QUEUES } from '../queue.config';
import { emailJobSchema, type EmailJob } from '../queue.types';

// Pure business logic: no RabbitMQ in here, so it's trivially unit-testable.
export async function processEmailJob(job: EmailJob): Promise<void> {
  switch (job.type) {
    case 'verification':
      await sendMail({
        to: job.to,
        subject: 'Verify your email address',
        text: `Your verification code is ${job.code}. It expires in 15 minutes.`,
      });
      return;
    case 'password_reset':
      await sendMail({
        to: job.to,
        subject: 'Reset your password',
        text:
          `Use the link below to choose a new password. It expires in 15 minutes.\n\n` +
          `${env.APP_URL}/reset-password?token=${job.token}\n\n` +
          `If you did not request this, you can ignore this email.`,
      });
      return;
  }
}

// Decides what happens to ONE message: succeed, retry, or dead-letter.
export async function handleEmailMessage(channel: Channel, msg: ConsumeMessage): Promise<void> {
  const retryCount = Number(msg.properties.headers?.['x-retry-count'] ?? 0);

  let job: EmailJob;
  try {
    job = emailJobSchema.parse(JSON.parse(msg.content.toString()));
  } catch (err) {
    // A malformed message will never succeed, so retrying is pointless.
    logger.error({ err }, 'Invalid email job payload, moving to DLQ');
    channel.sendToQueue(QUEUES.EMAIL_DLQ, msg.content, {
      persistent: true,
      headers: { 'x-error': 'invalid_payload' },
    });
    channel.ack(msg);
    return;
  }

  try {
    await processEmailJob(job);
    channel.ack(msg);
    logger.info({ jobType: job.type }, 'Email job processed');
  } catch (err) {
    const willRetry = retryCount < env.EMAIL_MAX_RETRIES;
    logger.warn({ err, jobType: job.type, retryCount, willRetry }, 'Email job failed');

    // Publish the follow-up FIRST, then ack. If we crash in between, the
    // original is redelivered (a duplicate email is better than a lost one).
    // This is "at-least-once" delivery.
    if (willRetry) {
      channel.sendToQueue(QUEUES.EMAIL_RETRY, msg.content, {
        persistent: true,
        headers: { 'x-retry-count': retryCount + 1 },
      });
    } else {
      channel.sendToQueue(QUEUES.EMAIL_DLQ, msg.content, {
        persistent: true,
        headers: {
          'x-retry-count': retryCount,
          'x-error': err instanceof Error ? err.message : String(err),
        },
      });
    }
    channel.ack(msg);
  }
}

let consumerTag: string | null = null;
const inFlight = new Set<Promise<void>>();

export async function startEmailConsumer(channel: Channel): Promise<void> {
  // Never hold more than 10 unacknowledged messages at once.
  await channel.prefetch(10);

  const { consumerTag: tag } = await channel.consume(QUEUES.EMAIL, (msg) => {
    if (!msg) return; // broker cancelled the consumer

    const task: Promise<void> = handleEmailMessage(channel, msg)
      .catch((err) => logger.error({ err }, 'Unhandled error in email handler'))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  });
  consumerTag = tag;
}

// Graceful stop: stop taking new messages, then let in-flight ones finish.
export async function stopEmailConsumer(channel: Channel): Promise<void> {
  if (consumerTag) {
    await channel.cancel(consumerTag);
    consumerTag = null;
  }
  await Promise.allSettled([...inFlight]);
}