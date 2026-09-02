import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { toggleSidebar, logout } from '../types'
import { Link } from 'react-router-dom'

import { useEffect } from 'react'

export function Layout() {
  const dispatch = useDispatch()
  const location = useLocation()
  const isAuth = useSelector((s) => s.isAuthenticated)

  // Auto-logout if session expires or user goes to login while authenticated
  useEffect(() => {
    if (location.pathname === '/login' && isAuth) {
      dispatch(logout())
    }
  }, [location.pathname, isAuth, dispatch])

  // Redirect authenticated away from login
  useEffect(() => {
    if (!isAuth && location.pathname !== '/login') {
      // Could redirect to login, but we'll let the app handle it
    }
  }, [isAuth, location.pathname])

  return (
    <div className="app">
      <header className="app-header">
        <nav>
          <Link to="/dashboard" className="logo">
            <span>MC</span>Panel
          </Link>
          <button
            className="header-btn"
            onClick={() => dispatch(toggleSidebar())}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        </nav>
      </header>

      <main className="app-main">
        <nav className="app-sidebar">
          <ul>
            <li>
              <Link to="/dashboard" className={location.pathname === '/dashboard' || location.pathname === '' ? 'active' : ''}>
                Dashboard
              </Link>
            </li>
            <li>
              <Link to="console" className={location.pathname === 'console' ? 'active' : ''}>
                Console
              </Link>
            </li>
            <li>
              <Link to="file-manager" className={location.pathname === 'file-manager' ? 'active' : ''}>
                Files
              </Link>
            </li>
            <li>
              <Link to="players" className={location.pathname === 'players' ? 'active' : ''}>
                Players
              </Link>
            </li>
            <li>
              <Link to="properties" className={location.pathname === 'properties' ? 'active' : ''}>
                Server Properties
              </Link>
            </li>
          </ul>
        </nav>

        <Outlet />

        {/* Auth redirect */}
        {useSelector((s) => !s.isAuthenticated) && (
          <nav className="auth-redirect">
            <Link to="/login">Log in to access panel</Link>
          </nav>
        )}
      </main>
    </div>
  )
}