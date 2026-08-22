const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];

export interface VoiceRtcEnvironment {
  VITE_VOICE_STUN_URLS?: string;
  VITE_VOICE_TURN_URLS?: string;
  VITE_VOICE_TURN_USERNAME?: string;
  VITE_VOICE_TURN_CREDENTIAL?: string;
}

function parseUrls(value: string | undefined): string[] {
  return [...new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function createVoiceRtcConfiguration(
  environment: VoiceRtcEnvironment = import.meta.env,
): RTCConfiguration {
  const configuredStunUrls = parseUrls(environment.VITE_VOICE_STUN_URLS);
  const turnUrls = parseUrls(environment.VITE_VOICE_TURN_URLS);
  const iceServers: RTCIceServer[] = [
    { urls: configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_STUN_URLS },
  ];

  if (turnUrls.length > 0) {
    const username = environment.VITE_VOICE_TURN_USERNAME?.trim();
    const credential = environment.VITE_VOICE_TURN_CREDENTIAL?.trim();
    iceServers.push({
      urls: turnUrls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 4,
  };
}
