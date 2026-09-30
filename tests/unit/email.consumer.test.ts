jest.mock('../../src/lib/mailer/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../src/queues/connection', () => ({
  getChannel: jest.fn(),
  closeQueueConnection: jest.fn(),
}));

import type { Channel, ConsumeMessage } from 'amqplib';
import { env } from '../../src/config';
import { sendMail } from '../../src/lib/mailer/mailer';
import { handleEmailMessage, processEmailJob } from '../../src/queues/consumers/email.consumer';
import { QUEUES } from '../../src/queues/queue.config';

const sendMailMock = sendMail as jest.Mock;

function makeMessage(payload: unknown, headers: Record<string, unknown> = {}): ConsumeMessage {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    content: Buffer.from(body),
    fields: {},
    properties: { headers },
  } as unknown as ConsumeMessage;
}

function makeChannel() {
  const channel = { ack: jest.fn(), sendToQueue: jest.fn() };
  return { channel, asChannel: channel as unknown as Channel };
}

const verificationJob = { type: 'verification', to: 'a@example.com', code: '123456' };

describe('processEmailJob', () => {
  it('sends a verification email containing the code', async () => {
    await processEmailJob({ type: 'verification', to: 'a@example.com', code: '123456' });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        subject: expect.stringContaining('Verify'),
        text: expect.stringContaining('123456'),
      }),
    );
  });

  it('sends a password reset email containing the reset link', async () => {
    await processEmailJob({ type: 'password_reset', to: 'a@example.com', token: 'abc123' });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@example.com',
        text: expect.stringContaining('/reset-password?token=abc123'),
      }),
    );
  });
});

describe('handleEmailMessage', () => {
  it('acks the message on success', async () => {
    const { channel, asChannel } = makeChannel();
    const msg = makeMessage(verificationJob);
    sendMailMock.mockResolvedValueOnce(undefined);

    await handleEmailMessage(asChannel, msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('sends a failed job to the retry queue with an incremented counter', async () => {
    const { channel, asChannel } = makeChannel();
    const msg = makeMessage(verificationJob);
    sendMailMock.mockRejectedValueOnce(new Error('smtp down'));

    await handleEmailMessage(asChannel, msg);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      QUEUES.EMAIL_RETRY,
      expect.any(Buffer),
      expect.objectContaining({ headers: { 'x-retry-count': 1 } }),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('moves the job to the DLQ once retries are exhausted', async () => {
    const { channel, asChannel } = makeChannel();
    const msg = makeMessage(verificationJob, { 'x-retry-count': env.EMAIL_MAX_RETRIES });
    sendMailMock.mockRejectedValueOnce(new Error('smtp still down'));

    await handleEmailMessage(asChannel, msg);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      QUEUES.EMAIL_DLQ,
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-error': 'smtp still down' }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('sends an unparseable message straight to the DLQ without trying to send mail', async () => {
    const { channel, asChannel } = makeChannel();
    const msg = makeMessage('this is not json');

    await handleEmailMessage(asChannel, msg);

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      QUEUES.EMAIL_DLQ,
      expect.any(Buffer),
      expect.objectContaining({ headers: { 'x-error': 'invalid_payload' } }),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });
});