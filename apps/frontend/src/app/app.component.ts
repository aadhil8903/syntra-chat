import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { OnboardingWalkthroughComponent } from './shared/components/onboarding-walkthrough/onboarding-walkthrough.component';
import { CollectionsWalkthroughComponent } from './shared/components/collections-walkthrough/collections-walkthrough.component';
import { ModalDialogComponent } from './shared/components/modal-dialog/modal-dialog.component';
import { AuthService } from './core/services/auth.service';
import { WalkthroughService } from './core/services/walkthrough.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    SidebarComponent,
    OnboardingWalkthroughComponent,
    CollectionsWalkthroughComponent,
    ModalDialogComponent,
  ],
  template: `
    @if (isAuthenticated()) {
      <div class="h-screen overflow-hidden flex flex-col bg-[#f7f8fa] dark:bg-[#09090b] text-[#15171a] dark:text-[#fafafa] relative">
        <app-navbar></app-navbar>
        <div class="flex-1 flex overflow-hidden">
          <app-sidebar></app-sidebar>
          <main class="flex-1 overflow-y-auto bg-[#f7f8fa] dark:bg-[#09090b]">
            <router-outlet></router-outlet>
          </main>
        </div>
        <!-- Contextual Onboarding Tour Overlay -->
        <app-onboarding-walkthrough></app-onboarding-walkthrough>
        <!-- Independent Collections Tour Overlay -->
        <app-collections-walkthrough></app-collections-walkthrough>
        <!-- In-App Custom Modal Dialogs -->
        <app-modal-dialog></app-modal-dialog>
      </div>
    } @else {
      <main class="min-h-screen bg-[#f7f8fa] dark:bg-[#09090b] text-[#15171a] dark:text-[#fafafa] overflow-y-auto">
        <router-outlet></router-outlet>
        <!-- In-App Custom Modal Dialogs -->
        <app-modal-dialog></app-modal-dialog>
      </main>
    }
  `,
})
export class AppComponent implements OnInit {
  private authService = inject(AuthService);
  private walkthroughService = inject(WalkthroughService);
  private themeService = inject(ThemeService);

  isAuthenticated = this.authService.isAuthenticated;

  ngOnInit(): void {
    if (this.isAuthenticated()) {
      setTimeout(() => {
        this.walkthroughService.checkAndAutoStart();
      }, 500);
    }
  }
}
