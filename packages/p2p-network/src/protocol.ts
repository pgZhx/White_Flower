import type { NetworkMessage, NetworkMessageType } from './types.js';

let messageSequence = 0;

export const createMessage = <T extends NetworkMessage>(
  type: T['type'],
  partial: Omit<T, 'version' | 'type' | 'messageId'>,
): T => {
  messageSequence += 1;
  return {
    version: 1,
    type,
    messageId: `msg_${messageSequence}`,
    ...partial,
  } as T;
};

export const getMessageType = (message: NetworkMessage): NetworkMessageType => message.type;
