import type { ClientView, VoiceMode, VoiceState } from '@rose-blade/game-engine';
import type { VoiceManager, VoicePermission } from './VoiceManager';
import type { VoiceSignaling } from './VoiceRoom';

export interface VoiceUiState {
  permission: VoicePermission;
  userEnabled: boolean;
  allowed: boolean;
  muted: boolean;
  mode: VoiceMode;
  currentSpeakerId: string | null;
  remainingSeconds: number;
  remoteEnabled: Record<string, boolean>;
}

export class VoiceController {
  private serverVoice: VoiceState = {
    enabled: true,
    mode: 'FREE_CHAT',
    currentSpeakerId: null,
    speakerOrder: [],
    speakerIndex: -1,
    remainingSeconds: 0,
  };
  private lobby = true;
  private remoteEnabled: Record<string, boolean> = {};
  private readonly listeners = new Set<() => void>();
  private readonly unsubManager: () => void;
  private readonly unsubStatus: () => void;

  constructor(
    readonly playerId: string,
    private readonly manager: VoiceManager,
    private readonly signaling: VoiceSignaling,
  ) {
    this.unsubManager = manager.subscribe(() => {
      signaling.sendVoiceStatus(manager.isEffectivelyEnabled);
      this.emit();
    });
    this.unsubStatus = signaling.onVoiceStatus((playerId, enabled) => {
      this.remoteEnabled = { ...this.remoteEnabled, [playerId]: enabled };
      this.emit();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(view: ClientView | null): void {
    this.lobby = !view;
    this.serverVoice = view?.voice ?? {
      enabled: true,
      mode: 'FREE_CHAT',
      currentSpeakerId: null,
      speakerOrder: [],
      speakerIndex: -1,
      remainingSeconds: 0,
    };
    const allowed = this.lobby || (
      this.serverVoice.mode === 'TURN_BASED' && this.serverVoice.currentSpeakerId === this.playerId
    );
    this.manager.setAllowed(allowed);
    if (!this.lobby && allowed && this.serverVoice.currentSpeakerId === this.playerId) {
      this.manager.setUserEnabled(true);
    }
    this.emit();
  }

  async requestPermission(): Promise<boolean> {
    return this.manager.requestPermission();
  }

  toggleUserEnabled(): void {
    if (this.lobby || this.manager.isAllowed) this.manager.toggleUserEnabled();
  }

  isPlayerEnabled(playerId: string): boolean {
    return playerId === this.playerId ? this.manager.isEffectivelyEnabled : Boolean(this.remoteEnabled[playerId]);
  }

  get state(): VoiceUiState {
    return {
      permission: this.manager.permissionState,
      userEnabled: this.manager.isUserEnabled,
      allowed: this.manager.isAllowed,
      muted: this.manager.isMuted,
      mode: this.serverVoice.mode,
      currentSpeakerId: this.serverVoice.currentSpeakerId,
      remainingSeconds: this.serverVoice.remainingSeconds,
      remoteEnabled: { ...this.remoteEnabled },
    };
  }

  destroy(): void {
    this.unsubManager();
    this.unsubStatus();
    this.manager.destroy();
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
