import React from 'react'

function severityClass(sev) {
  if (!sev) return 'info'
  if (sev.toLowerCase().includes('alta') || sev.toLowerCase().includes('critical') ) return 'critical'
  if (sev.toLowerCase().includes('media') || sev.toLowerCase().includes('warning')) return 'warning'
  return 'info'
}

export default function AlertRow({ alert, onView, onResolve }) {
  const sev = severityClass(alert.severity || alert.level || '')
  return (
    <div className="alert-row">
      <div className="alert-row__thumb" aria-hidden />
      <div className="alert-row__body">
        <div className="alert-row__top">
          <div className="alert-row__badge">{alert.type || alert.label}</div>
          <div className="alert-row__meta">{new Date(alert.timestamp || Date.now()).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="alert-row__title">{alert.camera_name || alert.camera_id || alert.camera}</div>
        <div className="alert-row__sub">{alert.zone || alert.sector || ''}</div>
      </div>
      <div className={`alert-row__severity alert-row__severity--${sev}`}>{alert.severity || (sev==='critical'?'Alta':'Media')}</div>
      <button className="alert-row__action" onClick={() => onView && onView(alert)} aria-label="Ver">›</button>
    </div>
  )
}
