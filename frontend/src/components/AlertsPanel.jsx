import React from 'react'
import AlertRow from './AlertRow'

export default function AlertsPanel({ alerts = [], tab = 'pending', setTab, onView, onResolve }) {
  const items = tab === 'all' ? alerts : alerts.filter(a => !a.resolved)

  return (
    <div className="dashboard-panel dashboard-panel--large alerts-panel--custom">
      <div className="panel-header">
        <h2 className="panel-title">Alertas recientes</h2>
        <div className="panel-controls">
          <button className={`filter-btn ${tab === 'pending' ? 'filter-btn--active' : ''}`} onClick={() => setTab && setTab('pending')}>Pendientes</button>
          <button className={`filter-btn ${tab === 'all' ? 'filter-btn--active' : ''}`} onClick={() => setTab && setTab('all')}>Todas</button>
        </div>
      </div>
      <div className="panel-body alerts-list">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__text">Sin alertas</div>
          </div>
        ) : (
          items.slice(0, 20).map(a => (
            <AlertRow key={a.id} alert={a} onView={onView} onResolve={onResolve} />
          ))
        )}
      </div>
    </div>
  )
}
