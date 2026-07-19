import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { guestGuard } from './guest-guard';

describe('guestGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  it('allows opening login without a session', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(result).toBeTrue();
  });

  it('redirects an authenticated administrator to its dashboard', () => {
    localStorage.setItem('sesionActiva', 'true');
    localStorage.setItem('rol', 'Administrador');
    const result = TestBed.runInInjectionContext(() => guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/dashboard-admin');
  });
});
