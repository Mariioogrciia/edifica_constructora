/**
 * Toast – Notificación temporal que aparece cuando llega una alerta en vivo.
 */
import { useState, useEffect } from 'react'

const TYPE_EMOJIS = {
  NO_HARDHAT: '🪖',
  NO_VEST: '🦺',
  RESTRICTED_ZONE: '⛔',
}

const TYPE_MSG = {
  NO_HARDHAT: 'Trabajador sin casco detectado',
  NO_VEST: 'Trabajador sin chaleco detectado',
  RESTRICTED_ZONE: 'Intrusión en zona restringida',
}

export default function ToastContainer({ toasts = [] }) {
  return (
    <div className="toast-container" id="toast-container">
      {toasts.map((t) => (
        <Toast key={t.id} alert={t} />
      ))}
    </div>
  )
}

function Toast({ alert }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="toast toast--danger">
      <span className="toast__icon">{TYPE_EMOJIS[alert.type] || '⚠️'}</span>
      <div>
        <div className="toast__message">
          {TYPE_MSG[alert.type] || 'Nueva alerta de seguridad'}
        </div>
        <div className="toast__sub">
          {alert.camera_id} • Ahora mismo
        </div>
      </div>
    </div>
  )
}
