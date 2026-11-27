import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { CloseIcon } from '../components/Icons'
import { SidebarNav } from '../components/SidebarNav'
import { Topbar } from '../components/Topbar'
import { useAuth } from '../context/useAuth'
import { formatRoleLabel, getBreadcrumbsForRoute } from '../lib/roleRoutes'
import {
  closeModalDialogAnimated,
  isPointerOutsideDialog,
  supportsDialogClosedBy,
} from '../lib/topLayerDialog'

export function DashboardLayout() {
  const { profile, logout } = useAuth()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const dialogRef = useRef(null)

  const role = profile?.role
  const userRoleLabel = formatRoleLabel(role)
  const breadcrumbs = getBreadcrumbsForRoute(role, location.pathname)

  function openMenu() {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.removeAttribute('data-closing')
    dialog.showModal()
    setIsMenuOpen(true)
  }

  const closeMenu = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog || !dialog.open) return
    void closeModalDialogAnimated(dialog)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    closeMenu()
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    let pressedOutside = false

    function handleClose() {
      dialog.removeAttribute('data-closing')
      dialog.returnValue = ''
      setIsMenuOpen(false)
    }

    function handleCancel(event) {
      if (event.cancelable) {
        event.preventDefault()
        closeMenu()
      }
    }

    function handlePointerDown(event) {
      if (!supportsDialogClosedBy()) {
        pressedOutside = isPointerOutsideDialog(event, dialog)
      }
    }

    function handlePointerUp(event) {
      if (
        !supportsDialogClosedBy() &&
        pressedOutside &&
        isPointerOutsideDialog(event, dialog)
      ) {
        pressedOutside = false
        closeMenu()
      } else {
        pressedOutside = false
      }
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)

    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
    }
  }, [closeMenu])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)')

    function handleViewportChange(event) {
      if (event.matches) {
        closeMenu()
      }
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [closeMenu])

  return (
    <div className="flex min-h-dvh bg-surface">
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-e border-rule bg-canvas md:flex">
        <div className="flex min-h-14 shrink-0 items-center border-b border-rule px-5">
          <BrandMark />
        </div>
        <SidebarNav
          role={role}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      </aside>

      <dialog
        ref={dialogRef}
        id="mobile-nav-drawer"
        aria-label="Workspace navigation"
        {...{ closedby: 'any' }}
        className="mobile-nav-dialog md:hidden"
      >
        <div className="flex min-h-full w-full flex-col border-e border-rule bg-canvas pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-rule px-5 pt-[env(safe-area-inset-top,0px)]">
            <BrandMark />
            <button
              type="button"
              autoFocus
              onClick={closeMenu}
              aria-label="Close menu"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[5px] border border-rule bg-surface text-ink hover:bg-surface-subtle"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <SidebarNav
            role={role}
            onNavigate={closeMenu}
            onLogout={handleLogout}
            loggingOut={loggingOut}
          />
        </div>
      </dialog>

      <div className="workspace-column flex min-w-0 flex-1 flex-col">
        <Topbar
          breadcrumbs={breadcrumbs}
          userName={profile?.full_name}
          userRole={userRoleLabel}
          isMenuOpen={isMenuOpen}
          onOpenMenu={openMenu}
        />

        <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
