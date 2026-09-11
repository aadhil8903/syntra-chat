import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrgDirectoryModalComponent } from './org-directory-modal.component';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { of } from 'rxjs';
import { IOrgMember } from '@enter-chat/shared-types';

describe('OrgDirectoryModalComponent', () => {
  let component: OrgDirectoryModalComponent;
  let fixture: ComponentFixture<OrgDirectoryModalComponent>;
  let apiServiceMock: jest.Mocked<Partial<ApiService>>;
  let authServiceMock: jest.Mocked<Partial<AuthService>>;

  const mockMembers: IOrgMember[] = [
    {
      id: 'user-1',
      firstName: 'Aadil',
      lastName: 'Shaikh',
      email: 'aadil@enterprise.com',
      presence: { isOnline: true, lastSeenRelative: 'Just now' },
      departments: ['Engineering'],
    },
    {
      id: 'user-2',
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul@enterprise.com',
      presence: { isOnline: false, lastSeenRelative: '10 mins ago' },
      departments: ['Product'],
    },
    {
      id: 'current-user-id',
      firstName: 'Current',
      lastName: 'User',
      email: 'current@enterprise.com',
      presence: { isOnline: true },
    },
  ];

  beforeEach(async () => {
    apiServiceMock = {
      getOrganizationMembers: jest.fn().mockReturnValue(of(mockMembers)),
    };

    authServiceMock = {
      currentUser: jest.fn().mockReturnValue({ id: 'current-user-id', email: 'current@enterprise.com' } as any),
    };

    await TestBed.configureTestingModule({
      imports: [OrgDirectoryModalComponent],
      providers: [
        { provide: ApiService, useValue: apiServiceMock },
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrgDirectoryModalComponent);
    component = fixture.componentInstance;
  });

  it('should create the modal component', () => {
    expect(component).toBeTruthy();
  });

  it('should load organization members excluding the current user when opened', () => {
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: {
        currentValue: true,
        previousValue: false,
        firstChange: false,
        isFirstChange: () => false,
      },
    });
    fixture.detectChanges();

    expect(apiServiceMock.getOrganizationMembers).toHaveBeenCalledWith('');
    expect(component.filteredMembers().length).toBe(2);
    expect(component.filteredMembers().map((m) => m.id)).toEqual(['user-1', 'user-2']);
  });

  it('should emit messageMember and close when Message button is clicked', () => {
    const messageSpy = jest.spyOn(component.messageMember, 'emit');
    const closeSpy = jest.spyOn(component.closed, 'emit');

    const targetMember = mockMembers[1];
    component.onStartMessage(targetMember);

    expect(messageSpy).toHaveBeenCalledWith(targetMember);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should trigger search on query change', () => {
    component.onSearchChange('Rahul');
    expect(apiServiceMock.getOrganizationMembers).toHaveBeenCalledWith('Rahul');
  });

  it('should close on Escape key press', () => {
    component.isOpen = true;
    const closeSpy = jest.spyOn(component.closed, 'emit');

    component.onEscape();
    expect(closeSpy).toHaveBeenCalled();
  });
});
