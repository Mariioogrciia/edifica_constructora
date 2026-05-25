/**
 * AlertCard – Tarjeta individual de alerta con thumbnail, tipo, timestamp y acciones.
 */
const TYPE_LABELS = {
  NO_HARDHAT: { label: '🪖 Sin Casco', emoji: '🪖' },
  NO_VEST: { label: '🦺 Sin Chaleco', emoji: '🦺' },
  RESTRICTED_ZONE: { label: '⛔ Zona Restringida', emoji: '⛔' },
}

function formatTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Ahora mismo'
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AlertCard({ alert, onResolve, onView, isNew = false }) {
  const typeInfo = TYPE_LABELS[alert.type] || { label: alert.type, emoji: '⚠️' }

  return (
    <div
      className={`alert-card ${isNew ? 'alert-card--new' : ''}`}
      onClick={() => onView?.(alert)}
      id={`alert-${alert.id}`}
    >
      {alert.snapshot_path ? (
        <img
          className="alert-card__thumbnail"
          src={alert.snapshot_path}
          alt={`Evidencia alerta ${alert.id}`}
          loading="lazy"
        />
      ) : (
        <div className="alert-card__thumbnail alert-card__thumbnail--placeholder">
          {typeInfo.emoji}
        </div>
      )}

      <div className="alert-card__content">
        <span className={`alert-card__type alert-card__type--${alert.type}`}>
          {typeInfo.label}
        </span>
        <div className="alert-card__meta">
          <span className="alert-card__camera">📹 {alert.camera_id}</span>
          <span>•</span>
          <span>{formatTime(alert.timestamp)}</span>
        </div>
      </div>

      <div className="alert-card__actions" onClick={(e) => e.stopPropagation()}>
        {!alert.resolved ? (
          <button
            className="btn btn--success btn--sm"
            onClick={() => onResolve?.(alert.id, true)}
            title="Marcar como resuelta"
          >
            ✓
          </button>
        ) : (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onResolve?.(alert.id, false)}
            title="Reabrir alerta"
          >
            ↩
          </button>
        )}
      </div>
    </div>
  )
}
