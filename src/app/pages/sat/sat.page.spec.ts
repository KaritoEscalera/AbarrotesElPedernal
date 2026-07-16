import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SatPage } from './sat.page';

describe('SatPage', () => {
  let component: SatPage;
  let fixture: ComponentFixture<SatPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SatPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
