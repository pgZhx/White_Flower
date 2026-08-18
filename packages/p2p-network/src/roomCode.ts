const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateRoomCode = (length = 6): string => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[index] ?? 'A';
  }
  return code;
};

export const makePeerId = (prefix = 'peer'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const makePlayerId = (prefix = 'player'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const makeSessionId = (): string =>
  `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
