import { useEffect } from 'react'
import { Outlet, Navigate, useLocation, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { toggleSidebar, logout } from '../types.js'
import { logout as clearLocal } from '../api.jsx'

export function Layout() {
  const dispatch = useDispatch()
  const location = useLocation()
  const isAuth = useSelector((s) => s.isAuthenticated)
  const sidebarOpen = useSelector((s) => s.sidebarOpen)
  const user = useSelector((s) => s.currentUser)

  // If we land on /login while authenticated, kick to dashboard
  useEffect(() => {
    if (location.pathname === '/login' && isAuth) {
      window.history.replaceState(null, '', '/dashboard')
    }
  }, [location.pathname, isAuth])

  const handleLogout = () => {
    dispatch(logout())
    clearLocal()
    window.location.href = '/login'
  }

  const isActive = (p) => location.pathname.startsWith(p)

  return (
    <div className="app">
      <header className="app-header">
        <nav className="header-nav">
          <Link to="/dashboard" className="logo">
            <span>⛏</span> MC Panel
          </Link>
          <div className="header-right">
            {user?.sub && <span className="user-chip">{user.sub}</span>}
            <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
            <button
              className="btn btn-ghost icon-btn"
              onClick={() => dispatch(toggleSidebar())}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              ☰
            </button>
          </div>
        </nav>
      </header>

      <div className="app-body">
        {sidebarOpen && (
          <nav className="app-sidebar">
            <ul>
              <li><Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>📊 Dashboard</Link></li>
              <li><Link to="/console" className={isActive('/console') ? 'active' : ''}>💻 Console</Link></li>
              <li><Link to="/file-manager" className={isActive('/file-manager') ? 'active' : ''}>📁 Files</Link></li>
              <li><Link to="/players" className={isActive('/players') ? 'active' : ''}>👥 Players</Link></li>
              <li><Link to="/properties" className={isActive('/properties') ? 'active' : ''}>⚙️ Properties</Link></li>
            </ul>
          </nav>
        )}

        <main className="app-main">
          {isAuth ? <Outlet /> : <Navigate to="/login" replace />}
        </main>
      </div>
    </div>
  )
}
