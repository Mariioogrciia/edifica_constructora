/**
 * AlertModal – Modal para ver el detalle de una alerta con su snapshot a tamaño completo.
 */
const TYPE_LABELS = {
  NO_HARDHAT: '🪖 Sin Casco de Seguridad',
  NO_VEST: '🦺 Sin Chaleco de Seguridad',
  RESTRICTED_ZONE: '⛔ Acceso a Zona Restringida',
}

export default function AlertModal({ alert, onClose, onResolve }) {
  if (!alert) return null

  return (
    <div className="modal-overlay" onClick={onClose} id="alert-modal">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content__header">
          <span className={`alert-card__type alert-card__type--${alert.type}`}>
            {TYPE_LABELS[alert.type] || alert.type}
          </span>
          <button className="btn btn--ghost btn--icon" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>

        {alert.snapshot_path && (
          <img
            className="modal-content__image"
            src={alert.snapshot_path}
            alt={`Evidencia de ${alert.type}`}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <div><strong style={{ color: 'var(--text-primary)' }}>ID:</strong> #{alert.id}</div>
          <div><strong style={{ color: 'var(--text-primary)' }}>Cámara:</strong> {alert.camera_id}</div>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Fecha/Hora:</strong>{' '}
            {new Date(alert.timestamp).toLocaleString('es-ES', {
              dateStyle: 'medium',
              timeStyle: 'medium',
            })}
          </div>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Estado:</strong>{' '}
            <span style={{ color: alert.resolved ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
              {alert.resolved ? '✓ Resuelta' : '● Pendiente'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          {!alert.resolved ? (
            <button
              className="btn btn--success"
              onClick={() => { onResolve?.(alert.id, true); onClose(); }}
            >
              ✓ Marcar como Resuelta
            </button>
          ) : (
            <button
              className="btn btn--danger"
              onClick={() => { onResolve?.(alert.id, false); onClose(); }}
            >
              ↩ Reabrir Alerta
            </button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
