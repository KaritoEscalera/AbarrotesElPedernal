import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FiadosPage } from './fiados.page';

describe('FiadosPage', () => {
  let component: FiadosPage;
  let fixture: ComponentFixture<FiadosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FiadosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
