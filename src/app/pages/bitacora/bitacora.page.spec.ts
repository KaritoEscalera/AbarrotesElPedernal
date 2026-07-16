import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BitacoraPage } from './bitacora.page';

describe('BitacoraPage', () => {
  let component: BitacoraPage;
  let fixture: ComponentFixture<BitacoraPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(BitacoraPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
