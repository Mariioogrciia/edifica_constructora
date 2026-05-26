/**
 * StatCard – Tarjeta de estadística individual para el dashboard.
 */
export default function StatCard({ icon, value, label, variant = 'total' }) {
  // Mock trend data based on variant for the mockup feel
  const trend = variant === 'total' ? '↓ 11%' : variant === 'resolved' ? '↑ 24%' : '↑ 15%';
  const trendColor = trend.includes('↓') ? 'var(--accent-emerald)' : 'var(--accent-red)';
  const isPositive = variant === 'resolved' ? trend.includes('↑') : trend.includes('↓');

  return (
    <div className={`stat-card stat-card--${variant}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
      <div className="stat-card__icon" style={{ margin: 0, width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-card__label" style={{ marginBottom: '2px', textTransform: 'none', color: 'var(--text-secondary)' }}>
            {label}
          </div>
          <div className="stat-card__value" style={{ fontSize: '2.2rem' }}>
            {value}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '-2px' }}>
            Personas
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)', fontSize: '0.8rem', fontWeight: 600 }}>
            {trend}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            vs. ayer
          </div>
          <svg width="60" height="20" viewBox="0 0 60 20" style={{ marginTop: '4px', overflow: 'visible' }}>
            <path d="M0,15 L10,12 L20,18 L30,5 L40,8 L50,2 L60,10" fill="none" stroke={isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M0,15 L10,12 L20,18 L30,5 L40,8 L50,2 L60,10 L60,20 L0,20 Z" fill={`url(#gradient-${variant})`} opacity="0.2" />
            <defs>
              <linearGradient id={`gradient-${variant}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)'} />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  )
}
