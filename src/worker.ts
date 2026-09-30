import './config'; // load + validate env first
import { closeQueueConnection, getChannel } from './queues/connection';
import { startEmailConsumer, stopEmailConsumer } from './queues/consumers/email.consumer';
import { logger } from './utils/logger';

let shuttingDown = false;

async function main() {
  const channel = await getChannel();

  // If the broker connection dies unexpectedly, exit non-zero and let the
  // orchestrator (Compose restart policy, ECS) start a fresh worker.
  channel.on('close', () => {
    if (!shuttingDown) {
      logger.error('RabbitMQ channel closed unexpectedly, exiting');
      process.exit(1);
    }
  });

  await startEmailConsumer(channel);
  logger.info('👷 Email worker started, waiting for jobs');

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, draining in-flight jobs`);
    await stopEmailConsumer(channel);
    await closeQueueConnection();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});