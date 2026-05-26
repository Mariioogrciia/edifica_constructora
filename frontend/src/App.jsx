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
        <div className="app-header__left">
          <div className="app-header__brand">
            <div className="app-header__logo">E</div>
            <div className="app-header__info">
              <h1 className="app-header__title">Edifica Constructora</h1>
              <p className="app-header__subtitle">Centro de Seguridad Laboral</p>
            </div>
          </div>
        </div>

        <nav className="app-header__nav">
          <button
            className={`nav-button ${currentView === 'dashboard' ? 'nav-button--active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-button ${currentView === 'cameras' ? 'nav-button--active' : ''}`}
            onClick={() => setCurrentView('cameras')}
          >
            Cámaras
          </button>
          <button
            className={`nav-button ${currentView === 'employees' ? 'nav-button--active' : ''}`}
            onClick={() => setCurrentView('employees')}
          >
            Empleados
          </button>
        </nav>

        <div className="app-header__status">
          <div className={`status-indicator ${wsConnected ? 'status-indicator--online' : 'status-indicator--offline'}`}>
            <span className="status-indicator__dot"></span>
            <span className="status-indicator__text">{wsConnected ? 'En línea' : 'Sin conexión'}</span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* ════════════════════════ DASHBOARD VIEW ════════════════════════ */}
        {currentView === 'dashboard' && (
          <div className="dashboard-view">
            {/* KPI Row - Primary Metrics */}
            <div className="kpi-row">
              <div className="kpi-card">
                <div className="kpi-card__header">
                  <span className="kpi-card__label">Sin Casco</span>
                </div>
                <div className="kpi-card__value">{stats.by_type?.NO_HARDHAT || 0}</div>
                <div className="kpi-card__footer">
                  <span className="kpi-card__trend">-2 vs ayer</span>
                  <span className="kpi-card__status kpi-card__status--warning">Crítico</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__header">
                  <span className="kpi-card__label">Sin Chaleco</span>
                </div>
                <div className="kpi-card__value">{stats.by_type?.NO_VEST || 0}</div>
                <div className="kpi-card__footer">
                  <span className="kpi-card__trend">+1 vs ayer</span>
                  <span className="kpi-card__status kpi-card__status--warning">Crítico</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__header">
                  <span className="kpi-card__label">Zona Restringida</span>
                </div>
                <div className="kpi-card__value">{stats.by_type?.RESTRICTED_ZONE || 0}</div>
                <div className="kpi-card__footer">
                  <span className="kpi-card__trend">Sin cambios</span>
                  <span className="kpi-card__status kpi-card__status--critical">Crítico</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card__header">
                  <span className="kpi-card__label">Alertas Activas</span>
                </div>
                <div className="kpi-card__value">{stats.pending || 0}</div>
                <div className="kpi-card__footer">
                  <span className="kpi-card__trend">En espera</span>
                  <span className="kpi-card__status kpi-card__status--pending">Pendiente</span>
                </div>
              </div>
            </div>

            {/* Bento Grid Section */}
            <div className="dashboard-grid">
              {/* Panel Grande: Alertas Recientes */}
              <div className="dashboard-panel dashboard-panel--large" style={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
                <div className="panel-header">
                  <h2 className="panel-title">Alertas Recientes</h2>
                  <div className="panel-controls">
                    <button
                      className={`filter-btn ${tab === 'pending' ? 'filter-btn--active' : ''}`}
                      onClick={() => setTab('pending')}
                    >
                      Pendientes
                    </button>
                    <button
                      className={`filter-btn ${tab === 'all' ? 'filter-btn--active' : ''}`}
                      onClick={() => setTab('all')}
                    >
                      Todas
                    </button>
                  </div>
                </div>
                <div className="panel-body">
                  {alerts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state__icon">✓</div>
                      <div className="empty-state__text">Sistema limpio. Sin alertas activas.</div>
                    </div>
                  ) : (
                    alerts.slice(0, 8).map((alert) => (
                      <AlertCard key={alert.id} alert={alert} isNew={newAlertIds.has(alert.id)} onResolve={resolveAlert} onView={setSelectedAlert} />
                    ))
                  )}
                </div>
              </div>

              {/* Panel: Zonas Restringidas */}
              <div className="dashboard-panel">
                <div className="panel-header">
                  <h2 className="panel-title">Zonas Activas</h2>
                </div>
                <div className="panel-body" style={{ padding: 'var(--space-lg)' }}>
                  {zones.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: '180px' }}>
                      <div className="empty-state__icon">◻</div>
                      <div className="empty-state__text">No hay zonas configuradas</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                      <div className="zone-stat">
                        <span className="zone-stat__label">Total Zonas</span>
                        <span className="zone-stat__value">{zones.length}</span>
                      </div>
                      <div className="zone-stat">
                        <span className="zone-stat__label">Activas</span>
                        <span className="zone-stat__value">{zones.length}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel: Empleados */}
              <div className="dashboard-panel">
                <div className="panel-header">
                  <h2 className="panel-title">Plantilla</h2>
                </div>
                <div className="panel-body" style={{ padding: 'var(--space-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <div className="zone-stat">
                      <span className="zone-stat__label">Trabajadores</span>
                      <span className="zone-stat__value">{stats.employee_count || 0}</span>
                    </div>
                    <div className="zone-stat">
                      <span className="zone-stat__label">En Obra</span>
                      <span className="zone-stat__value">-</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel: Generales */}
              <div className="dashboard-panel">
                <div className="panel-header">
                  <h2 className="panel-title">Estadísticas</h2>
                </div>
                <div className="panel-body" style={{ padding: 'var(--space-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    <div className="zone-stat">
                      <span className="zone-stat__label">Total Alertas</span>
                      <span className="zone-stat__value">{stats.total || 0}</span>
                    </div>
                    <div className="zone-stat">
                      <span className="zone-stat__label">Resueltas</span>
                      <span className="zone-stat__value">{stats.resolved || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
