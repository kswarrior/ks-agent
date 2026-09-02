import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Route } from 'react-router-dom'

import { Layout } from './components/layout.jsx'
import { LoginPage } from './pages/login_page.jsx'
import { DashboardPage } from './pages/dashboard_page.jsx'
import { ConsolePage } from './pages/console_page.jsx'
import { FileManagerPage } from './pages/file_manager_page.jsx'
import { PlayersPage } from './pages/players_page.jsx'
import { PropertiesPage } from './pages/properties_page.jsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <div>Not Found</div>,
    children: [
      { path: 'login', element: <LoginPage />, hasErrorBoundary: true },
      {
        path: 'dashboard',
        element: <DashboardPage />,
        hasErrorBoundary: true,
      },
      {
        path: 'console',
        element: <ConsolePage />,
        hasErrorBoundary: true,
      },
      {
        path: 'file-manager',
        element: <FileManagerPage />,
        hasErrorBoundary: true,
      },
      {
        path: 'players',
        element: <PlayersPage />,
        hasErrorBoundary: true,
      },
      {
        path: 'properties',
        element: <PropertiesPage />,
        hasErrorBoundary: true,
      },
    ],
  },
])