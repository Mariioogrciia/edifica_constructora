/**
 * AlertCard – Tarjeta individual de alerta con thumbnail, tipo, timestamp y acciones.
 */
const TYPE_LABELS = {
  NO_HARDHAT: { label: '🪖 SIN CASCO', emoji: '🪖', priority: 'Alta', color: 'var(--alert-hardhat)' },
  NO_VEST: { label: '🦺 SIN CHALECO', emoji: '🦺', priority: 'Media', color: 'var(--alert-vest)' },
  NO_MASK: { label: '😷 SIN MASCARILLA', emoji: '😷', priority: 'Media', color: 'var(--accent-purple)' },
  RESTRICTED_ZONE: { label: '⛔ ZONA RESTRINGIDA', emoji: '⛔', priority: 'Alta', color: 'var(--alert-zone)' },
}

function formatTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Hoy • Ahora mismo'
  if (diffMin < 60) return `Hoy • Hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hoy • Hace ${diffH}h`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AlertCard({ alert, onResolve, onView, isNew = false }) {
  const typeInfo = TYPE_LABELS[alert.type] || { label: alert.type, emoji: '⚠️', priority: 'Baja', color: 'var(--text-muted)' }

  return (
    <div
      className={`alert-card ${isNew ? 'alert-card--new' : ''}`}
      style={{ padding: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--bg-glass-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s ease' }}
      onClick={() => onView?.(alert)}
      id={`alert-${alert.id}`}
    >
      {alert.snapshot_path ? (
        <img
          className="alert-card__thumbnail"
          src={alert.snapshot_path}
          alt={`Evidencia alerta ${alert.id}`}
          loading="lazy"
          style={{ width: '80px', height: '56px', borderRadius: '4px', objectFit: 'cover' }}
        />
      ) : (
        <div className="alert-card__thumbnail alert-card__thumbnail--placeholder" style={{ width: '80px', height: '56px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
          {typeInfo.emoji}
        </div>
      )}

      <div className="alert-card__content" style={{ flex: 1 }}>
        <div style={{ display: 'inline-block', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${typeInfo.color}`, borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, color: typeInfo.color, marginBottom: '6px' }}>
          {typeInfo.label}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
          <span style={{ fontWeight: 600 }}>{alert.camera_id}</span> • Sector Operativo
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {formatTime(alert.timestamp)}
        </div>
      </div>

      <div className="alert-card__actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: typeInfo.color }}>
          {typeInfo.priority}
        </div>
        {!alert.resolved ? (
          <button
            className="btn btn--sm"
            style={{ background: 'transparent', border: '1px solid var(--bg-glass-border)', color: 'var(--text-secondary)', width: '28px', height: '28px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => onResolve?.(alert.id, true)}
            title="Marcar como resuelta"
          >
            ✓
          </button>
        ) : (
          <button
            className="btn btn--sm"
            style={{ background: 'transparent', border: '1px solid var(--bg-glass-border)', color: 'var(--text-secondary)', width: '28px', height: '28px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
