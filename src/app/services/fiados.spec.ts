import { TestBed } from '@angular/core/testing';

import { Fiados } from './fiados';

describe('Fiados', () => {
  let service: Fiados;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Fiados);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
