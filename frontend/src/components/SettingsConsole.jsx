import { useEffect, useMemo, useState } from 'react'

const SECTION_TABS = [
  { id: 'general', label: 'General', desc: 'Obra, idioma y estado' },
  { id: 'cameras', label: 'Cámaras', desc: 'Fuentes, zonas y conexión' },
  { id: 'zones', label: 'Zonas', desc: 'Restricciones y severidad' },
  { id: 'alerts', label: 'Alertas', desc: 'Reglas y cooldowns' },
  { id: 'notifications', label: 'Notificaciones', desc: 'Canales y frecuencia' },
  { id: 'users', label: 'Usuarios', desc: 'Roles y permisos' },
  { id: 'ai', label: 'IA / Detección', desc: 'Umbrales y modo' },
  { id: 'privacy', label: 'Privacidad', desc: 'Retención y evidencias' },
]

const ROLE_LABELS = {
  admin: 'Admin',
  security: 'Responsable de seguridad',
  supervisor: 'Supervisor',
  readOnly: 'Solo lectura',
}

const ALERT_TYPES = [
  { key: 'NO_HARDHAT', label: 'Sin casco' },
  { key: 'NO_VEST', label: 'Sin chaleco' },
  { key: 'RESTRICTED_ZONE', label: 'Zona restringida' },
  { key: 'NO_SIGNAL', label: 'Sin señal de cámara' },
]

const CHANNELS = [
  { id: 'email', label: 'Email', hint: 'Correo operacional y reportes' },
  { id: 'telegram', label: 'Telegram', hint: 'Alertas rápidas de obra' },
  { id: 'teams', label: 'Teams', hint: 'Canal corporativo' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'Simulado para demo' },
]

const DEFAULT_CAMERAS = [
  { id: 'CAM-01', name: 'Entrada principal', description: 'Acceso principal a obra', source: 'rtsp://10.0.1.21/live', zone: 'Acceso Norte', status: 'online', active: true, enabled: true },
  { id: 'CAM-02', name: 'Zona de carga', description: 'Recepción de materiales', source: 'rtsp://10.0.1.22/live', zone: 'Carga y descarga', status: 'online', active: true, enabled: true },
  { id: 'CAM-03', name: 'Planta alta', description: 'Control de circulación interior', source: 'http://localhost:8000/videos/Create_a_realistic_safety_moni.mp4', zone: 'Planta Alta', status: 'online', active: true, enabled: true },
  { id: 'CAM-04', name: 'Sótano', description: 'Zona de servicios', source: 'rtsp://10.0.1.24/live', zone: 'Sótano', status: 'offline', active: false, enabled: false },
]

const DEFAULT_ZONES = [
  { id: 'z1', name: 'Acceso Norte', type: 'Perímetro', severity: 'Alta', schedule: '24/7', camera: 'CAM-01', critical: true, active: true },
  { id: 'z2', name: 'Zona de carga', type: 'Operativa', severity: 'Media', schedule: '06:00 - 20:00', camera: 'CAM-02', critical: false, active: true },
  { id: 'z3', name: 'Sótano', type: 'Restringida', severity: 'Alta', schedule: '24/7', camera: 'CAM-04', critical: true, active: true },
]

const DEFAULT_USERS = [
  { id: 'u1', name: 'Admin Seguridad', email: 'admin@edifica.com', role: 'admin', active: true, permissions: ['Cámaras', 'Zonas', 'Alertas', 'Usuarios'] },
  { id: 'u2', name: 'Supervisor Obra', email: 'supervisor@edifica.com', role: 'supervisor', active: true, permissions: ['Alertas', 'Incidencias'] },
  { id: 'u3', name: 'Lectura General', email: 'lectura@edifica.com', role: 'readOnly', active: false, permissions: ['Dashboard'] },
]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function initialState(cameras = [], zones = []) {
  const cameraList = (cameras.length ? cameras : DEFAULT_CAMERAS).map((camera, index) => ({
    id: camera.id || `CAM-${String(index + 1).padStart(2, '0')}`,
    name: camera.name || camera.label || `Cámara ${index + 1}`,
    description: camera.description || 'Sin descripción',
    source: camera.videoUrl || camera.source || 'rtsp://10.0.1.20/live',
    zone: camera.zone || (index === 0 ? 'Acceso Norte' : index === 1 ? 'Zona de carga' : 'Planta Alta'),
    status: camera.status || 'online',
    active: camera.status !== 'offline',
    enabled: camera.status !== 'offline',
  }))

  const zoneList = (zones.length ? zones : DEFAULT_ZONES).map((zone, index) => ({
    id: zone.id || `zone-${index + 1}`,
    name: zone.name || zone.title || `Zona ${index + 1}`,
    type: zone.type || 'Perímetro',
    severity: zone.severity || 'Media',
    schedule: zone.schedule || '24/7',
    camera: zone.camera || cameraList[index % cameraList.length]?.id || 'CAM-01',
    critical: Boolean(zone.critical ?? zone.isCritical ?? index === 0),
    active: zone.active ?? true,
  }))

  return {
    general: {
      projectName: 'Torre Norte - Edifica Constructora',
      activeSite: 'Torre Norte',
      siteLocation: 'Medellín · Sector Industrial',
      timezone: 'America/Bogota',
      language: 'Español',
      systemStatus: 'Operativo',
      description: 'Panel central de administración para seguridad laboral, videovigilancia y control operativo de obra.',
    },
    cameras: cameraList,
    zones: zoneList,
    alerts: {
      minTriggerSeconds: 5,
      repeatCooldownMinutes: 7,
      types: {
        NO_HARDHAT: { enabled: true, severity: 'Alta', immediate: true },
        NO_VEST: { enabled: true, severity: 'Media', immediate: true },
        RESTRICTED_ZONE: { enabled: true, severity: 'Alta', immediate: true },
        NO_SIGNAL: { enabled: false, severity: 'Media', immediate: false },
      },
      logOnlyIfRepeated: false,
      strictMode: true,
      balancedMode: false,
    },
    notifications: [
      { id: 'email', label: 'Email', enabled: true, recipient: 'operaciones@edifica.com', frequency: 'Inmediato', summary: 'Diario', criticalOnly: false },
      { id: 'telegram', label: 'Telegram', enabled: true, recipient: '@seguridad_edifica', frequency: 'Inmediato', summary: 'N/A', criticalOnly: true },
      { id: 'teams', label: 'Teams', enabled: false, recipient: 'Canal Obra', frequency: 'Cada 15 min', summary: 'Semanal', criticalOnly: false },
      { id: 'whatsapp', label: 'WhatsApp', enabled: false, recipient: 'Grupo Guardia', frequency: 'Inmediato', summary: 'Diario', criticalOnly: true },
    ],
    users: DEFAULT_USERS,
    ai: {
      confidence: 0.84,
      sensitivity: 'Alta',
      persistence: 3,
      falsePositives: 12,
      mode: 'equilibrado',
      detections: {
        NO_HARDHAT: true,
        NO_VEST: true,
        RESTRICTED_ZONE: true,
        NO_SIGNAL: false,
      },
    },
    privacy: {
      retainSnapshots: 30,
      keepEvidence: true,
      reinforcedMode: false,
      eventLog: true,
      incidentExport: true,
      retentionPolicy: '30 días',
    },
  }
}

function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={`settings-card ${className}`.trim()}>
      <div className="settings-card__header">
        <div>
          <h3 className="settings-card__title">{title}</h3>
          {description && <p className="settings-card__desc">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="settings-card__body">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      {children}
      {hint && <span className="settings-field__hint">{hint}</span>}
    </label>
  )
}

function ToggleField({ label, description, checked, onChange, disabled = false }) {
  return (
    <button type="button" className={`toggle-field ${checked ? 'toggle-field--on' : ''}`} onClick={() => !disabled && onChange(!checked)} disabled={disabled}>
      <div className="toggle-field__copy">
        <span className="toggle-field__label">{label}</span>
        {description && <span className="toggle-field__desc">{description}</span>}
      </div>
      <span className="toggle-field__switch" aria-hidden="true">
        <span className="toggle-field__knob" />
      </span>
    </button>
  )
}

function miniId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export default function SettingsConsole({ cameras = [], zones = [], onNotify }) {
  const base = useMemo(() => initialState(cameras, zones), [cameras, zones])
  const [activeTab, setActiveTab] = useState('general')
  const [draft, setDraft] = useState(base)
  const [savedAt, setSavedAt] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [newCameraName, setNewCameraName] = useState('')
  const [newZoneName, setNewZoneName] = useState('')
  const [newUserName, setNewUserName] = useState('')

  useEffect(() => {
    setDraft(base)
    setDirty(false)
    setSavedAt(null)
  }, [base])

  const notify = (payload) => {
    onNotify?.({ id: miniId(), kind: payload.kind || 'success', title: payload.title, sub: payload.sub })
  }

  const markDirty = () => setDirty(true)

  const updateGeneral = (field, value) => {
    setDraft(prev => ({ ...prev, general: { ...prev.general, [field]: value } }))
    markDirty()
  }

  const updateCamera = (id, field, value) => {
    setDraft(prev => ({
      ...prev,
      cameras: prev.cameras.map(camera => camera.id === id ? { ...camera, [field]: value } : camera),
    }))
    markDirty()
  }

  const updateZone = (id, field, value) => {
    setDraft(prev => ({
      ...prev,
      zones: prev.zones.map(zone => zone.id === id ? { ...zone, [field]: value } : zone),
    }))
    markDirty()
  }

  const updateAlert = (field, value) => {
    setDraft(prev => ({ ...prev, alerts: { ...prev.alerts, [field]: value } }))
    markDirty()
  }

  const updateAlertType = (key, field, value) => {
    setDraft(prev => ({
      ...prev,
      alerts: {
        ...prev.alerts,
        types: { ...prev.alerts.types, [key]: { ...prev.alerts.types[key], [field]: value } },
      },
    }))
    markDirty()
  }

  const updateNotification = (id, field, value) => {
    setDraft(prev => ({
      ...prev,
      notifications: prev.notifications.map(item => item.id === id ? { ...item, [field]: value } : item),
    }))
    markDirty()
  }

  const updateUser = (id, field, value) => {
    setDraft(prev => ({
      ...prev,
      users: prev.users.map(user => user.id === id ? { ...user, [field]: value } : user),
    }))
    markDirty()
  }

  const updateAi = (field, value) => {
    setDraft(prev => ({ ...prev, ai: { ...prev.ai, [field]: value } }))
    markDirty()
  }

  const updateDetection = (key, value) => {
    setDraft(prev => ({
      ...prev,
      ai: { ...prev.ai, detections: { ...prev.ai.detections, [key]: value } },
    }))
    markDirty()
  }

  const updatePrivacy = (field, value) => {
    setDraft(prev => ({ ...prev, privacy: { ...prev.privacy, [field]: value } }))
    markDirty()
  }

  const saveChanges = () => {
    setSavedAt(new Date())
    setDirty(false)
    notify({ title: 'Configuración guardada', sub: 'Los cambios del sistema se aplicaron correctamente', kind: 'success' })
  }

  const resetChanges = () => {
    setDraft(base)
    setDirty(false)
    notify({ title: 'Cambios revertidos', sub: 'La configuración volvió al estado base', kind: 'info' })
  }

  const addCamera = () => {
    const next = draft.cameras.length + 1
    setDraft(prev => ({
      ...prev,
      cameras: [
        ...prev.cameras,
        {
          id: `CAM-${String(next).padStart(2, '0')}`,
          name: newCameraName || `Nueva cámara ${next}`,
          description: 'Nueva fuente de vídeo',
          source: 'rtsp://10.0.1.50/live',
          zone: 'Pendiente',
          status: 'offline',
          active: false,
          enabled: false,
        },
      ],
    }))
    setNewCameraName('')
    markDirty()
    notify({ title: 'Cámara añadida', sub: 'Se creó una nueva cámara para configurar', kind: 'success' })
  }

  const addZone = () => {
    const next = draft.zones.length + 1
    setDraft(prev => ({
      ...prev,
      zones: [
        ...prev.zones,
        {
          id: `zone-${next}`,
          name: newZoneName || `Nueva zona ${next}`,
          type: 'Operativa',
          severity: 'Media',
          schedule: '24/7',
          camera: prev.cameras[0]?.id || 'CAM-01',
          critical: false,
          active: true,
        },
      ],
    }))
    setNewZoneName('')
    markDirty()
    notify({ title: 'Zona añadida', sub: 'Se agregó una nueva zona a la obra', kind: 'success' })
  }

  const addUser = () => {
    const next = draft.users.length + 1
    setDraft(prev => ({
      ...prev,
      users: [
        ...prev.users,
        {
          id: `u${next}`,
          name: newUserName || `Usuario ${next}`,
          email: `usuario${next}@edifica.com`,
          role: 'readOnly',
          active: true,
          permissions: ['Dashboard'],
        },
      ],
    }))
    setNewUserName('')
    markDirty()
    notify({ title: 'Usuario creado', sub: 'El nuevo usuario quedó disponible', kind: 'success' })
  }

  const stats = {
    camerasOnline: draft.cameras.filter(c => c.enabled && c.status === 'online').length,
    criticalZones: draft.zones.filter(z => z.critical).length,
    alertRules: Object.values(draft.alerts.types).filter(t => t.enabled).length,
    channelsEnabled: draft.notifications.filter(n => n.enabled).length,
  }

  const activeContent = {
    general: (
      <div className="settings-grid settings-grid--general">
        <SectionCard
          title="General del proyecto"
          description="Define la obra activa, la ubicación y el contexto operativo del sistema."
        >
          <div className="settings-form-grid">
            <Field label="Nombre del proyecto" hint="Se muestra en la cabecera y exportaciones">
              <input className="setting-input" value={draft.general.projectName} onChange={(e) => updateGeneral('projectName', e.target.value)} />
            </Field>
            <Field label="Obra activa" hint="Selecciona la sede en operación">
              <select className="setting-select" value={draft.general.activeSite} onChange={(e) => updateGeneral('activeSite', e.target.value)}>
                <option>Torre Norte</option>
                <option>Torre Sur</option>
                <option>Centro Logístico</option>
              </select>
            </Field>
            <Field label="Ubicación" hint="Ciudad, sector o punto de control">
              <input className="setting-input" value={draft.general.siteLocation} onChange={(e) => updateGeneral('siteLocation', e.target.value)} />
            </Field>
            <Field label="Zona horaria" hint="Sincroniza horarios y reportes">
              <select className="setting-select" value={draft.general.timezone} onChange={(e) => updateGeneral('timezone', e.target.value)}>
                <option value="America/Bogota">America/Bogota</option>
                <option value="America/Lima">America/Lima</option>
                <option value="America/Mexico_City">America/Mexico_City</option>
              </select>
            </Field>
            <Field label="Idioma" hint="Interfaz y notificaciones internas">
              <select className="setting-select" value={draft.general.language} onChange={(e) => updateGeneral('language', e.target.value)}>
                <option>Español</option>
                <option>English</option>
                <option>Português</option>
              </select>
            </Field>
            <Field label="Estado del sistema" hint="Indicador visible para operadores">
              <select className="setting-select" value={draft.general.systemStatus} onChange={(e) => updateGeneral('systemStatus', e.target.value)}>
                <option>Operativo</option>
                <option>Atención</option>
                <option>Mantenimiento</option>
              </select>
            </Field>
          </div>
          <Field label="Descripción breve" hint="Mensaje resumen del propósito operativo">
            <textarea className="setting-textarea" rows="4" value={draft.general.description} onChange={(e) => updateGeneral('description', e.target.value)} />
          </Field>
        </SectionCard>

        <div className="settings-stack">
          <SectionCard title="Panel de control" description="Resumen operativo en tiempo real." className="settings-card--summary">
            <div className="summary-grid">
              <div className="summary-metric"><span className="summary-metric__label">Cámaras online</span><strong>{stats.camerasOnline}</strong></div>
              <div className="summary-metric"><span className="summary-metric__label">Zonas críticas</span><strong>{stats.criticalZones}</strong></div>
              <div className="summary-metric"><span className="summary-metric__label">Alertas activas</span><strong>{stats.alertRules}</strong></div>
              <div className="summary-metric"><span className="summary-metric__label">Canales activos</span><strong>{stats.channelsEnabled}</strong></div>
            </div>
            <div className="settings-chip-row">
              <span className="settings-chip settings-chip--accent">Obra: {draft.general.activeSite}</span>
              <span className="settings-chip">Idioma: {draft.general.language}</span>
              <span className="settings-chip">Zona horaria: {draft.general.timezone}</span>
            </div>
          </SectionCard>

          <SectionCard title="Estado del motor" description="Visibilidad de salud del sistema, cámaras y eventos.">
            <div className="status-list">
              <div className="status-row"><span className="status-row__label">Cámaras activas</span><span className="status-row__value status-row__value--good">En línea</span></div>
              <div className="status-row"><span className="status-row__label">Reglas de alertas</span><span className="status-row__value">Sin conflicto</span></div>
              <div className="status-row"><span className="status-row__label">Notificaciones críticas</span><span className="status-row__value status-row__value--warn">Inmediatas</span></div>
            </div>
          </SectionCard>
        </div>
      </div>
    ),
    cameras: (
      <SectionCard
        title="Cámaras configuradas"
        description="Administra nombre, identificador, fuente de vídeo, conexión y asignación de zona."
        actions={(
          <div className="settings-card__actions-inline">
            <input className="setting-input setting-input--inline" placeholder="Nombre nueva cámara" value={newCameraName} onChange={(e) => setNewCameraName(e.target.value)} />
            <button className="btn btn--ghost btn--sm" onClick={addCamera}>Añadir cámara</button>
          </div>
        )}
      >
        <div className="settings-table">
          <div className="settings-table__head">
            <span>Cámara</span><span>Fuente</span><span>Zona</span><span>Estado</span><span>Activa</span>
          </div>
          {draft.cameras.map(camera => (
            <div className={`settings-table__row ${camera.status !== 'online' ? 'settings-table__row--muted' : ''}`} key={camera.id}>
              <div>
                <input className="setting-input setting-input--compact" value={camera.id} onChange={(e) => updateCamera(camera.id, 'id', e.target.value)} />
                <input className="setting-input setting-input--compact setting-input--stack" value={camera.name} onChange={(e) => updateCamera(camera.id, 'name', e.target.value)} />
                <input className="setting-input setting-input--compact setting-input--stack" value={camera.description} onChange={(e) => updateCamera(camera.id, 'description', e.target.value)} placeholder="Descripción" />
              </div>
              <input className="setting-input setting-input--compact" value={camera.source} onChange={(e) => updateCamera(camera.id, 'source', e.target.value)} />
              <select className="setting-select setting-select--compact" value={camera.zone} onChange={(e) => updateCamera(camera.id, 'zone', e.target.value)}>
                <option>Acceso Norte</option>
                <option>Zona de carga</option>
                <option>Planta Alta</option>
                <option>Sótano</option>
                <option>Pendiente</option>
              </select>
              <select className="setting-select setting-select--compact" value={camera.status} onChange={(e) => updateCamera(camera.id, 'status', e.target.value)}>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="error">Error</option>
              </select>
              <ToggleField label={camera.enabled ? 'Activa' : 'Desactivada'} checked={camera.enabled} onChange={(value) => updateCamera(camera.id, 'enabled', value)} />
            </div>
          ))}
        </div>
      </SectionCard>
    ),
    zones: (
      <SectionCard
        title="Zonas restringidas"
        description="Crea zonas críticas, define severidad y vincula cámaras para control de perímetro."
        actions={(
          <div className="settings-card__actions-inline">
            <input className="setting-input setting-input--inline" placeholder="Nombre nueva zona" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} />
            <button className="btn btn--ghost btn--sm" onClick={addZone}>Añadir zona</button>
          </div>
        )}
      >
        <div className="settings-table settings-table--zones">
          <div className="settings-table__head settings-table__head--zones">
            <span>Zona</span><span>Tipo</span><span>Severidad</span><span>Horario</span><span>Cámara</span><span>Crítica</span>
          </div>
          {draft.zones.map(zone => (
            <div className="settings-table__row settings-table__row--zones" key={zone.id}>
              <input className="setting-input setting-input--compact" value={zone.name} onChange={(e) => updateZone(zone.id, 'name', e.target.value)} />
              <select className="setting-select setting-select--compact" value={zone.type} onChange={(e) => updateZone(zone.id, 'type', e.target.value)}>
                <option>Perímetro</option>
                <option>Operativa</option>
                <option>Restringida</option>
                <option>Acceso</option>
              </select>
              <select className="setting-select setting-select--compact" value={zone.severity} onChange={(e) => updateZone(zone.id, 'severity', e.target.value)}>
                <option>Alta</option>
                <option>Media</option>
                <option>Baja</option>
              </select>
              <input className="setting-input setting-input--compact" value={zone.schedule} onChange={(e) => updateZone(zone.id, 'schedule', e.target.value)} />
              <select className="setting-select setting-select--compact" value={zone.camera} onChange={(e) => updateZone(zone.id, 'camera', e.target.value)}>
                {draft.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.id}</option>)}
              </select>
              <ToggleField label={zone.critical ? 'Crítica' : 'Normal'} checked={zone.critical} onChange={(value) => updateZone(zone.id, 'critical', value)} />
            </div>
          ))}
        </div>
      </SectionCard>
    ),
    alerts: (
      <div className="settings-grid settings-grid--alerts">
        <SectionCard
          title="Reglas de alertas"
          description="Define cuándo una detección se convierte en alerta, su severidad y el comportamiento repetido."
          actions={<button className="btn btn--ghost btn--sm" onClick={() => setAdvancedOpen(v => !v)}>{advancedOpen ? 'Ocultar avanzados' : 'Mostrar avanzados'}</button>}
        >
          <div className="settings-form-grid settings-form-grid--alerts">
            <Field label="Tiempo mínimo antes de disparar" hint="Reduce falsos positivos por transitorios">
              <input className="setting-input" type="number" min="0" value={draft.alerts.minTriggerSeconds} onChange={(e) => updateAlert('minTriggerSeconds', Number(e.target.value))} />
            </Field>
            <Field label="Cooldown entre alertas" hint="Bloqueo de repetición del mismo evento">
              <input className="setting-input" type="number" min="0" value={draft.alerts.repeatCooldownMinutes} onChange={(e) => updateAlert('repeatCooldownMinutes', Number(e.target.value))} />
            </Field>
            <Field label="Modo operativo" hint="Comportamiento general del motor">
              <select className="setting-select" value={draft.alerts.strictMode ? 'strict' : 'balanced'} onChange={(e) => {
                updateAlert('strictMode', e.target.value === 'strict')
                updateAlert('balancedMode', e.target.value === 'balanced')
              }}>
                <option value="strict">Modo estricto</option>
                <option value="balanced">Modo equilibrado</option>
              </select>
            </Field>
            <Field label="Registro repetido" hint="Si se activa, solo registra eventos duplicados">
              <select className="setting-select" value={draft.alerts.logOnlyIfRepeated ? 'log' : 'notify'} onChange={(e) => updateAlert('logOnlyIfRepeated', e.target.value === 'log')}>
                <option value="notify">Notificar y registrar</option>
                <option value="log">Solo registrar</option>
              </select>
            </Field>
          </div>
          <div className="settings-switch-list">
            {ALERT_TYPES.map(({ key, label }) => (
              <div className="alert-rule-row" key={key}>
                <div>
                  <div className="alert-rule-row__title">{label}</div>
                  <div className="alert-rule-row__sub">Define si la alerta permanece activa y cómo se prioriza.</div>
                </div>
                <div className="alert-rule-row__controls">
                  <select className="setting-select setting-select--compact" value={draft.alerts.types[key].severity} onChange={(e) => updateAlertType(key, 'severity', e.target.value)}>
                    <option>Alta</option>
                    <option>Media</option>
                    <option>Baja</option>
                  </select>
                  <ToggleField label="Activa" checked={draft.alerts.types[key].enabled} onChange={(value) => updateAlertType(key, 'enabled', value)} />
                  <ToggleField label="Inmediata" checked={draft.alerts.types[key].immediate} onChange={(value) => updateAlertType(key, 'immediate', value)} />
                </div>
              </div>
            ))}
          </div>
          {advancedOpen && (
            <div className="settings-advanced-box">
              <div className="settings-advanced-box__title">Controles avanzados</div>
              <div className="settings-advanced-box__grid">
                <ToggleField label="Aislar eventos críticos" description="Reduce ruido en jornadas con alta actividad" checked={draft.alerts.strictMode} onChange={(value) => updateAlert('strictMode', value)} />
                <ToggleField label="Modo equilibrado" description="Permite más contexto antes de notificar" checked={draft.alerts.balancedMode} onChange={(value) => updateAlert('balancedMode', value)} />
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    ),
    notifications: (
      <SectionCard title="Canales de notificación" description="Selecciona destinatarios, frecuencia y criticidad por canal.">
        <div className="notifications-list">
          {draft.notifications.map(channel => (
            <div className="notification-row" key={channel.id}>
              <div className="notification-row__main">
                <div className="notification-row__title">{channel.label}</div>
                <div className="notification-row__hint">{CHANNELS.find(c => c.id === channel.id)?.hint || 'Canal operativo'}</div>
              </div>
              <div className="notification-row__fields">
                <input className="setting-input setting-input--compact" value={channel.recipient} onChange={(e) => updateNotification(channel.id, 'recipient', e.target.value)} />
                <select className="setting-select setting-select--compact" value={channel.frequency} onChange={(e) => updateNotification(channel.id, 'frequency', e.target.value)}>
                  <option>Inmediato</option>
                  <option>Cada 15 min</option>
                  <option>Horario laboral</option>
                </select>
                <select className="setting-select setting-select--compact" value={channel.summary} onChange={(e) => updateNotification(channel.id, 'summary', e.target.value)}>
                  <option>Diario</option>
                  <option>Semanal</option>
                  <option>N/A</option>
                </select>
                <ToggleField label="Activo" checked={channel.enabled} onChange={(value) => updateNotification(channel.id, 'enabled', value)} />
                <ToggleField label="Críticas" checked={channel.criticalOnly} onChange={(value) => updateNotification(channel.id, 'criticalOnly', value)} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    ),
    users: (
      <SectionCard
        title="Usuarios y roles"
        description="Controla permisos básicos y acceso operativo al sistema."
        actions={(
          <div className="settings-card__actions-inline">
            <input className="setting-input setting-input--inline" placeholder="Nombre de usuario" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            <button className="btn btn--ghost btn--sm" onClick={addUser}>Añadir usuario</button>
          </div>
        )}
      >
        <div className="settings-table settings-table--users">
          <div className="settings-table__head settings-table__head--users">
            <span>Usuario</span><span>Rol</span><span>Estado</span><span>Permisos</span>
          </div>
          {draft.users.map(user => (
            <div className="settings-table__row settings-table__row--users" key={user.id}>
              <div>
                <input className="setting-input setting-input--compact" value={user.name} onChange={(e) => updateUser(user.id, 'name', e.target.value)} />
                <input className="setting-input setting-input--compact setting-input--stack" value={user.email} onChange={(e) => updateUser(user.id, 'email', e.target.value)} />
              </div>
              <select className="setting-select setting-select--compact" value={user.role} onChange={(e) => updateUser(user.id, 'role', e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ToggleField label={user.active ? 'Activo' : 'Inactivo'} checked={user.active} onChange={(value) => updateUser(user.id, 'active', value)} />
              <div className="permissions-chips">
                {user.permissions.map(permission => <span className="settings-chip" key={permission}>{permission}</span>)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    ),
    ai: (
      <SectionCard title="IA y detección" description="Ajusta el comportamiento del modelo para reducir falsos positivos y controlar sensibilidad.">
        <div className="settings-form-grid settings-form-grid--ai">
          <Field label="Umbral de confianza" hint="Mayor valor = detección más exigente">
            <input className="setting-range" type="range" min="0.5" max="0.98" step="0.01" value={draft.ai.confidence} onChange={(e) => updateAi('confidence', Number(e.target.value))} />
            <div className="range-value">{Math.round(draft.ai.confidence * 100)}%</div>
          </Field>
          <Field label="Sensibilidad" hint="Ajusta la agresividad del motor">
            <select className="setting-select" value={draft.ai.sensitivity} onChange={(e) => updateAi('sensitivity', e.target.value)}>
              <option>Alta</option>
              <option>Media</option>
              <option>Baja</option>
            </select>
          </Field>
          <Field label="Persistencia mínima" hint="Frames o segundos para validar una infracción">
            <input className="setting-input" type="number" min="1" max="10" value={draft.ai.persistence} onChange={(e) => updateAi('persistence', Number(e.target.value))} />
          </Field>
          <Field label="Falsos positivos" hint="Tolerancia actual del sistema">
            <input className="setting-input" type="number" min="0" max="100" value={draft.ai.falsePositives} onChange={(e) => updateAi('falsePositives', Number(e.target.value))} />
          </Field>
        </div>
        <div className="settings-advanced-box settings-advanced-box--ai">
          <div className="settings-advanced-box__title">Tipos de detección</div>
          <div className="settings-advanced-box__grid settings-advanced-box__grid--detections">
            {Object.entries(draft.ai.detections).map(([key, enabled]) => (
              <ToggleField key={key} label={key === 'NO_HARDHAT' ? 'Sin casco' : key === 'NO_VEST' ? 'Sin chaleco' : key === 'RESTRICTED_ZONE' ? 'Zona restringida' : 'Sin señal'} checked={enabled} onChange={(value) => updateDetection(key, value)} />
            ))}
          </div>
          <div className="settings-toggle-line">
            <ToggleField label="Modo estricto" description="Prioriza sensibilidad sobre tolerancia" checked={draft.ai.mode === 'strict'} onChange={(value) => updateAi('mode', value ? 'strict' : 'equilibrado')} />
            <ToggleField label="Modo equilibrado" description="Reduce ruido en escenarios complejos" checked={draft.ai.mode === 'equilibrado'} onChange={(value) => updateAi('mode', value ? 'equilibrado' : 'strict')} />
          </div>
        </div>
      </SectionCard>
    ),
    privacy: (
      <SectionCard title="Privacidad y almacenamiento" description="Control de evidencias, snapshots y trazabilidad del sistema.">
        <div className="settings-form-grid">
          <Field label="Retención de snapshots" hint="Días de conservación de imágenes y evidencias">
            <select className="setting-select" value={draft.privacy.retainSnapshots} onChange={(e) => updatePrivacy('retainSnapshots', Number(e.target.value))}>
              <option value={7}>7 días</option>
              <option value={15}>15 días</option>
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
            </select>
          </Field>
          <Field label="Modo privacidad reforzada" hint="Oculta o minimiza información sensible">
            <select className="setting-select" value={draft.privacy.reinforcedMode ? 'yes' : 'no'} onChange={(e) => updatePrivacy('reinforcedMode', e.target.value === 'yes')}>
              <option value="no">Desactivado</option>
              <option value="yes">Activado</option>
            </select>
          </Field>
          <Field label="Conservar evidencias visuales" hint="Permite descargar snapshots de incidentes">
            <ToggleField label="Guardar evidencias" checked={draft.privacy.keepEvidence} onChange={(value) => updatePrivacy('keepEvidence', value)} />
          </Field>
          <Field label="Registro de eventos" hint="Auditoría de acciones administrativas">
            <ToggleField label="Auditar eventos" checked={draft.privacy.eventLog} onChange={(value) => updatePrivacy('eventLog', value)} />
          </Field>
        </div>
        <div className="privacy-panel">
          <div className="privacy-panel__metric">
            <span className="privacy-panel__label">Conservación</span>
            <strong>{draft.privacy.retainSnapshots} días</strong>
          </div>
          <div className="privacy-panel__metric">
            <span className="privacy-panel__label">Modo de evidencias</span>
            <strong>{draft.privacy.keepEvidence ? 'Activo' : 'Bloqueado'}</strong>
          </div>
          <div className="privacy-panel__metric">
            <span className="privacy-panel__label">Exportación</span>
            <strong>{draft.privacy.incidentExport ? 'Habilitada' : 'Limitada'}</strong>
          </div>
        </div>
      </SectionCard>
    ),
  }

  return (
    <div className="settings-console">
      <aside className="settings-sidebar">
        <div className="settings-sidebar__eyebrow">Consola de administración</div>
        <h1 className="settings-sidebar__title">Configuración</h1>
        <p className="settings-sidebar__subtitle">Panel enterprise para administrar cámaras, zonas, alertas, usuarios e IA.</p>
        <nav className="settings-nav">
          {SECTION_TABS.map(section => (
            <button key={section.id} className={`settings-nav__item ${activeTab === section.id ? 'settings-nav__item--active' : ''}`} onClick={() => setActiveTab(section.id)}>
              <span className="settings-nav__label">{section.label}</span>
              <span className="settings-nav__desc">{section.desc}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-main">
        <div className="settings-header">
          <div>
            <div className="settings-header__eyebrow">Edifica Constructora</div>
            <h2 className="settings-header__title">Administración del sistema</h2>
            <p className="settings-header__subtitle">Controla la configuración global con una consola clara, premium y orientada a operación.</p>
          </div>
          <div className="settings-header__meta">
            <span className="settings-chip settings-chip--accent">{draft.general.systemStatus}</span>
            <span className="settings-chip">{stats.camerasOnline} cámaras online</span>
            <span className="settings-chip">{stats.channelsEnabled} canales activos</span>
          </div>
        </div>

        <div className="settings-content">
          {activeContent[activeTab]}
        </div>

        <div className={`settings-savebar ${dirty ? 'settings-savebar--dirty' : ''}`}>
          <div className="settings-savebar__status">
            <span className={`save-dot ${dirty ? 'save-dot--dirty' : 'save-dot--ok'}`} />
            <div>
              <div className="settings-savebar__title">{dirty ? 'Cambios pendientes' : 'Configuración sincronizada'}</div>
              <div className="settings-savebar__sub">{savedAt ? `Guardado el ${savedAt.toLocaleString('es-ES', { hour12: false })}` : 'Sin cambios recientes'}</div>
            </div>
          </div>
          <div className="settings-savebar__actions">
            <button className="btn btn--ghost" onClick={resetChanges} disabled={!dirty}>Resetear</button>
            <button className="btn btn--primary" onClick={saveChanges} disabled={!dirty}>Guardar cambios</button>
          </div>
        </div>
      </div>
    </div>
  )
}
