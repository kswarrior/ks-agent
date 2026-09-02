import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { RouterRoutes } from './app_router.jsx'

import store from './store/store.jsx'

import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')
createRoot(container).render(
  <Provider store={store}>
    <RouterRoutes />
  </Provider>
)