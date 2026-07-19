import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { roleGuard } from './role-guard';

describe('roleGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => localStorage.clear());

  it('allows a manager on an authorized route', () => {
    localStorage.setItem('sesionActiva', 'true');
    localStorage.setItem('rol', 'Gerente');
    const route = { data: { roles: ['administrador', 'gerente'] } } as unknown as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as RouterStateSnapshot));
    expect(result).toBeTrue();
  });

  it('redirects a cashier from an unauthorized route', () => {
    localStorage.setItem('sesionActiva', 'true');
    localStorage.setItem('rol', 'Cajera');
    const route = { data: { roles: ['administrador', 'gerente'] } } as unknown as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as RouterStateSnapshot)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/dashboard-cajera');
  });
});
