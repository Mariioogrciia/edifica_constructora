/**
 * App.jsx – Dashboard principal de Edifica Constructora.
 *
 * Conecta con el Backend local vía REST + WebSocket para mostrar
 * alertas en tiempo real, estadísticas y zonas restringidas.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import StatCard from './components/StatCard.jsx'
import AlertCard from './components/AlertCard.jsx'
import AlertModal from './components/AlertModal.jsx'
import ToastContainer from './components/Toast.jsx'

const API_BASE = '/api'
const WS_URL = `ws://${window.location.hostname}:8000/api/alerts/ws`

export default function App() {
  // ── State ──
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, by_type: {} })
  const [zones, setZones] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [toasts, setToasts] = useState([])
  const [tab, setTab] = useState('pending')  // 'pending' | 'resolved' | 'all'
  const [newAlertIds, setNewAlertIds] = useState(new Set())
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  // ── Fetch Helpers ──
  const fetchAlerts = useCallback(async () => {
    try {
      const url = tab === 'all'
        ? `${API_BASE}/alerts?limit=100`
        : `${API_BASE}/alerts?limit=100&resolved=${tab === 'resolved'}`
      const res = await fetch(url)
      if (res.ok) setAlerts(await res.json())
    } catch (e) {
      console.warn('Error fetching alerts:', e)
    }
  }, [tab])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`)
      if (res.ok) setStats(await res.json())
    } catch (e) {
      console.warn('Error fetching stats:', e)
    }
  }, [])

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/zones`)
      if (res.ok) setZones(await res.json())
    } catch (e) {
      console.warn('Error fetching zones:', e)
    }
  }, [])

  // ── Resolve Alert ──
  const resolveAlert = useCallback(async (id, resolved) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      })
      fetchAlerts()
      fetchStats()
    } catch (e) {
      console.warn('Error resolving alert:', e)
    }
  }, [fetchAlerts, fetchStats])

  // ── WebSocket ──
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      console.log('[WS] Conectado')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === 'alert_updated') {
          // Una alerta existente fue actualizada
          fetchAlerts()
          fetchStats()
          return
        }
        // Nueva alerta
        setAlerts((prev) => [data, ...prev])
        setNewAlertIds((prev) => new Set([...prev, data.id]))
        setToasts((prev) => [...prev.slice(-4), data]) // Max 5 toasts
        fetchStats()

        // Quitar la marca de "nueva" después de 3 segundos
        setTimeout(() => {
          setNewAlertIds((prev) => {
            const next = new Set(prev)
            next.delete(data.id)
            return next
          })
        }, 3000)
      } catch (e) {
        console.warn('[WS] Error parsing message:', e)
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
      console.log('[WS] Desconectado. Reintentando en 3s…')
      reconnectTimer.current = setTimeout(connectWs, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [fetchAlerts, fetchStats])

  // ── Effects ──
  useEffect(() => {
    fetchAlerts()
    fetchStats()
    fetchZones()
    connectWs()

    // Polling como fallback cada 15s
    const interval = setInterval(() => {
      fetchAlerts()
      fetchStats()
    }, 15000)

    return () => {
      clearInterval(interval)
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch cuando cambia el tab
  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // ── Limpiar toasts antiguos ──
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 5500)
    return () => clearTimeout(timer)
  }, [toasts])

  // ── Render ──
  const pendingAlerts = alerts.filter((a) => !a.resolved)
  const resolvedAlerts = alerts.filter((a) => a.resolved)

  return (
    <div className="app-layout">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__logo">E</div>
          <div>
            <div className="app-header__title">Edifica Constructora</div>
            <div className="app-header__subtitle">Dashboard de Seguridad Laboral</div>
          </div>
        </div>
        <div className="app-header__status">
          <span className={`status-badge ${wsConnected ? 'status-badge--online' : 'status-badge--offline'}`}>
            <span className={`status-dot ${wsConnected ? 'status-dot--online' : 'status-dot--offline'}`} />
            {wsConnected ? 'En Línea' : 'Sin Conexión'}
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">
        {/* Stats */}
        <section className="stats-grid" id="stats-grid">
          <StatCard icon="📊" value={stats.total} label="Total Alertas" variant="total" />
          <StatCard icon="🚨" value={stats.pending} label="Pendientes" variant="pending" />
          <StatCard icon="✅" value={stats.resolved} label="Resueltas" variant="resolved" />
          <StatCard icon="🗺️" value={zones.length} label="Zonas Restringidas" variant="zones" />
        </section>

        {/* Breakdown por tipo */}
        {stats.by_type && Object.keys(stats.by_type).length > 0 && (
          <section className="stats-grid" style={{ marginBottom: 'var(--space-xl)' }}>
            <StatCard
              icon="🪖"
              value={stats.by_type.NO_HARDHAT || 0}
              label="Sin Casco"
              variant="pending"
            />
            <StatCard
              icon="🦺"
              value={stats.by_type.NO_VEST || 0}
              label="Sin Chaleco"
              variant="pending"
            />
            <StatCard
              icon="⛔"
              value={stats.by_type.RESTRICTED_ZONE || 0}
              label="Zona Restringida"
              variant="pending"
            />
          </section>
        )}

        {/* Tabs */}
        <div className="section-header">
          <h1 className="section-title">
            🔔 Alertas de Seguridad
            {stats.pending > 0 && <span className="section-title__count">{stats.pending}</span>}
          </h1>
          <div className="tabs" id="alert-tabs">
            <button className={`tab ${tab === 'pending' ? 'tab--active' : ''}`} onClick={() => setTab('pending')}>
              Pendientes
            </button>
            <button className={`tab ${tab === 'resolved' ? 'tab--active' : ''}`} onClick={() => setTab('resolved')}>
              Resueltas
            </button>
            <button className={`tab ${tab === 'all' ? 'tab--active' : ''}`} onClick={() => setTab('all')}>
              Todas
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="alerts-container" id="alerts-list">
          <div className="alerts-panel">
            <div className="alerts-panel__header">
              <span className="alerts-panel__title">
                {tab === 'pending' && `🔴 Pendientes (${pendingAlerts.length})`}
                {tab === 'resolved' && `🟢 Resueltas (${resolvedAlerts.length})`}
                {tab === 'all' && `📋 Todas (${alerts.length})`}
              </span>
            </div>
            <div className="alerts-panel__body">
              {alerts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__icon">🛡️</div>
                  <div className="empty-state__text">
                    No hay alertas {tab === 'pending' ? 'pendientes' : tab === 'resolved' ? 'resueltas' : ''} por el momento. El sistema está monitoreando.
                  </div>
                </div>
              ) : (
                alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    isNew={newAlertIds.has(alert.id)}
                    onResolve={resolveAlert}
                    onView={setSelectedAlert}
                  />
                ))
              )}
            </div>
          </div>

          {/* Zones Panel */}
          <div className="zones-panel">
            <div className="section-header" style={{ marginBottom: 'var(--space-md)' }}>
              <span className="section-title">🗺️ Zonas Restringidas</span>
            </div>
            {zones.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">📐</div>
                <div className="empty-state__text">
                  No hay zonas restringidas configuradas. Usa la API POST /api/zones para añadir polígonos.
                </div>
              </div>
            ) : (
              <div className="zone-list">
                {zones.map((zone) => (
                  <div className="zone-item" key={zone.id} id={`zone-${zone.id}`}>
                    <div className="zone-item__info">
                      <div className="zone-item__icon">🔷</div>
                      <div>
                        <div className="zone-item__name">{zone.name}</div>
                        <div className="zone-item__points">
                          {zone.polygon_points.length} puntos definidos
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer / Connection Bar ── */}
      <div className="connection-bar">
        <div className="connection-bar__left">
          <span>Edifica Constructora v0.1.0</span>
          <span>•</span>
          <span>Edge-First Architecture</span>
        </div>
        <span>{new Date().toLocaleDateString('es-ES', { dateStyle: 'full' })}</span>
      </div>

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} />

      {/* ── Alert Detail Modal ── */}
      <AlertModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onResolve={resolveAlert}
      />
    </div>
  )
}
