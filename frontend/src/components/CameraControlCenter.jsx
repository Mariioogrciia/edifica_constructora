/**
 * CameraControlCenter.jsx
 *
 * Centro de control operativo de cámaras premium.
 * - Cámara principal destacada
 * - Cuadrícula de cámaras secundarias
 * - Panel lateral de actividad reciente
 * - Dark mode premium con azul petróleo
 */

import { useState, useEffect } from 'react'

const API_BASE = '/api'

// ─── Camera Data ───────────────────────────────────────────
const MOCK_CAMERAS = [
  {
    id: 'CAM-01',
    name: 'Entrada Principal',
    status: 'recording', // 'recording' | 'stream' | 'offline'
    videoUrl: `http://${window.location.hostname}:8000/videos/Realistic_full_body_safety_mon (1).mp4`,
    timestamp: new Date(),
    lastAlertType: 'NO_HARDHAT',
    hasPendingAlert: true,
  },
  {
    id: 'CAM-02',
    name: 'Zona de Carga',
    status: 'recording',
    videoUrl: `http://${window.location.hostname}:8000/videos/mp_.mp4`,
    timestamp: new Date(),
    lastAlertType: null,
    hasPendingAlert: false,
  },
  {
    id: 'CAM-03',
    name: 'Planta Alta',
    status: 'stream',
    timestamp: new Date(),
    lastAlertType: 'NO_VEST',
    hasPendingAlert: true,
  },
  {
    id: 'CAM-04',
    name: 'Sótano',
    status: 'offline',
    timestamp: new Date(),
    lastAlertType: null,
    hasPendingAlert: false,
  },
  {
    id: 'CAM-05',
    name: 'Escaleras Emergencia',
    status: 'recording',
    timestamp: new Date(),
    lastAlertType: null,
    hasPendingAlert: false,
  },
  {
    id: 'CAM-06',
    name: 'Oficinas',
    status: 'stream',
    timestamp: new Date(),
    lastAlertType: 'RESTRICTED_ZONE',
    hasPendingAlert: true,
  },
]

// ─── Activity Data ───────────────────────────────────────────
const MOCK_ACTIVITY = [
  {
    id: 'evt-1',
    camera: 'CAM-01',
    type: 'NO_HARDHAT',
    label: 'Sin casco detectado',
    severity: 'critical',
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: 'evt-2',
    camera: 'CAM-02',
    type: 'NO_VEST',
    label: 'Sin chaleco detectado',
    severity: 'critical',
    timestamp: new Date(Date.now() - 240000),
  },
  {
    id: 'evt-3',
    camera: 'CAM-03',
    type: 'recording_started',
    label: 'Grabación iniciada',
    severity: 'info',
    timestamp: new Date(Date.now() - 360000),
  },
  {
    id: 'evt-4',
    camera: 'CAM-06',
    type: 'RESTRICTED_ZONE',
    label: 'Acceso a zona restringida',
    severity: 'critical',
    timestamp: new Date(Date.now() - 480000),
  },
  {
    id: 'evt-5',
    camera: 'CAM-04',
    type: 'connection_lost',
    label: 'Conexión perdida',
    severity: 'warning',
    timestamp: new Date(Date.now() - 600000),
  },
]

export default function CameraControlCenter() {
  const [cameras, setCameras] = useState(MOCK_CAMERAS)
  const [primaryCameraId, setPrimaryCameraId] = useState('CAM-01')
  const [activity, setActivity] = useState(MOCK_ACTIVITY)
  const [filter, setFilter] = useState('all') // 'all' | 'alerts' | 'online'

  // Auto-promote camera with active alert to primary
  useEffect(() => {
    const alertCamera = cameras.find(c => c.hasPendingAlert && c.status !== 'offline')
    if (alertCamera && primaryCameraId === 'CAM-01') {
      setPrimaryCameraId(alertCamera.id)
    }
  }, [cameras, primaryCameraId])

  const primaryCamera = cameras.find(c => c.id === primaryCameraId)
  const secondaryCameras = cameras.filter(c => c.id !== primaryCameraId)

  const filteredActivity = filter === 'alerts'
    ? activity.filter(a => ['NO_HARDHAT', 'NO_VEST', 'RESTRICTED_ZONE'].includes(a.type))
    : filter === 'online'
      ? activity.filter(a => !['connection_lost'].includes(a.type))
      : activity

  const formatTime = (date) => {
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 60) return 'Hace segundos'
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="camera-control-center">
      {/* ─── Header ─── */}
      <div className="camera-header">
        <div className="camera-header__left">
          <h1 className="camera-header__title">Centro de Control de Cámaras</h1>
          <p className="camera-header__subtitle">Monitoreo en tiempo real de seguridad laboral</p>
        </div>
        <div className="camera-header__controls">
          <div className="filter-chips">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'alerts', label: 'Alertas Activas' },
              { id: 'online', label: 'En Línea' },
            ].map(f => (
              <button
                key={f.id}
                className={`filter-chip ${filter === f.id ? 'filter-chip--active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Main Layout: Primary + Secondary + Sidebar ─── */}
      <div className="camera-layout">
        
        {/* ─── Primary Camera Area ─── */}
        <div className="camera-primary-section">
          {primaryCamera && (
            <div className="camera-card--primary">
              <div className="camera-card__header--primary">
                <div className="camera-card__info--primary">
                  <h2 className="camera-card__name--primary">{primaryCamera.name}</h2>
                  <span className="camera-card__id">{primaryCamera.id}</span>
                </div>
                <div className="camera-status-indicator" data-status={primaryCamera.status}>
                  {primaryCamera.status === 'recording' && (
                    <span className="status-chip status-chip--recording">Grabando</span>
                  )}
                  {primaryCamera.status === 'stream' && (
                    <span className="status-chip status-chip--stream">Stream local activo</span>
                  )}
                  {primaryCamera.status === 'offline' && (
                    <span className="status-chip status-chip--offline">Sin señal</span>
                  )}
                </div>
              </div>

              {/* Video Feed */}
              <div className="camera-card__video--primary">
                {primaryCamera.status === 'offline' ? (
                  <div className="video-placeholder">
                    <div className="video-placeholder__icon">DESCONECTADO</div>
                    <div className="video-placeholder__text">Cámara sin conexión</div>
                  </div>
                ) : primaryCamera.videoUrl ? (
                  <video
                    src={primaryCamera.videoUrl}
                    controls
                    loop
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onPlay={async (e) => {
                      if (e.target.dataset.started === 'true') return
                      e.target.dataset.started = 'true'
                      try {
                        const url = `${API_BASE}/analyze/start?camera_id=${primaryCamera.id}&video_url=${encodeURIComponent(primaryCamera.videoUrl || '')}`
                        await fetch(url, { method: 'POST' })
                      } catch (err) {
                        console.error('Error al iniciar análisis:', err)
                      }
                    }}
                  />
                ) : (
                  <div className="video-placeholder">
                    <div className="video-placeholder__icon">CONECTADO</div>
                    <div className="video-placeholder__text">Stream en vivo</div>
                  </div>
                )}

                {/* AI Overlay Indicators */}
                {primaryCamera.lastAlertType && primaryCamera.status !== 'offline' && (
                  <div className="ai-overlay">
                    <div className="ai-badge">
                      {primaryCamera.lastAlertType === 'NO_HARDHAT' && 'Sin casco'}
                      {primaryCamera.lastAlertType === 'NO_VEST' && 'Sin chaleco'}
                      {primaryCamera.lastAlertType === 'RESTRICTED_ZONE' && 'Zona restringida'}
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div className="video-timestamp">
                  {new Date().toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>

              {/* Footer con info */}
              <div className="camera-card__footer--primary">
                <div className="camera-card__meta--primary">
                  <span className="meta-item">Actualización: {formatTime(primaryCamera.timestamp)}</span>
                  {primaryCamera.hasPendingAlert && (
                    <span className="meta-item meta-item--alert">Alerta Pendiente</span>
                  )}
                </div>
                <div className="camera-controls--primary">
                  <button className="btn-icon" title="Expandir pantalla">
                    <span>⛶</span>
                  </button>
                  <button className="btn-icon" title="Grabar">
                    <span>⏺</span>
                  </button>
                  <button className="btn-icon" title="Más opciones">
                    <span>⋯</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Secondary Cameras Grid */}
          <div className="secondary-cameras-grid">
            {secondaryCameras.map(cam => (
              <div
                key={cam.id}
                className={`camera-card--secondary ${primaryCameraId === cam.id ? 'secondary--active' : ''}`}
                onClick={() => setPrimaryCameraId(cam.id)}
                role="button"
                tabIndex={0}
              >
                {/* Header */}
                <div className="camera-card__header--secondary">
                  <div className="camera-card__info--secondary">
                    <h3 className="camera-card__name--secondary">{cam.name}</h3>
                    <span className="camera-card__id--secondary">{cam.id}</span>
                  </div>
                  {cam.hasPendingAlert && (
                    <div className="alert-indicator">●</div>
                  )}
                </div>

                {/* Video */}
                <div className="camera-card__video--secondary">
                  {cam.status === 'offline' ? (
                    <div className="video-placeholder--secondary">DESCONECTADO</div>
                  ) : cam.videoUrl ? (
                    <video
                      src={cam.videoUrl}
                      loop
                      muted
                      playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="video-placeholder--secondary">EN VIVO</div>
                  )}

                  {/* Status Chip */}
                  <div className="camera-status-chip" data-status={cam.status}>
                    {cam.status === 'recording' && 'Grabando'}
                    {cam.status === 'stream' && 'Stream'}
                    {cam.status === 'offline' && 'Sin señal'}
                  </div>

                  {/* Timestamp */}
                  <div className="video-timestamp--secondary">
                    {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Sidebar: Activity Panel ─── */}
        <aside className="activity-sidebar">
          <div className="activity-header">
            <h2 className="activity-title">Actividad Reciente</h2>
            <span className="activity-count">{filteredActivity.length}</span>
          </div>

          <div className="activity-list">
            {filteredActivity.length === 0 ? (
              <div className="empty-activity">
                <div className="empty-activity__text">Sin actividad en este período</div>
              </div>
            ) : (
              filteredActivity.map(evt => (
                <div
                  key={evt.id}
                  className={`activity-item activity-item--${evt.severity}`}
                  data-type={evt.type}
                >
                  {/* Severity Indicator */}
                  <div className="activity-severity">●</div>

                  {/* Content */}
                  <div className="activity-content">
                    <div className="activity-label">{evt.label}</div>
                    <div className="activity-meta">
                      <span className="activity-camera">{evt.camera}</span>
                      <span className="activity-time">{formatTime(evt.timestamp)}</span>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    className="activity-action"
                    onClick={() => setPrimaryCameraId(evt.camera)}
                    title={`Ver ${evt.camera}`}
                  >
                    →
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
