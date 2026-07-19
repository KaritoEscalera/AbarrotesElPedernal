import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardGerentePage } from './dashboard-gerente.page';

describe('DashboardGerentePage', () => {
  let component: DashboardGerentePage;
  let fixture: ComponentFixture<DashboardGerentePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    fixture = TestBed.createComponent(DashboardGerentePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
