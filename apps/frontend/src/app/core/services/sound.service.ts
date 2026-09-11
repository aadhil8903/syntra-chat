import { Injectable, signal } from '@angular/core';

export interface ISoundSettings {
  messagingSounds: boolean;
  sendSound: boolean;
  receiveSound: boolean;
  volume: number;
}

const DEFAULT_SOUND_SETTINGS: ISoundSettings = {
  messagingSounds: true,
  sendSound: true,
  receiveSound: true,
  volume: 0.6,
};

const STORAGE_KEY = 'syntra_chat_sound_settings';

@Injectable({
  providedIn: 'root',
})
export class SoundService {
  private audioCtx: AudioContext | null = null;
  private lastReceiveSoundTime = 0;

  readonly settings = signal<ISoundSettings>(this.loadSettings());

  constructor() {}

  private loadSettings(): ISoundSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {}
    return { ...DEFAULT_SOUND_SETTINGS };
  }

  updateSettings(newSettings: Partial<ISoundSettings>): void {
    const updated = { ...this.settings(), ...newSettings };
    this.settings.set(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Play a clean, subtle, gentle click/pop tone when sending a message.
   */
  playSendSound(): void {
    const s = this.settings();
    if (!s.messagingSounds || !s.sendSound) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Subtle pitch drop (580Hz -> 420Hz) in 45ms
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);

      const vol = Math.min(Math.max(s.volume * 0.25, 0.01), 1.0);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // Audio playback fails silently without interrupting app flow
    }
  }

  /**
   * Play a clean, modern, pleasant two-tone chime when receiving a new incoming message.
   * Debounced to prevent audio spam from rapid batch messages.
   */
  playReceiveSound(): void {
    const s = this.settings();
    if (!s.messagingSounds || !s.receiveSound) return;

    const nowMs = Date.now();
    // Debounce rapid incoming sounds within 400ms
    if (nowMs - this.lastReceiveSoundTime < 400) {
      return;
    }
    this.lastReceiveSoundTime = nowMs;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const vol = Math.min(Math.max(s.volume * 0.35, 0.01), 1.0);

      // Tone 1: 523Hz (C5 harmonic)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(vol * 0.8, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // Tone 2: 784Hz (G5 harmonious enterprise chime) slightly offset
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.07);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(vol, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.25);
    } catch {
      // Silently catch audio restrictions
    }
  }
}
