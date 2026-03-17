import { UserRole } from './types';

export const ROLE_DASHBOARDS: Record<UserRole, string> = {
  nanny: '/nanny',
  parent: '/parent',
  admin: '/admin/dashboard',
  super_admin: '/admin/dashboard',
};

export const ADMIN_ROLES: UserRole[] = ['admin', 'super_admin'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function getDashboardPath(role: UserRole): string {
  return ROLE_DASHBOARDS[role];
}

// Route protection configuration
export const PROTECTED_ROUTES: Record<string, UserRole[]> = {
  '/nanny': ['nanny'],
  '/parent': ['parent'],
  '/admin': ['admin', 'super_admin'],
};

// Auth routes - redirect to dashboard if already logged in
export const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function getRequiredRolesForPath(pathname: string): UserRole[] | null {
  for (const [route, roles] of Object.entries(PROTECTED_ROUTES)) {
    if (pathname.startsWith(route)) {
      return roles;
    }
  }
  return null;
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(route => pathname.startsWith(route));
}
