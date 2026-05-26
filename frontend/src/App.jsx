/**
 * App.jsx – Dashboard principal de Edifica Constructora.
 *
 * Conecta con el Backend local vía REST + WebSocket para mostrar
 * alertas en tiempo real, estadísticas, zonas restringidas y empleados.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import StatCard from './components/StatCard.jsx'
import AlertCard from './components/AlertCard.jsx'
import AlertModal from './components/AlertModal.jsx'
import ToastContainer from './components/Toast.jsx'
import CameraControlCenter from './components/CameraControlCenter.jsx'

const API_BASE = '/api'
const WS_URL = `ws://${window.location.hostname}:8000/api/alerts/ws`

export default function App() {
  // ── State ──
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, by_type: {}, employee_count: 0 })
  const [zones, setZones] = useState([])
  const [employees, setEmployees] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [toasts, setToasts] = useState([])
  const [tab, setTab] = useState('pending')  // 'pending' | 'resolved' | 'all'
  const [currentView, setCurrentView] = useState('dashboard') // 'dashboard' | 'cameras' | 'employees'
  const [newAlertIds, setNewAlertIds] = useState(new Set())
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  // ── Employee form state ──
  const [empForm, setEmpForm] = useState({ code: '', name: '', role: 'Operario' })
  const [empError, setEmpError] = useState('')

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

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/employees`)
      if (res.ok) setEmployees(await res.json())
    } catch (e) {
      console.warn('Error fetching employees:', e)
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

  // ── Employee CRUD ──
  const createEmployee = useCallback(async (e) => {
    e.preventDefault()
    setEmpError('')
    if (!empForm.code.trim() || !empForm.name.trim()) {
      setEmpError('Código y nombre son obligatorios.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empForm),
      })
      if (res.ok) {
        setEmpForm({ code: '', name: '', role: 'Operario' })
        fetchEmployees()
        fetchStats()
      } else {
        const data = await res.json()
        setEmpError(data.detail || 'Error al crear empleado.')
      }
    } catch (err) {
      setEmpError('No se pudo conectar con el backend.')
    }
  }, [empForm, fetchEmployees, fetchStats])

  const deleteEmployee = useCallback(async (id) => {
    try {
      await fetch(`${API_BASE}/employees/${id}`, { method: 'DELETE' })
      fetchEmployees()
      fetchStats()
    } catch (e) {
      console.warn('Error deleting employee:', e)
    }
  }, [fetchEmployees, fetchStats])

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
    fetchEmployees()
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
        <div className="app-header__nav" style={{ display: 'flex', flex: 1, justifyContent: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${currentView === 'dashboard' ? 'tab--active' : ''}`} onClick={() => setCurrentView('dashboard')}>
              📊 Dashboard
            </button>
            <button className={`tab ${currentView === 'cameras' ? 'tab--active' : ''}`} onClick={() => setCurrentView('cameras')}>
              📹 Cámaras
            </button>
            <button className={`tab ${currentView === 'employees' ? 'tab--active' : ''}`} onClick={() => setCurrentView('employees')}>
              👷 Empleados
            </button>
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

        {/* ════════════════════════ DASHBOARD VIEW ════════════════════════ */}
        {currentView === 'dashboard' && (
          <>
            {/* Stats */}
            <section className="stats-grid" id="stats-grid">
              <StatCard icon="📊" value={stats.total} label="Total Alertas" variant="total" />
              <StatCard icon="🚨" value={stats.pending} label="Pendientes" variant="pending" />
              <StatCard icon="✅" value={stats.resolved} label="Resueltas" variant="resolved" />
              <StatCard icon="👷" value={stats.employee_count || 0} label="Empleados" variant="zones" />
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
                  icon="😷"
                  value={stats.by_type.NO_MASK || 0}
                  label="Sin Mascarilla"
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

            {/* Tabs de estado global (opcional) */}
            <div className="section-header">
              <h1 className="section-title">
                🔔 Panel Operativo
              </h1>
            </div>

            {/* Bento Grid */}
            <div className="bento-grid">
              
              {/* Columna Izquierda: Alertas */}
              <div className="alerts-panel">
                <div className="alerts-panel__header">
                  <span className="alerts-panel__title">Alertas Recientes</span>
                  <div className="tabs" style={{ marginBottom: 0 }}>
                    <button className={`tab ${tab === 'pending' ? 'tab--active' : ''}`} onClick={() => setTab('pending')} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Pendientes</button>
                    <button className={`tab ${tab === 'all' ? 'tab--active' : ''}`} onClick={() => setTab('all')} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Todas</button>
                  </div>
                </div>
                <div className="alerts-panel__body">
                  {alerts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state__icon">🛡️</div>
                      <div className="empty-state__text">No hay alertas. El sistema está monitoreando.</div>
                    </div>
                  ) : (
                    alerts.slice(0, 10).map((alert) => (
                      <AlertCard key={alert.id} alert={alert} isNew={newAlertIds.has(alert.id)} onResolve={resolveAlert} onView={setSelectedAlert} />
                    ))
                  )}
                </div>
              </div>

              {/* Columna Central: Zonas (Mapa) */}
              <div className="zones-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="section-header" style={{ marginBottom: 'var(--space-sm)' }}>
                  <span className="section-title">🗺️ Mapa de Zonas Restringidas</span>
                </div>
                <div style={{ flex: 1, background: 'rgba(15, 22, 36, 0.5)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', position: 'relative' }}>
                  {zones.length === 0 ? (
                     <div className="empty-state">
                       <div className="empty-state__icon">📐</div>
                       <div className="empty-state__text">No hay zonas configuradas.</div>
                     </div>
                  ) : (
                     <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                       <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.5 }}>🏗️</div>
                       <div style={{ fontSize: '0.85rem' }}>{zones.length} Zonas Activas</div>
                       <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.6 }}>(Integración de plano en progreso)</div>
                     </div>
                  )}
                </div>
              </div>

              {/* Columna Derecha: Cámaras & Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {/* Cámaras Activas mini */}
                <div className="alerts-panel" style={{ height: 'auto', maxHeight: '300px' }}>
                  <div className="alerts-panel__header">
                    <span className="alerts-panel__title">Cámaras Activas</span>
                  </div>
                  <div className="alerts-panel__body" style={{ padding: 'var(--space-md)' }}>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                        {[
                          { id: 'CAM-01', status: 'online' },
                          { id: 'CAM-02', status: 'online' },
                          { id: 'CAM-03', status: 'online' },
                          { id: 'CAM-04', status: 'offline' }
                        ].map(c => (
                          <div key={c.id} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--bg-glass-border)', overflow: 'hidden' }}>
                             <div style={{ height: '60px', background: c.status === 'online' ? 'rgba(5, 150, 105, 0.05)' : 'rgba(220, 38, 38, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>{c.status === 'online' ? '📹' : '🚫'}</span>
                             </div>
                             <div style={{ padding: '4px 6px', fontSize: '0.65rem', textAlign: 'center', background: 'var(--bg-card)', borderTop: '1px solid var(--bg-glass-border)' }}>
                                {c.id} • <span style={{ color: c.status === 'online' ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{c.status}</span>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="alerts-panel" style={{ flex: 1, minHeight: '250px' }}>
                  <div className="alerts-panel__header">
                    <span className="alerts-panel__title">Timeline de incidentes</span>
                  </div>
                  <div className="alerts-panel__body" style={{ gap: 'var(--space-md)' }}>
                    {alerts.slice(0, 5).map(a => (
                      <div key={`tl-${a.id}`} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', fontSize: '0.8rem' }}>
                         <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: a.type === 'NO_HARDHAT' ? 'var(--alert-hardhat)' : a.type === 'NO_VEST' ? 'var(--alert-vest)' : 'var(--alert-zone)' }}></div>
                         <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                           {new Date(a.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                         </div>
                         <div style={{ flex: 1, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {a.type}
                         </div>
                         <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{a.camera_id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════ CAMERAS VIEW ════════════════════════ */}
        {currentView === 'cameras' && (
          <CameraControlCenter />
        )}

        {/* ════════════════════════ EMPLOYEES VIEW ════════════════════════ */}
        {currentView === 'employees' && (
          <section>
            <div className="section-header">
              <h1 className="section-title">👷 Gestión de Empleados</h1>
              <span className="section-title__count" style={{ marginLeft: '8px' }}>{employees.length}</span>
            </div>

            <div className="alerts-container" id="employees-section">
              {/* Formulario de alta */}
              <div className="zones-panel">
                <div className="section-header" style={{ marginBottom: 'var(--space-md)' }}>
                  <span className="section-title">➕ Registrar Empleado</span>
                </div>
                <form onSubmit={createEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Código</label>
                    <input
                      id="emp-code"
                      type="text"
                      placeholder="EMP-001"
                      value={empForm.code}
                      onChange={(e) => setEmpForm(prev => ({ ...prev, code: e.target.value }))}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--bg-glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Nombre Completo</label>
                    <input
                      id="emp-name"
                      type="text"
                      placeholder="Juan Pérez García"
                      value={empForm.name}
                      onChange={(e) => setEmpForm(prev => ({ ...prev, name: e.target.value }))}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--bg-glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Cargo / Puesto</label>
                    <select
                      id="emp-role"
                      value={empForm.role}
                      onChange={(e) => setEmpForm(prev => ({ ...prev, role: e.target.value }))}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--bg-glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-family)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    >
                      <option value="Operario">Operario</option>
                      <option value="Encargado de Obra">Encargado de Obra</option>
                      <option value="Jefe de Seguridad">Jefe de Seguridad</option>
                      <option value="Ingeniero">Ingeniero</option>
                      <option value="Electricista">Electricista</option>
                      <option value="Fontanero">Fontanero</option>
                      <option value="Soldador">Soldador</option>
                      <option value="Gruista">Gruista</option>
                    </select>
                  </div>

                  {empError && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-red)', padding: '8px 12px', background: 'var(--accent-red-glow)', borderRadius: 'var(--radius-sm)' }}>
                      {empError}
                    </div>
                  )}

                  <button type="submit" className="btn btn--primary" style={{ marginTop: '4px' }}>
                    ✓ Registrar Empleado
                  </button>
                </form>
              </div>

              {/* Lista de empleados */}
              <div className="alerts-panel">
                <div className="alerts-panel__header">
                  <span className="alerts-panel__title">📋 Plantilla Registrada ({employees.length})</span>
                </div>
                <div className="alerts-panel__body">
                  {employees.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state__icon">👷</div>
                      <div className="empty-state__text">
                        No hay empleados registrados. Usa el formulario para dar de alta a los trabajadores de la obra.
                      </div>
                    </div>
                  ) : (
                    employees.map((emp) => (
                      <div className="alert-card" key={emp.id} id={`employee-${emp.id}`}>
                        <div className="alert-card__thumbnail alert-card__thumbnail--placeholder" style={{ background: 'rgba(59, 130, 246, 0.12)' }}>
                          👷
                        </div>
                        <div className="alert-card__content">
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{emp.name}</span>
                          <div className="alert-card__meta">
                            <span style={{ fontFamily: 'monospace', color: 'var(--accent-blue)' }}>{emp.code}</span>
                            <span>•</span>
                            <span>{emp.role}</span>
                          </div>
                        </div>
                        <div className="alert-card__actions">
                          <button
                            className="btn btn--danger btn--sm"
                            onClick={() => deleteEmployee(emp.id)}
                            title="Eliminar empleado"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ── Footer / Connection Bar ── */}
      <div className="connection-bar">
        <div className="connection-bar__left">
          <span>Edifica Constructora v0.2.0</span>
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
