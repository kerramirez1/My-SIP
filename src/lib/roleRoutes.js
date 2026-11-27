export const ROLE_CONFIG = {
  intern: {
    role: 'intern',
    label: 'Intern',
    dashboardLabel: 'Dashboard',
    path: '/intern',
    navItems: [
      { to: '/intern', label: 'Dashboard', icon: 'dashboard', end: true },
      {
        to: '/intern/attendance',
        label: 'Weekly Attendance',
        icon: 'attendance',
      },
      {
        to: '/intern/accomplishments',
        label: 'Accomplishments',
        icon: 'accomplishments',
      },
      { to: '/intern/tasks', label: 'Tasks', icon: 'tasks' },
    ],
  },
  supervisor: {
    role: 'supervisor',
    label: 'Supervisor',
    dashboardLabel: 'Supervisor Dashboard',
    path: '/supervisor',
    navItems: [
      {
        to: '/supervisor',
        label: 'Supervisor Dashboard',
        icon: 'dashboard',
        end: true,
      },
      { to: '/supervisor/interns', label: 'My Interns', icon: 'interns' },
      { to: '/supervisor/reviews', label: 'Pending Reviews', icon: 'tasks' },
      { to: '/supervisor/history', label: 'Review History', icon: 'history' },
    ],
  },
  coordinator: {
    role: 'coordinator',
    label: 'Coordinator',
    dashboardLabel: 'Coordinator Dashboard',
    path: '/coordinator',
    navItems: [
      {
        to: '/coordinator',
        label: 'Coordinator Dashboard',
        icon: 'dashboard',
        end: true,
      },
    ],
  },
}

/**
 * Returns the dashboard route path for a given user role.
 * @param {string | undefined | null} role
 * @returns {string}
 */
export function getDashboardPathForRole(role) {
  return ROLE_CONFIG[role]?.path ?? '/login'
}

/**
 * Returns the human-readable label for a given user role.
 * @param {string | undefined | null} role
 * @returns {string}
 */
export function formatRoleLabel(role) {
  return ROLE_CONFIG[role]?.label ?? 'User'
}

/**
 * Resolves the hierarchical breadcrumb trail for a dashboard route.
 * @param {string | undefined | null} role
 * @param {string} pathname
 * @returns {Array<{ to: string, label: string }>}
 */
export function getBreadcrumbsForRoute(role, pathname) {
  const config = ROLE_CONFIG[role]
  if (!config) return []

  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const rootItem = { to: config.path, label: config.label }

  const activeNav = config.navItems.find((item) => item.to === normalizedPath)
  if (activeNav) {
    if (activeNav.to === config.path) {
      return [rootItem, { to: config.path, label: 'Dashboard' }]
    }
    return [rootItem, { to: activeNav.to, label: activeNav.label }]
  }

  return [rootItem, { to: normalizedPath, label: 'Overview' }]
}

/**
 * Returns up to two uppercase initials for a user's display name.
 * @param {string | undefined | null} name
 * @returns {string}
 */
export function getUserInitials(name) {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
