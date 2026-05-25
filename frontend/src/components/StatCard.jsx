/**
 * StatCard – Tarjeta de estadística individual para el dashboard.
 */
export default function StatCard({ icon, value, label, variant = 'total' }) {
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}
