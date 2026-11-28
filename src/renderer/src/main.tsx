// window.api を用意する（他の import より先に読み込む）
import './api'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import App from './App'
import './styles/index.css'

document.documentElement.dataset.platform = window.api.platform

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <IconContext.Provider value={{ weight: 'bold', size: '1.15em' }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
)
