import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { VoiceRecognitionService } from './voice-recognition.service';
import { ApiService } from './api.service';

describe('VoiceRecognitionService', () => {
  let service: VoiceRecognitionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VoiceRecognitionService,
        {
          provide: ApiService,
          useValue: {
            transcribeAudio: jest.fn().mockReturnValue(of({ transcript: '' })),
          },
        },
      ],
    });
    service = TestBed.inject(VoiceRecognitionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default listening state as false', (done) => {
    service.isListening$.subscribe((isListening) => {
      expect(isListening).toBe(false);
      done();
    });
  });

  it('should toggle listening state safely', () => {
    expect(service.isListening).toBe(false);
    service.toggleListening();
    expect(service.isListening).toBe(true);
    service.toggleListening();
    expect(service.isListening).toBe(false);
  });
});
