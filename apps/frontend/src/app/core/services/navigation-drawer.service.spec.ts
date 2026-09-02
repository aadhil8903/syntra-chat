import { TestBed } from '@angular/core/testing';
import { NavigationDrawerService } from './navigation-drawer.service';

describe('NavigationDrawerService', () => {
  let service: NavigationDrawerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NavigationDrawerService);
  });

  it('should initialize with drawer closed', () => {
    expect(service.isOpen()).toBe(false);
  });

  it('should open, close, and toggle drawer state', () => {
    service.open();
    expect(service.isOpen()).toBe(true);

    service.close();
    expect(service.isOpen()).toBe(false);

    service.toggle();
    expect(service.isOpen()).toBe(true);

    service.toggle();
    expect(service.isOpen()).toBe(false);
  });
});
