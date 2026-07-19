import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardCajeraPage } from './dashboard-cajera.page';

describe('DashboardCajeraPage', () => {
  let component: DashboardCajeraPage;
  let fixture: ComponentFixture<DashboardCajeraPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    fixture = TestBed.createComponent(DashboardCajeraPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
