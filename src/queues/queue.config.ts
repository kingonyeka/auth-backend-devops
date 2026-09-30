import type { Channel } from 'amqplib';
import { env } from '../config';

export const QUEUES = {
  EMAIL: 'email.send',
  EMAIL_RETRY: 'email.send.retry',
  EMAIL_DLQ: 'email.send.dlq',
} as const;

// Declaring a queue is idempotent, so BOTH the API and the worker call this.
// That matters: publishing to a queue that doesn't exist silently drops the
// message, so the producer must guarantee the queue exists too.
//
// Gotcha: if you change EMAIL_RETRY_DELAY_MS after the queue exists, RabbitMQ
// rejects the redeclaration (arguments must match). Delete the queue in the
// management UI (localhost:15672) and restart.
export async function setupTopology(channel: Channel): Promise<void> {
  await channel.assertQueue(QUEUES.EMAIL, { durable: true });

  // Messages wait here for the TTL, then "die" and are routed back to the
  // main queue via the default exchange. This is a delayed retry with no plugins.
  await channel.assertQueue(QUEUES.EMAIL_RETRY, {
    durable: true,
    arguments: {
      'x-message-ttl': env.EMAIL_RETRY_DELAY_MS,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': QUEUES.EMAIL,
    },
  });

  await channel.assertQueue(QUEUES.EMAIL_DLQ, { durable: true });
}
