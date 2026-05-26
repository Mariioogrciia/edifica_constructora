import React from 'react'

export default function KpiCard({ label, value, trend, status }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__header">
        <span className="kpi-card__label">{label}</span>
      </div>
      <div className="kpi-card__value">{value}</div>
      <div className="kpi-card__footer">
        <span className="kpi-card__trend">{trend}</span>
        <span className={`kpi-card__status kpi-card__status--${(status||'pending').toLowerCase()}`}>{status}</span>
      </div>
    </div>
  )
}
