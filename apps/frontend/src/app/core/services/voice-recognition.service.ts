import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ApiService } from './api.service';

export interface VoiceTranscriptResult {
  transcript: string;
  isFinal: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class VoiceRecognitionService {
  private ngZone = inject(NgZone);
  private api = inject(ApiService);

  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedAudioChunks: Blob[] = [];

  private isListeningSubject = new BehaviorSubject<boolean>(false);
  private isSupportedSubject = new BehaviorSubject<boolean>(true);
  private transcriptSubject = new Subject<VoiceTranscriptResult>();
  private errorSubject = new Subject<string>();

  public isListening$: Observable<boolean> = this.isListeningSubject.asObservable();
  public isSupported$: Observable<boolean> = this.isSupportedSubject.asObservable();
  public transcript$: Observable<VoiceTranscriptResult> = this.transcriptSubject.asObservable();
  public error$: Observable<string> = this.errorSubject.asObservable();

  private userExplicitlyStopped = false;
  private hadWebSpeechTranscript = false;

  constructor() {
    this.initSpeechRecognition();
  }

  public get isSupported(): boolean {
    return this.isSupportedSubject.value;
  }

  public get isListening(): boolean {
    return this.isListeningSubject.value;
  }

  private initSpeechRecognition(): void {
    if (typeof window === 'undefined') {
      this.isSupportedSubject.next(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = navigator?.language || 'en-US';

        this.recognition.onstart = () => {
          this.ngZone.run(() => {
            this.isListeningSubject.next(true);
          });
        };

        this.recognition.onresult = (event: any) => {
          let fullFinalTranscript = '';
          let fullInterimTranscript = '';

          for (let i = 0; i < event.results.length; ++i) {
            const result = event.results[i];
            const text = result[0].transcript;
            if (result.isFinal) {
              fullFinalTranscript += text + ' ';
            } else {
              fullInterimTranscript += text;
            }
          }

          const combined = `${fullFinalTranscript.trim()} ${fullInterimTranscript.trim()}`.trim();
          if (combined) {
            this.hadWebSpeechTranscript = true;
            this.ngZone.run(() => {
              this.transcriptSubject.next({
                transcript: combined,
                isFinal: !!fullFinalTranscript && !fullInterimTranscript,
              });
            });
          }
        };

        this.recognition.onerror = (event: any) => {
          this.ngZone.run(() => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              this.errorSubject.next('Microphone permission denied. Please allow microphone access in browser settings.');
              this.stopListening();
            } else if (event.error === 'network') {
              console.warn('Web Speech API network unreachable, using audio recording fallback.');
            }
          });
        };

        this.recognition.onend = () => {
          this.ngZone.run(() => {
            if (!this.userExplicitlyStopped && this.isListeningSubject.value) {
              try {
                this.recognition.start();
              } catch (err) {}
            }
          });
        };
      } catch {
        this.recognition = null;
      }
    }
  }

  public async startListening(): Promise<void> {
    if (this.isListeningSubject.value) {
      return;
    }

    this.userExplicitlyStopped = false;
    this.hadWebSpeechTranscript = false;
    this.recordedAudioChunks = [];

    // 1. Start MediaRecorder from microphone
    if (typeof navigator !== 'undefined' && navigator?.mediaDevices?.getUserMedia) {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
          ? 'audio/webm;codecs=opus'
          : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
          ? 'audio/webm'
          : '';

        if (typeof MediaRecorder !== 'undefined') {
          this.mediaRecorder = mimeType ? new MediaRecorder(this.mediaStream, { mimeType }) : new MediaRecorder(this.mediaStream);
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.recordedAudioChunks.push(e.data);
            }
          };
          this.mediaRecorder.start(250);
        }
        this.isListeningSubject.next(true);
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          this.errorSubject.next('Microphone permission denied. Please enable microphone permissions in your browser.');
          return;
        }
      }
    }

    // 2. Also start Web Speech recognition for instant live typing if available
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch (e: any) {}
    }

    this.isListeningSubject.next(true);
  }

  public stopListening(): void {
    this.userExplicitlyStopped = true;
    this.isListeningSubject.next(false);

    // Stop Web Speech
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    // Stop MediaRecorder and transcribe if Web Speech didn't supply transcripts
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.recordedAudioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.mediaStream?.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;

        // If Web Speech API didn't already produce transcripts (e.g. Brave blocked it / network error)
        if (!this.hadWebSpeechTranscript && audioBlob.size > 500) {
          this.api.transcribeAudio(audioBlob).subscribe({
            next: (res) => {
              if (res.transcript && res.transcript.trim()) {
                this.ngZone.run(() => {
                  this.transcriptSubject.next({
                    transcript: res.transcript.trim(),
                    isFinal: true,
                  });
                });
              }
            },
            error: (err) => {
              console.error('Audio transcription error:', err);
            },
          });
        }
      };
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    } else {
      this.mediaStream?.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  public toggleListening(): void {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }
}
