/**
 * Toast – Notificación temporal que aparece cuando llega una alerta en vivo.
 */
import { useState, useEffect } from 'react'

const TYPE_EMOJIS = {
  NO_HARDHAT: '🪖',
  NO_VEST: '🦺',
  NO_MASK: '😷',
  RESTRICTED_ZONE: '⛔',
}

const TYPE_MSG = {
  NO_HARDHAT: 'Trabajador sin casco detectado',
  NO_VEST: 'Trabajador sin chaleco detectado',
  NO_MASK: 'Trabajador sin mascarilla detectado',
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

  const isGeneric = Boolean(alert.title)
  const toastClass = alert.kind ? `toast--${alert.kind}` : 'toast--danger'
  const icon = isGeneric ? (alert.kind === 'success' ? '✓' : alert.kind === 'info' ? 'ℹ️' : '⚠️') : (TYPE_EMOJIS[alert.type] || '⚠️')
  const title = isGeneric ? alert.title : (TYPE_MSG[alert.type] || 'Nueva alerta de seguridad')
  const sub = isGeneric ? (alert.sub || '') : `${alert.camera_id} • Ahora mismo`

  return (
    <div className={`toast ${toastClass}`}>
      <span className="toast__icon">{icon}</span>
      <div>
        <div className="toast__message">{title}</div>
        {sub && <div className="toast__sub">{sub}</div>}
      </div>
    </div>
  )
}
