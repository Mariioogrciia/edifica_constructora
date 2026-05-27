/**
 * App.jsx – Dashboard principal de Edifica Constructora.
 * v3: Sidebar navigation + Camera Command Center.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import AlertModal from './components/AlertModal.jsx'
import ToastContainer from './components/Toast.jsx'
import SettingsConsole from './components/SettingsConsole.jsx'
import ZonesMap from './components/ZonesMap.jsx'

const API_BASE = '/api'
const WS_URL = `ws://${window.location.hostname}:8000/api/alerts/ws`

/* ─── SVG Icons ─── */
const I = {
  hardhat: <svg viewBox="0 0 24 24"><path d="M12 2C9.24 2 7 4.24 7 7h2c0-1.66 1.34-3 3-3s3 1.34 3 3h2c0-2.76-2.24-5-5-5zM4 9v2h1v5h2v-5h10v5h2v-5h1V9H4zm0 9v2h16v-2H4z"/></svg>,
  vest: <svg viewBox="0 0 24 24"><path d="M16.5 6l-1-4H8.5l-1 4H3v14h18V6h-4.5zM12 4h1.59l.5 2h-4.18l.5-2H12zM5 18V8h3.09l-.59 2.35L9.5 12l2.5-3 2.5 3 2-1.65L15.91 8H19v10H5z"/></svg>,
  zone: <svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"/></svg>,
  bell: <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>,
  camera: <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  grid: <svg viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zM13 3h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg>,
  alert: <svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
  report: <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>,
  chart: <svg viewBox="0 0 24 24"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/></svg>,
  settings: <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>,
  shield: <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>,
  map: <svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>,
  search: <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>,
  wifi: <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>,
  noSignal: <svg viewBox="0 0 24 24"><path d="M21 11l2-2c-3.73-3.73-8.87-5.15-13.7-4.31l2.58 2.58c3.3-.02 6.61 1.22 9.12 3.73zm-2 2l-2-2c-1.89-1.89-4.39-2.7-6.84-2.56l2.29 2.29c1.24.11 2.44.6 3.41 1.41l1.14 1.14 2-2.28zM9 17l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zM3.41 1.64L2 3.05 5.05 6.1C3.59 6.83 2.22 7.79 1 9l2 2c1.07-1.07 2.32-1.89 3.67-2.49l2.14 2.14C7.41 11.25 6.22 12.12 5.27 13.27L7 15c1.07-1.28 2.58-2.07 4.21-2.35l5.74 5.74 1.41-1.41L3.41 1.64z"/></svg>,
  play: <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>,
  pause: <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
  volume: <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>,
  fullscreen: <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>,
  snapshot: <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>,
  more: <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>,
  add: <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>,
  download: <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>,
}

/* ─── Alert type labels ─── */
const TYPE_LABELS = {
  NO_HARDHAT: { label: 'SIN CASCO', badge: 'alert-badge--hardhat', severity: 'Alta', desc: 'Sin casco detectado' },
  NO_VEST:    { label: 'SIN CHALECO', badge: 'alert-badge--vest', severity: 'Media', desc: 'Sin chaleco detectado' },
  RESTRICTED_ZONE: { label: 'ZONA RESTRINGIDA', badge: 'alert-badge--zone', severity: 'Alta', desc: 'Acceso a zona restringida' },
  NO_MASK:    { label: 'SIN MASCARILLA', badge: 'alert-badge--vest', severity: 'Media', desc: 'Sin mascarilla detectado' },
}

const CAMERA_SECTORS = {
  'CAM-01': 'Sector Estructura', 'CAM-02': 'Zona de Carga',
  'CAM-03': 'Acceso Norte', 'CAM-04': 'Sector Instalaciones', 'CAM-05': 'Acopio Materiales',
}

function formatTime(iso) {
  const date = parseAlertDate(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function parseAlertDate(iso) {
  if (!iso) return new Date(NaN)
  if (iso instanceof Date) return iso
  if (typeof iso === 'string') {
    const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(iso)
    const asUtc = hasTimezone ? iso : `${iso}Z`
    const parsed = new Date(asUtc)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(iso)
}

function formatDateTime(iso) {
  const date = parseAlertDate(iso)
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return date.toLocaleString('es-ES', { hour12: false })
}

function timeAgo(iso, nowMs = Date.now()) {
  const date = parseAlertDate(iso)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  const min = Math.floor((nowMs - date.getTime()) / 60000)
  if (min < 0) return 'Ahora'
  if (min < 1) return 'Ahora'
  if (min < 60) return `Hace ${min} min`
  if (min < 1440) return `Hace ${Math.floor(min / 60)}h ${min % 60}m`
  return `Hace ${Math.floor(min / 1440)}d`
}

export default function App() {
  const [alerts, setAlerts] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, by_type: {}, employee_count: 0 })
  const [zones, setZones] = useState([])
  const [employees, setEmployees] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [toasts, setToasts] = useState([])
  const [tab, setTab] = useState('pending')
  const [currentView, setCurrentView] = useState('dashboard')
  const [newAlertIds, setNewAlertIds] = useState(new Set())
  const [clockNow, setClockNow] = useState(Date.now())
  const [incidentSearch, setIncidentSearch] = useState('')
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('all')
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('all')
  const [incidentCameraFilter, setIncidentCameraFilter] = useState('all')
  const [incidentDateFilter, setIncidentDateFilter] = useState('all')
  const [incidentZoneFilter, setIncidentZoneFilter] = useState('all')
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const [empForm, setEmpForm] = useState({ code: '', name: '', role: 'Operario' })
  const [empError, setEmpError] = useState('')

  const pushToast = useCallback((toast) => {
    const id = toast.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    setToasts(prev => [...prev.slice(-4), { ...toast, id }])
  }, [])

  // ── Fetchers ──
  const fetchAlerts = useCallback(async () => {
    try {
      const url = tab === 'all' ? `${API_BASE}/alerts?limit=100` : `${API_BASE}/alerts?limit=100&resolved=${tab === 'resolved'}`
      const res = await fetch(url)
      if (res.ok) setAlerts(await res.json())
    } catch (e) { console.warn('Fetch alerts err:', e) }
  }, [tab])
  const fetchStats = useCallback(async () => { try { const r = await fetch(`${API_BASE}/stats`); if (r.ok) setStats(await r.json()) } catch {} }, [])
  const fetchZones = useCallback(async () => { try { const r = await fetch(`${API_BASE}/zones`); if (r.ok) setZones(await r.json()) } catch {} }, [])
  const fetchEmployees = useCallback(async () => { try { const r = await fetch(`${API_BASE}/employees`); if (r.ok) setEmployees(await r.json()) } catch {} }, [])
  const resolveAlert = useCallback(async (id, resolved) => { try { await fetch(`${API_BASE}/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved }) }); fetchAlerts(); fetchStats() } catch {} }, [fetchAlerts, fetchStats])
  const createEmployee = useCallback(async (e) => { e.preventDefault(); setEmpError(''); if (!empForm.code.trim()||!empForm.name.trim()) { setEmpError('Campos obligatorios.'); return } try { const r = await fetch(`${API_BASE}/employees`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(empForm) }); if (r.ok) { setEmpForm({code:'',name:'',role:'Operario'}); fetchEmployees(); fetchStats() } else { const d=await r.json(); setEmpError(d.detail||'Error') } } catch { setEmpError('Sin conexión.') } }, [empForm, fetchEmployees, fetchStats])
  const deleteEmployee = useCallback(async (id) => { try { await fetch(`${API_BASE}/employees/${id}`, {method:'DELETE'}); fetchEmployees(); fetchStats() } catch {} }, [fetchEmployees, fetchStats])

  // ── WebSocket ──
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS_URL); wsRef.current = ws
    ws.onopen = () => { setWsConnected(true) }
    ws.onmessage = (event) => { try { const data = JSON.parse(event.data); if (data.event==='alert_updated') { fetchAlerts(); fetchStats(); return } setAlerts(p=>[data,...p]); setNewAlertIds(p=>new Set([...p,data.id])); pushToast(data); fetchStats(); setTimeout(()=>{setNewAlertIds(p=>{const n=new Set(p);n.delete(data.id);return n})},3000) } catch {} }
    ws.onclose = () => { setWsConnected(false); reconnectTimer.current = setTimeout(connectWs, 3000) }
    ws.onerror = () => { ws.close() }
  }, [fetchAlerts, fetchStats, pushToast])

  useEffect(() => { fetchAlerts(); fetchStats(); fetchZones(); fetchEmployees(); connectWs(); const i=setInterval(()=>{fetchAlerts();fetchStats()},15000); return ()=>{clearInterval(i);clearTimeout(reconnectTimer.current);wsRef.current?.close()} }, []) // eslint-disable-line
  useEffect(() => { fetchAlerts() }, [fetchAlerts])
  useEffect(() => { if (!toasts.length) return; const t=setTimeout(()=>setToasts(p=>p.slice(1)),5500); return ()=>clearTimeout(t) }, [toasts])
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])

  // ── Camera config ──
  const CAMERAS = [
    { id: 'CAM-01', name: 'Entrada Principal', status: 'online', videoUrl: `http://${window.location.hostname}:8000/videos/Realistic_full_body_safety_mon (1).mp4` },
    { id: 'CAM-02', name: 'Zona de Carga', status: 'online', videoUrl: `http://${window.location.hostname}:8000/videos/mp_.mp4` },
    { id: 'CAM-03', name: 'Planta Alta', status: 'online', videoUrl: `http://${window.location.hostname}:8000/videos/Create_a_realistic_safety_moni.mp4` },
    { id: 'CAM-04', name: 'Sótano', status: 'offline' },
    { id: 'CAM-05', name: 'Acopio Materiales', status: 'online' },
    
  ]

  const pendingAlerts = alerts.filter(a => !a.resolved)
  const byType = stats.by_type || {}
  const [featuredCamId, setFeaturedCamId] = useState(CAMERAS[0].id)
  const featuredCam = CAMERAS.find(c => c.id === featuredCamId) || CAMERAS[0]
  const secondaryCams = CAMERAS.filter(c => c.id !== featuredCamId)
  const nowTime = new Date(clockNow).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  const incidentRows = alerts
    .map(a => {
      const typeInfo = TYPE_LABELS[a.type] || { label: a.type, severity: 'Baja', badge: 'alert-badge--vest', desc: a.type }
      const eventDate = parseAlertDate(a.timestamp)
      const severity = typeInfo.severity || 'Baja'
      return {
        ...a,
        typeLabel: typeInfo.label,
        typeDesc: typeInfo.desc,
        severity,
        severityKey: severity.toLowerCase(),
        zone: CAMERA_SECTORS[a.camera_id] || 'Sector General',
        statusLabel: a.resolved ? 'Resuelta' : 'Pendiente',
        eventDate,
      }
    })
    .sort((a, b) => {
      const rank = { Alta: 3, Media: 2, Baja: 1 }
      const bySeverity = (rank[b.severity] || 1) - (rank[a.severity] || 1)
      if (bySeverity !== 0) return bySeverity
      return b.eventDate - a.eventDate
    })

  const incidentsFiltered = incidentRows.filter(row => {
    const q = incidentSearch.trim().toLowerCase()
    const matchSearch = !q || row.camera_id.toLowerCase().includes(q) || row.zone.toLowerCase().includes(q) || row.typeLabel.toLowerCase().includes(q)
    const matchType = incidentTypeFilter === 'all' || row.type === incidentTypeFilter
    const matchSeverity = incidentSeverityFilter === 'all' || row.severity === incidentSeverityFilter
    const matchCamera = incidentCameraFilter === 'all' || row.camera_id === incidentCameraFilter
    const matchZone = incidentZoneFilter === 'all' || row.zone === incidentZoneFilter

    const ageMs = clockNow - row.eventDate.getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const matchDate = incidentDateFilter === 'all'
      || (incidentDateFilter === 'today' && row.eventDate.toDateString() === new Date(clockNow).toDateString())
      || (incidentDateFilter === '24h' && ageMs <= dayMs)
      || (incidentDateFilter === '7d' && ageMs <= 7 * dayMs)

    return matchSearch && matchType && matchSeverity && matchCamera && matchDate && matchZone
  })

  const kpiPending = incidentsFiltered.filter(i => !i.resolved).length
  const kpiResolved = incidentsFiltered.filter(i => i.resolved).length
  const kpiHigh = incidentsFiltered.filter(i => i.severity === 'Alta').length
  const kpiMedium = incidentsFiltered.filter(i => i.severity === 'Media').length
  const prioritizedIncident = incidentsFiltered.find(i => i.severity === 'Alta') || incidentsFiltered[0] || null
  const incidentTypeOptions = Array.from(new Set(incidentRows.map(i => i.type)))
  const incidentCameraOptions = Array.from(new Set(incidentRows.map(i => i.camera_id)))
  const incidentZoneOptions = Array.from(new Set(incidentRows.map(i => i.zone)))

  // ── Sidebar nav items ──
  const navItems = [
    { id: 'cameras', icon: I.camera, label: 'Cámaras' },
    { id: 'dashboard', icon: I.grid, label: 'Dashboard' },
    { id: 'incidents', icon: I.bell, label: 'Incidencias' },
    { id: 'reports', icon: I.report, label: 'Reportes' },
    { id: 'settings', icon: I.settings, label: 'Configuración' },
  ]

  // ── Page title per view ──
  const viewTitles = {
    cameras: 'Centro de control de cámaras',
    dashboard: 'Dashboard de Seguridad Laboral',
    incidents: 'Incidencias activas',
    reports: 'Reportes',
    settings: 'Configuración',
  }

  return (
    <div className="app-shell">
      {/* ═══════ SIDEBAR ═══════ */}
      <aside className="sidebar">
        <div className="sidebar-logo">{I.hardhat}</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${currentView === item.id ? 'sidebar-item--active' : ''}`}
              onClick={() => setCurrentView(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-avatar">AD</div>
          <div className="sidebar-user-name">Admin<br/>Seguridad</div>
          <div className="sidebar-user-status">En línea</div>
        </div>
      </aside>

      {/* ═══════ MAIN AREA ═══════ */}
      <div className="main-area">
        {/* ── Top Bar ── */}
        <div className="top-bar">
          <div className="top-bar__brand">
            <div className="top-bar__title">{viewTitles[currentView] || 'Edifica Constructora'}</div>
            <div className="top-bar__meta">
              Monitoreo en tiempo real de obra
              <span style={{ margin: '0 4px' }}>·</span>
              <span className="top-bar__meta-dot"></span>
              Sistema operativo
            </div>
          </div>

          {currentView === 'cameras' && (
            <div className="top-bar__filters">
              <div className="top-bar__filter">
                <span className="top-bar__filter-label">Proyecto</span>
                <select className="top-bar__filter-select">
                  <option>Edifica Constructora</option>
                </select>
              </div>
              <div className="top-bar__filter">
                <span className="top-bar__filter-label">Sede / Obra</span>
                <select className="top-bar__filter-select">
                  <option>Torre Norte</option>
                </select>
              </div>
              <div className="top-bar__filter">
                <span className="top-bar__filter-label">Nivel / Zona</span>
                <select className="top-bar__filter-select">
                  <option>Todas las zonas</option>
                </select>
              </div>
            </div>
          )}

          {currentView !== 'incidents' && (
            <>
              <div className="top-bar__search">
                {I.search}
                <input type="text" placeholder="Buscar cámaras..." />
              </div>
              <button className="top-bar__action">Salir de zona</button>
            </>
          )}
        </div>

        {/* ── Page Content ── */}
        <div className="page-content">

          {/* ════════ CAMERAS VIEW ════════ */}
          {currentView === 'cameras' && (
            <div className="cameras-layout">
              {/* ── COL 1: Featured Camera & Stats ── */}
              <div className="cameras-col-1">
                <div className="cam-card panel--hero">
                  <div className="cam-card__header">
                    <div>
                      <div className="cam-card__label">Cámara destacada</div>
                      <div className="cam-card__name">{featuredCam.name} <span className="cam-card__name-id">({featuredCam.id})</span></div>
                    </div>
                    <span className="cam-status cam-status--recording"><span className="cam-status__dot"></span> Grabando</span>
                  </div>
                  <div className="cam-feed cam-feed--featured">
                    {featuredCam.videoUrl ? (
                      <video
                          src={featuredCam.videoUrl} controls loop muted playsInline
                        />
                    ) : (
                      <div className="cam-feed__placeholder">{I.wifi}<div className="cam-feed__placeholder-text">Stream local activo</div></div>
                    )}
                    <div className="cam-ts">{nowTime}</div>
                  </div>
                  {/* IA analytics removed */}
                </div>

                <div className="stats-overview">
                  <div className="stats-overview__title">Vista general de cámaras</div>
                  <div className="stats-overview__grid">
                    <div className="stat-block">
                      <div className="stat-block__label">Total cámaras</div>
                      <div className="stat-block__row">
                        <span className="stat-block__value">{CAMERAS.length}</span>
                        <span className="stat-block__icon" style={{fill:'var(--text-muted)'}}>{I.camera}</span>
                      </div>
                      <div className="stat-block__sub">Cámaras instaladas</div>
                    </div>
                    <div className="stat-block">
                      <div className="stat-block__label">En línea</div>
                      <div className="stat-block__row">
                        <span className="stat-block__value">{CAMERAS.filter(c=>c.status==='online').length}</span>
                        <span className="stat-block__icon" style={{fill:'var(--color-emerald)'}}>{I.wifi}</span>
                      </div>
                      <div className="stat-block__sub">{Math.round(CAMERAS.filter(c=>c.status==='online').length/CAMERAS.length*100)}% del total</div>
                    </div>
                    <div className="stat-block">
                      <div className="stat-block__label">Grabando</div>
                      <div className="stat-block__row">
                        <span className="stat-block__value">{CAMERAS.filter(c=>c.status==='online'&&c.videoUrl).length}</span>
                        <span className="stat-block__icon" style={{fill:'var(--color-blue)'}}>{I.camera}</span>
                      </div>
                      <div className="stat-block__sub">Cámaras activas</div>
                    </div>
                    <div className="stat-block stat-block--danger">
                      <div className="stat-block__label">Sin señal</div>
                      <div className="stat-block__row">
                        <span className="stat-block__value">{CAMERAS.filter(c=>c.status==='offline').length}</span>
                        <span className="stat-block__icon" style={{fill:'var(--color-red)'}}>{I.noSignal}</span>
                      </div>
                      <div className="stat-block__sub">Requieren atención</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── COL 2: Secondary Cameras ── */}
              <div className="cameras-col-2">
                <div className="cam-secondary-grid">
                  {secondaryCams.map(cam => (
                    <div className="cam-card" key={cam.id} onClick={() => setFeaturedCamId(cam.id)} style={{cursor:'pointer'}}>
                      <div className="cam-card__header">
                        <div className="cam-card__name">{cam.name} <span className="cam-card__name-id">({cam.id})</span></div>
                        <span className={`cam-status ${cam.status === 'online' ? 'cam-status--recording' : 'cam-status--nosignal'}`}>
                          <span className="cam-status__dot"></span>
                          {cam.status === 'online' ? 'Grabando' : 'Sin señal'}
                        </span>
                      </div>
                      <div className="cam-feed cam-feed--secondary">
                        {cam.status === 'online' ? (
                          cam.videoUrl ? (
                            <video
                              src={cam.videoUrl} muted playsInline loop
                              onPlay={async (e) => { if (e.target.dataset.started==='true') return; e.target.dataset.started='true'; try { await fetch(`${API_BASE}/analyze/start?camera_id=${cam.id}&video_url=${encodeURIComponent(cam.videoUrl)}`, {method:'POST'}) } catch {} }}
                              onPause={async (e) => { const v=e.target; setTimeout(async()=>{if(v.paused){v.dataset.started='false';try{await fetch(`${API_BASE}/analyze/stop?camera_id=${cam.id}`,{method:'POST'})}catch{}}},500) }}
                              onMouseEnter={(e) => e.target.play().catch(()=>{})}
                              onMouseLeave={(e) => e.target.pause()}
                            />
                          ) : (
                            <div className="cam-feed__placeholder">
                              <svg style={{width:36,height:36,fill:'var(--text-muted)',opacity:0.3}} viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
                              <div className="cam-feed__placeholder-text">Stream local activo</div>
                              <div className="cam-feed__placeholder-sub">(Conexión Edge-First Offline)</div>
                            </div>
                          )
                        ) : (
                          <div className="cam-feed__nosignal">
                            {I.noSignal}
                            <div className="cam-feed__nosignal-text">Sin señal de vídeo</div>
                            <div className="cam-feed__nosignal-sub">Verificar conexión o alimentación</div>
                          </div>
                        )}
                        <div className="cam-ts">{nowTime}</div>
                        <div className="cam-controls">
                          <button title="Captura">{I.snapshot}</button>
                          <button title="Pantalla completa">{I.fullscreen}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── COL 3: Right Panel (Activity, Incidents, Actions) ── */}
              <div className="right-panel">
                {/* Activity */}
                <div className="panel panel--flex panel--compact">
                  <div className="panel-header">
                      <h3 className="panel-title">Actividad reciente</h3>
                      <button className="panel-action" onClick={() => setCurrentView('incidents')}>Ver todo</button>
                    </div>
                  <div className="panel-body">
                    {pendingAlerts.slice(0, 4).map(a => {
                      const ti = TYPE_LABELS[a.type] || { desc: a.type }
                      const iconColor = a.type === 'NO_HARDHAT' ? 'activity-icon--red' : a.type === 'NO_VEST' ? 'activity-icon--amber' : a.type === 'RESTRICTED_ZONE' ? 'activity-icon--red' : 'activity-icon--blue'
                      return (
                        <div className="activity-item" key={`act-${a.id}`}>
                          <div className={`activity-icon ${iconColor}`}>{I.bell}</div>
                          <div className="activity-info">
                            <div className="activity-cam">{a.camera_id} ({CAMERA_SECTORS[a.camera_id]?.split(' ').pop() || ''})</div>
                            <div className="activity-desc">{ti.desc}</div>
                          </div>
                          <div className="activity-time">{timeAgo(a.timestamp, clockNow)}</div>
                        </div>
                      )
                    })}
                    {pendingAlerts.length === 0 && <div className="empty-state"><div className="empty-state__text">Sin actividad</div></div>}
                  </div>
                </div>

                {/* Incidents */}
                <div className="panel panel--flex panel--compact">
                  <div className="panel-header">
                    <h3 className="panel-title">Incidencias activas</h3>
                    <button className="panel-action" onClick={() => setCurrentView('incidents')}>Ver todas</button>
                  </div>
                  <div className="panel-body" style={{ padding: '6px 0' }}>
                    {pendingAlerts.slice(0, 3).map((a, i) => {
                      const severities = ['alta', 'media', 'baja']
                      const sev = severities[i] || 'media'
                      const ti = TYPE_LABELS[a.type] || { desc: a.type }
                      return (
                        <div className={`incident-card incident-card--${sev}`} key={`inc-${a.id}`}>
                          <div>
                            <div className="incident-text">{ti.desc} ({a.camera_id})</div>
                            <div className="incident-sub">{timeAgo(a.timestamp, clockNow)}</div>
                          </div>
                          <span className={`incident-severity incident-severity--${sev}`}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="actions-panel">
                  <div className="actions-panel__title">Acciones rápidas</div>
                  <div className="actions-grid">
                    <button className="action-btn">{I.add} Agregar cámara</button>
                    <button className="action-btn">{I.download} Exportar reporte</button>
                    <button className="action-btn">{I.map} Ver mapa de obra</button>
                    <button className="action-btn">{I.settings} Configurar alertas</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════ DASHBOARD VIEW ════════ */}
          {currentView === 'dashboard' && (
            <>
              <div className="kpi-row">
                <div className="kpi-card"><div className="kpi-icon kpi-icon--hardhat">{I.hardhat}</div><div className="kpi-body"><div className="kpi-label">Sin casco</div><div className="kpi-value">{byType.NO_HARDHAT||0}</div><div className="kpi-unit">Personas</div><div className="kpi-trend"><span className="kpi-trend-badge kpi-trend-badge--down">↓ 20%</span><span className="kpi-trend-label">vs. ayer</span></div></div></div>
                <div className="kpi-card"><div className="kpi-icon kpi-icon--vest">{I.vest}</div><div className="kpi-body"><div className="kpi-label">Sin chaleco</div><div className="kpi-value">{byType.NO_VEST||0}</div><div className="kpi-unit">Personas</div><div className="kpi-trend"><span className="kpi-trend-badge kpi-trend-badge--up">↑ 33%</span><span className="kpi-trend-label">vs. ayer</span></div></div></div>
                <div className="kpi-card"><div className="kpi-icon kpi-icon--zone">{I.zone}</div><div className="kpi-body"><div className="kpi-label">Zona restringida</div><div className="kpi-value">{byType.RESTRICTED_ZONE||0}</div><div className="kpi-unit">Incidentes</div><div className="kpi-trend"><span className="kpi-trend-badge kpi-trend-badge--up">↑ 50%</span><span className="kpi-trend-label">vs. ayer</span></div></div></div>
                <div className="kpi-card"><div className="kpi-icon kpi-icon--alerts">{I.bell}</div><div className="kpi-body"><div className="kpi-label">Alertas activas</div><div className="kpi-value">{stats.pending||0}</div><div className="kpi-unit">Alertas</div><div className="kpi-trend"><span className="kpi-trend-badge kpi-trend-badge--down">↓ 11%</span><span className="kpi-trend-label">vs. ayer</span></div></div></div>
              </div>
              <div className="bento-grid">
                <div className="panel dashboard-alerts-panel">
                  <div className="panel-header"><h2 className="panel-title">Alertas recientes</h2><button className="panel-action" onClick={() => setCurrentView('incidents')}>Ver todas</button></div>
                  <div className="panel-body">
                    {pendingAlerts.slice(0,5).map(a => { const ti=TYPE_LABELS[a.type]||{label:a.type,badge:'alert-badge--hardhat',severity:'Media',desc:a.type}; return (
                      <div className="alert-item" key={a.id} onClick={()=>setSelectedAlert(a)}>
                        <div className="alert-thumb">{a.snapshot_path && <img src={a.snapshot_path} alt="" loading="lazy"/>}</div>
                        <div className="alert-info"><div className={`alert-badge ${ti.badge}`}>{ti.label}</div><div className="alert-meta"><strong>{a.camera_id}</strong> · {CAMERA_SECTORS[a.camera_id]||'Sector General'}</div><div className="alert-meta-sub">{timeAgo(a.timestamp, clockNow)} · {formatTime(a.timestamp)}</div></div>
                        <div className={`alert-severity alert-severity--${ti.severity.toLowerCase()}`}>{ti.severity}</div><span className="alert-arrow">›</span>
                      </div>
                    )})}
                    {pendingAlerts.length===0&&<div className="empty-state"><div className="empty-state__text">Sin alertas</div></div>}
                  </div>
                  <div className="panel-footer">Mostrando {Math.min(pendingAlerts.length,5)} de {pendingAlerts.length} alertas</div>
                </div>
                <div className="panel panel--hero dashboard-zones-panel">
                  <div className="panel-header"><h2 className="panel-title">Zonas restringidas</h2><button className="panel-action" onClick={() => setCurrentView('zones')}>Gestionar</button></div>
                  <div className="zones-map-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><ZonesMap mode="read-only" zones={zones} /></div>
                  <div className="panel-footer zones-footer-stats" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 'var(--sp-xl)' }}>
                      <div className="zones-footer-stat"><span className="zones-footer-dot" style={{background:'var(--color-red)'}}></span>Zonas activas <strong style={{color:'var(--text-primary)',marginLeft:'4px'}}>{zones.length || 3}</strong></div>
                      <div className="zones-footer-stat"><span className="zones-footer-dot" style={{background:'var(--color-blue)'}}></span>Zonas configuradas <strong style={{color:'var(--text-primary)',marginLeft:'4px'}}>{(zones.length || 3) + 2}</strong></div>
                    </div>
                    <div style={{ textAlign: 'right', lineHeight: '1.2' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Total área</div>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>1,240 m²</strong>
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'var(--sp-xl)'}}>
                  <div className="panel panel--compact">
                    <div className="panel-header">
                        <h2 className="panel-title">Cámaras activas</h2>
                        <button className="panel-action" onClick={()=>setCurrentView('cameras')}>Ver todas</button>
                      </div>
                    <div className="cameras-mini-grid">
                      {CAMERAS.slice(0,4).map(c => (
                        <div className="camera-mini" key={c.id} onClick={() => setFeaturedCamId(c.id)} style={{cursor:'pointer'}}>
                          <div className="camera-mini__feed">
                            {c.status === 'online' ? (
                              c.videoUrl ? (
                                <video
                                  src={c.videoUrl}
                                  muted
                                  playsInline
                                  loop
                                  preload="metadata"
                                  onMouseEnter={(e) => e.target.play().catch(() => {})}
                                  onMouseLeave={(e) => e.target.pause()}
                                />
                              ) : (
                                <span style={{color:'var(--text-muted)',fontSize:'0.7rem'}}>Stream local activo</span>
                              )
                            ) : (
                              <span style={{color:'var(--text-muted)',fontSize:'0.7rem'}}>Sin señal</span>
                            )}
                          </div>
                          <div className="camera-mini__info">
                            <span className="camera-mini__name">{c.id} · {c.name.split(' ')[0]}</span>
                            <span className={`camera-mini__status camera-mini__status--${c.status}`}>{c.status === 'online' ? 'En línea' : 'Sin señal'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="panel panel--ghost" style={{flex:1}}>
                    <div className="panel-header"><h2 className="panel-title">Timeline</h2><button className="panel-action" onClick={() => setCurrentView('incidents')}>Ver todos</button></div>
                    <div className="panel-body timeline-list">{pendingAlerts.slice(0,5).map(a=>{const ti=TYPE_LABELS[a.type]||{desc:a.type};const dc=a.type==='NO_HARDHAT'?'timeline-dot--hardhat':a.type==='NO_VEST'?'timeline-dot--vest':'timeline-dot--zone';return(<div className="timeline-item" key={`tl-${a.id}`}><span className={`timeline-dot ${dc}`}></span><span className="timeline-time">{timeAgo(a.timestamp, clockNow)}</span><span className="timeline-desc">{ti.desc}</span><span className="timeline-cam">{a.camera_id}</span></div>)})}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════════ INCIDENTS VIEW ════════ */}
          {currentView === 'incidents' && (
            <div className="incidents-page">
              <div className="incidents-page-header">
                <div>
                  <h1 className="incidents-page-title">Incidencias activas</h1>
                  <div className="incidents-page-subtitle">Monitorización en tiempo real de obra <span className="incidents-op-status"><span className="incidents-op-dot"></span>Operativo</span></div>
                </div>
                <div className="incidents-page-actions">
                  <div className="incidents-search">{I.search}<input value={incidentSearch} onChange={(e)=>setIncidentSearch(e.target.value)} type="text" placeholder="Buscar por cámara, zona o tipo..." /></div>
                  <button className="top-bar__action">Salir de zona</button>
                </div>
              </div>

              <div className="incidents-kpi-row">
                <div className="inc-kpi-card"><div className="inc-kpi-label">Pendientes</div><div className="inc-kpi-value">{kpiPending}</div></div>
                <div className="inc-kpi-card inc-kpi-card--high"><div className="inc-kpi-label">Altas</div><div className="inc-kpi-value">{kpiHigh}</div></div>
                <div className="inc-kpi-card inc-kpi-card--medium"><div className="inc-kpi-label">Medias</div><div className="inc-kpi-value">{kpiMedium}</div></div>
                <div className="inc-kpi-card inc-kpi-card--resolved"><div className="inc-kpi-label">Resueltas</div><div className="inc-kpi-value">{kpiResolved}</div></div>
              </div>

              <div className="incidents-filters-bar">
                <div className="incidents-tabs">
                  <button className={`inc-tab ${tab==='pending'?'inc-tab--active':''}`} onClick={()=>setTab('pending')}>Pendientes</button>
                  <button className={`inc-tab ${tab==='all'?'inc-tab--active':''}`} onClick={()=>setTab('all')}>Todas</button>
                  <button className={`inc-tab ${tab==='resolved'?'inc-tab--active':''}`} onClick={()=>setTab('resolved')}>Resueltas</button>
                </div>
                <div className="incidents-filters-grid">
                  <select className="inc-filter" value={incidentTypeFilter} onChange={(e)=>setIncidentTypeFilter(e.target.value)}>
                    <option value="all">Tipo: Todos</option>
                    {incidentTypeOptions.map(t => <option key={t} value={t}>{TYPE_LABELS[t]?.label || t}</option>)}
                  </select>
                  <select className="inc-filter" value={incidentSeverityFilter} onChange={(e)=>setIncidentSeverityFilter(e.target.value)}>
                    <option value="all">Severidad: Todas</option>
                    <option value="Alta">Alta</option><option value="Media">Media</option><option value="Baja">Baja</option>
                  </select>
                  <select className="inc-filter" value={incidentCameraFilter} onChange={(e)=>setIncidentCameraFilter(e.target.value)}>
                    <option value="all">Cámara: Todas</option>
                    {incidentCameraOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="inc-filter" value={incidentDateFilter} onChange={(e)=>setIncidentDateFilter(e.target.value)}>
                    <option value="all">Fecha: Todas</option>
                    <option value="today">Hoy</option><option value="24h">Últimas 24h</option><option value="7d">Últimos 7 días</option>
                  </select>
                  <select className="inc-filter" value={incidentZoneFilter} onChange={(e)=>setIncidentZoneFilter(e.target.value)}>
                    <option value="all">Zona: Todas</option>
                    {incidentZoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>

              {prioritizedIncident && (
                <div className={`incident-priority-card incident-priority-card--${prioritizedIncident.severityKey}`}>
                  <div className="incident-priority-head">Incidencia prioritaria</div>
                  <div className="incident-priority-main">
                    <div className="incident-priority-title">{prioritizedIncident.typeLabel} · {prioritizedIncident.camera_id}</div>
                    <div className="incident-priority-meta">{prioritizedIncident.zone} · {timeAgo(prioritizedIncident.timestamp, clockNow)} · {formatDateTime(prioritizedIncident.timestamp)}</div>
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={() => setSelectedAlert(prioritizedIncident)}>Ver detalle</button>
                </div>
              )}

              <div className="panel incidents-list-panel">
                <div className="panel-header incidents-list-panel__header">
                  <h2 className="panel-title">Lista operativa de incidencias</h2>
                  <div className="incidents-list-count">{incidentsFiltered.length} resultados</div>
                </div>
                <div className="panel-body incidents-list-body">
                  {incidentsFiltered.map((a, idx) => (
                    <div className={`incident-row ${a.severityKey === 'alta' ? 'incident-row--high' : ''} ${idx === 0 ? 'incident-row--first' : ''}`} key={a.id} onClick={()=>setSelectedAlert(a)}>
                      <div className="incident-thumb">{a.snapshot_path ? <img src={a.snapshot_path} alt="" loading="lazy"/> : <div className="incident-thumb-empty">{I.camera}</div>}</div>
                      <div className="incident-main">
                        <div className="incident-main-top">
                          <span className={`incident-type-badge incident-type-badge--${a.severityKey}`}>{a.typeLabel}</span>
                          <span className={`incident-status-chip ${a.resolved ? 'incident-status-chip--resolved' : 'incident-status-chip--pending'}`}>{a.statusLabel}</span>
                        </div>
                        <div className="incident-cam-line"><strong>{a.camera_id}</strong> · {a.zone}</div>
                        <div className="incident-time-line">{timeAgo(a.timestamp, clockNow)} · {formatDateTime(a.timestamp)}</div>
                      </div>
                      <div className="incident-severity-col">
                        <span className={`incident-severity-badge incident-severity-badge--${a.severityKey}`}>{a.severity}</span>
                      </div>
                      <div className="incident-actions" onClick={(e)=>e.stopPropagation()}>
                        <button className="inc-action-btn" onClick={() => setSelectedAlert(a)}>Ver detalle</button>
                        {!a.resolved && <button className="inc-action-btn" onClick={() => resolveAlert(a.id, true)}>Resolver</button>}
                        {a.resolved && <button className="inc-action-btn" onClick={() => resolveAlert(a.id, false)}>Reabrir</button>}
                        <button className="inc-action-btn" onClick={() => { setFeaturedCamId(a.camera_id); setCurrentView('cameras') }}>Abrir cámara</button>
                      </div>
                    </div>
                  ))}
                  {incidentsFiltered.length === 0 && <div className="empty-state"><div className="empty-state__text">No hay incidencias con estos filtros</div></div>}
                </div>
              </div>
            </div>
          )}

          {/* ════════ SETTINGS / REPORTS / ANALYTICS (placeholders) ════════ */}
          {currentView === 'settings' && (
            <SettingsConsole
              cameras={CAMERAS}
              zones={zones}
              onNotify={pushToast}
            />
          )}

          {currentView === 'reports' && (
            <div className="panel" style={{maxWidth:600}}><div className="panel-body"><div className="empty-state" style={{padding:'80px var(--sp-lg)'}}><div className="empty-state__text">Módulo de {viewTitles[currentView]} en desarrollo</div></div></div></div>
          )}

          {/* ════════ ZONES (from dashboard link) ════════ */}
          {currentView === 'zones' && (
            <div className="panel panel--flex">
              <div className="panel-header"><h2 className="panel-title">Zonas restringidas</h2></div>
              <div className="panel-body" style={{ flex: 1, display: 'flex', padding: 0 }}>
                <ZonesMap mode="edit" zones={zones} fetchZones={fetchZones} />
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="page-footer">
          <span>© 2026 Edifica Constructora. Todos los derechos reservados.</span>
          <span>Powered by Edge-First Architecture</span>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} onResolve={resolveAlert} />
    </div>
  )
}
