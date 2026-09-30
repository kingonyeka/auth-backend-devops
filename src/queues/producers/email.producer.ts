import { getChannel } from '../connection';
import { QUEUES } from '../queue.config';
import { emailJobSchema, type EmailJob } from '../queue.types';

export async function publishEmailJob(job: EmailJob): Promise<void> {
  // Validate on the way in too: a malformed job should fail loudly at the
  // producer, not become a poison message in the queue.
  const validated = emailJobSchema.parse(job);

  const channel = await getChannel();
  channel.sendToQueue(QUEUES.EMAIL, Buffer.from(JSON.stringify(validated)), {
    persistent: true, // survive a broker restart
    contentType: 'application/json',
  });
  await channel.waitForConfirms();
}