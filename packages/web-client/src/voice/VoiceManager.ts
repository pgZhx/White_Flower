export type VoicePermission = 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUPPORTED';

export class VoiceManager {
  private stream: MediaStream | null = null;
  private permission: VoicePermission = 'UNKNOWN';
  private userEnabled = true;
  private allowed = true;
  private listeners = new Set<() => void>();
  private recovery: Promise<boolean> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get permissionState(): VoicePermission { return this.permission; }
  get hasPermission(): boolean { return this.permission === 'GRANTED'; }
  get isUserEnabled(): boolean { return this.userEnabled; }
  get isAllowed(): boolean { return this.allowed; }
  get isMuted(): boolean { return !this.hasPermission || !this.userEnabled || !this.allowed; }
  get isEffectivelyEnabled(): boolean { return !this.isMuted; }
  get localStream(): MediaStream | null { return this.stream; }
  get mediaStream(): MediaStream | null { return this.stream; }

  async requestPermission(): Promise<boolean> {
    if (this.hasLiveAudioTrack()) return true;
    if (this.recovery) return this.recovery;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.permission = 'UNSUPPORTED';
      this.emit();
      return false;
    }
    this.recovery = this.acquireMicrophone();
    try {
      return await this.recovery;
    } finally {
      this.recovery = null;
    }
  }

  async ensureLiveMicrophone(): Promise<boolean> {
    if (this.destroyed) return false;
    return this.requestPermission();
  }

  setAllowed(allowed: boolean): void {
    if (this.allowed === allowed) return;
    this.allowed = allowed;
    this.applyTrackState();
    this.emit();
  }

  setUserEnabled(enabled: boolean): void {
    if (this.userEnabled === enabled) return;
    this.userEnabled = enabled;
    this.applyTrackState();
    this.emit();
  }

  toggleUserEnabled(): void {
    this.setUserEnabled(!this.userEnabled);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.listeners.clear();
  }

  private applyTrackState(): void {
    const enabled = this.userEnabled && this.allowed;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  private hasLiveAudioTrack(): boolean {
    return Boolean(this.stream?.getAudioTracks().some((track) => track.readyState === 'live'));
  }

  private async acquireMicrophone(): Promise<boolean> {
    const previouslyGranted = this.permission === 'GRANTED';
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.destroyed) {
        nextStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const previousStream = this.stream;
      this.stream = nextStream;
      this.permission = 'GRANTED';
      for (const track of nextStream.getAudioTracks()) {
        track.onended = () => this.scheduleMicrophoneRecovery(track.id);
      }
      this.applyTrackState();
      this.emit();
      previousStream?.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      console.warn('[voice] failed to acquire microphone audio', error);
      if (!this.destroyed) {
        this.permission = 'DENIED';
        this.emit();
        if (previouslyGranted) this.scheduleMicrophoneRecovery('microphone-retry', 2000);
      }
      return false;
    }
  }

  private scheduleMicrophoneRecovery(trackId: string, delayMs = 500): void {
    if (this.destroyed || this.recoveryTimer) return;
    console.warn('[voice] local microphone track ended; reacquiring it', { trackId });
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.ensureLiveMicrophone();
    }, delayMs);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
