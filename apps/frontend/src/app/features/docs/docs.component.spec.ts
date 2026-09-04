import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DocsComponent } from './docs.component';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { signal } from '@angular/core';

describe('DocsComponent', () => {
  let component: DocsComponent;
  let fixture: ComponentFixture<DocsComponent>;
  let mockAuthService: any;
  let mockThemeService: any;

  beforeEach(async () => {
    mockAuthService = {
      isAdmin: signal(false)
    };
    mockThemeService = {
      currentTheme: signal('dark'),
      setTheme: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [DocsComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        {
          provide: ActivatedRoute,
          useValue: {
            fragment: of(null)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DocsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the hero title "How to Use Syntra Chat"', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('How to Use Syntra Chat');
  });

  it('should render quick start cards and key sections', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const quickStart = compiled.querySelector('#quick-start');
    const chatting = compiled.querySelector('#chatting');
    const fileDiscovery = compiled.querySelector('#file-discovery');
    const collections = compiled.querySelector('#collections');

    expect(quickStart).toBeTruthy();
    expect(chatting).toBeTruthy();
    expect(fileDiscovery).toBeTruthy();
    expect(collections).toBeTruthy();
  });

  it('should filter sections based on search query', () => {
    component.searchQuery.set('spreadsheets');
    fixture.detectChanges();

    const filtered = component.filteredSections();
    expect(filtered.some(s => s.id === 'spreadsheets')).toBe(true);
    expect(filtered.some(s => s.id === 'file-discovery')).toBe(false);
  });

  it('should not show admin controls if user is not an admin', () => {
    mockAuthService.isAdmin.set(false);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#admin-controls')).toBeNull();
  });

  it('should show admin controls if user is an admin', () => {
    mockAuthService.isAdmin.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#admin-controls')).toBeTruthy();
  });

  it('should allow toggling animation playback', () => {
    expect(component.isPlaying()).toBe(true);
    component.toggleAnimationPlay();
    expect(component.isPlaying()).toBe(false);
    component.toggleAnimationPlay();
    expect(component.isPlaying()).toBe(true);
  });

  it('should replay animations when replay button clicked', () => {
    component.toggleAnimationPlay();
    expect(component.isPlaying()).toBe(false);
    component.replayAnimations();
    expect(component.isPlaying()).toBe(true);
  });

  it('should navigate to section on mobile select change', () => {
    const scrollSpy = jest.spyOn(component, 'scrollToSection');
    const event = {
      target: { value: 'collections' }
    } as any;
    component.onMobileSelect(event);
    expect(scrollSpy).toHaveBeenCalledWith('collections');
  });
});
