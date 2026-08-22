import { describe, expect, it } from 'vitest';
import { createVoiceRtcConfiguration } from './voiceRtcConfig';

describe('voice RTC configuration', () => {
  it('uses a STUN server when TURN has not been configured', () => {
    expect(createVoiceRtcConfiguration({}).iceServers).toEqual([
      { urls: ['stun:stun.l.google.com:19302'] },
    ]);
  });

  it('adds all configured STUN and TURN endpoints', () => {
    expect(createVoiceRtcConfiguration({
      VITE_VOICE_STUN_URLS: 'stun:stun.example.com:3478, stun:backup.example.com:3478',
      VITE_VOICE_TURN_URLS: 'turn:turn.example.com:3478?transport=udp, turns:turn.example.com:5349',
      VITE_VOICE_TURN_USERNAME: 'white-flower',
      VITE_VOICE_TURN_CREDENTIAL: 'secret',
    }).iceServers).toEqual([
      { urls: ['stun:stun.example.com:3478', 'stun:backup.example.com:3478'] },
      {
        urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:5349'],
        username: 'white-flower',
        credential: 'secret',
      },
    ]);
  });
});
