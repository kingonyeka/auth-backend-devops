import { connect } from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import { env } from '../config';
import { logger } from '../utils/logger';
import { setupTopology } from './queue.config';

type AmqpConnection = Awaited<ReturnType<typeof connect>>;

let connection: AmqpConnection | null = null;
let channelPromise: Promise<ConfirmChannel> | null = null;

// Lazy, shared channel. Caching the *promise* (not the channel) means two
// simultaneous callers can't open two connections.
export function getChannel(): Promise<ConfirmChannel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const conn = await connect(env.RABBITMQ_URL);
      connection = conn;

      conn.on('error', (err) => logger.error({ err }, 'RabbitMQ connection error'));
      conn.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        connection = null;
        channelPromise = null; // next getChannel() call reconnects
      });

      // A confirm channel lets us wait until the broker has actually accepted
      // a message, instead of assuming the network write worked.
      const channel = await conn.createConfirmChannel();
      await setupTopology(channel);
      return channel;
    })().catch((err) => {
      channelPromise = null; // don't cache a failed attempt
      throw err;
    });
  }
  return channelPromise;
}

export async function closeQueueConnection(): Promise<void> {
  if (!channelPromise) return;
  try {
    const channel = await channelPromise;
    await channel.close();
    await connection?.close();
  } catch (err) {
    logger.warn({ err }, 'Error while closing RabbitMQ connection');
  } finally {
    connection = null;
    channelPromise = null;
  }
}
