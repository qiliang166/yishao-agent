import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import MobileApp from './MobileApp'
import './mobile.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <MobileApp />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
