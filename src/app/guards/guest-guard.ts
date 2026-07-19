import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const rol = auth.obtenerRol();

  return auth.estaAutenticado() && rol
    ? router.createUrlTree([auth.rutaInicial(rol)])
    : true;
};
