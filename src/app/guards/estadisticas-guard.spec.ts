import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { estadisticasGuard } from './estadisticas-guard';

describe('estadisticasGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => estadisticasGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
