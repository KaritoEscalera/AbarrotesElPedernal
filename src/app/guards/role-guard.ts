import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, RolUsuario } from '../services/auth';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const rol = auth.obtenerRol();
  const rolesPermitidos = (route.data?.['roles'] ?? []) as RolUsuario[];

  if (auth.estaAutenticado() && rol && rolesPermitidos.includes(rol)) {
    return true;
  }

  return rol
    ? router.createUrlTree([auth.rutaInicial(rol)])
    : router.createUrlTree(['/login']);
};
