import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RespaldosPage } from './respaldos.page';

describe('RespaldosPage', () => {
  let component: RespaldosPage;
  let fixture: ComponentFixture<RespaldosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(RespaldosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
