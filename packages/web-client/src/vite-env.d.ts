/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VOICE_STUN_URLS?: string;
  readonly VITE_VOICE_TURN_URLS?: string;
  readonly VITE_VOICE_TURN_USERNAME?: string;
  readonly VITE_VOICE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
