export type VoicePermission = 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUPPORTED';

export class VoiceManager {
  private stream: MediaStream | null = null;
  private permission: VoicePermission = 'UNKNOWN';
  private userEnabled = true;
  private allowed = true;
  private listeners = new Set<() => void>();

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
  get mediaStream(): MediaStream | null { return this.stream; }

  async requestPermission(): Promise<boolean> {
    if (this.permission === 'GRANTED' && this.stream) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.permission = 'UNSUPPORTED';
      this.emit();
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.permission = 'GRANTED';
      this.applyTrackState();
      this.emit();
      return true;
    } catch {
      this.permission = 'DENIED';
      this.emit();
      return false;
    }
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
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.listeners.clear();
  }

  private applyTrackState(): void {
    const enabled = this.userEnabled && this.allowed;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
