# Design System – Edifica Constructora
## Slate + Muted Gold Premium Theme

### Paleta de Colores

#### Fondos
- **Primary**: `#0b0f14` - Fondo principal más oscuro
- **Background Alt**: `#11161d` - Fondo alternativo
- **Surface**: `#161d26` - Superficie estándar de componentes
- **Surface 2**: `#1b2430` - Superficie secundaria
- **Surface 3**: `#212c39` - Superficie terciaria

#### Bordes
- **Border**: `rgba(196, 182, 152, 0.12)` - Borde sutil
- **Border Strong**: `rgba(196, 182, 152, 0.22)` - Borde más visible

#### Texto
- **Primary**: `#f3f1eb` - Texto principal (off-white)
- **Secondary/Muted**: `#b8b1a4` - Texto secundario
- **Faint**: `#857d70` - Texto muy atenuado

#### Acentos
- **Accent (Muted Gold)**: `#c2a56c` - Color principal de acento
- **Accent Hover**: `#d3b57a` - Variante hover
- **Accent Soft**: `rgba(194, 165, 108, 0.14)` - Fondo suave con acento

#### Estados
- **Success**: `#3f8f6b` - Verde elegante (alertas OK, grabación)
- **Warning**: `#b88a3b` - Ámbar/oro (advertencias, local activo)
- **Danger**: `#b45f5f` - Rojo premium (errores, sin señal)
- **Info**: `#7f8ea3` - Azul/gris (información general)

### Cambios Principales vs. Versión Anterior

| Elemento | Anterior | Nuevo |
|----------|----------|-------|
| Azul dominante | `#3b82f6` | `#c2a56c` (Muted Gold) |
| Fondo primario | `#08131d` | `#0b0f14` |
| Fondos de cards | Azul marino | Slate/Grafito oscuro |
| Rojo | `#ef4444` | `#b45f5f` (más apagado) |
| Verde | `#16a34a` | `#3f8f6b` (más elegante) |
| Ámbar | `#f59e0b` | `#b88a3b` (más sobrio) |
| Bordes | Azul `rgba(120, 160, 220, 0.16)` | Gold `rgba(196, 182, 152, 0.12)` |
| Sombras | Azul glow | Gold glow |

### Componentes y Aplicación

#### Sidebar
- Fondo muy oscuro (`#050608`)
- Logo con gradiente muted gold y borde sutil
- Estado activo con background soft de muted gold
- Hover states discretos

#### Top Bar
- Fondo translúcido y elegante
- Bordes muted gold sutiles
- Botón principal con muted gold
- Hover states con sombra gold

#### Cards y Paneles
- Fondos slate/grafito con gradientes sutiles
- Bordes muted gold muy apagados
- Sombras suaves (no glow azul)
- Hover states elevan la jerarquía visual
- Estados premium en panel--hero

#### KPI Cards
- Iconos con colores de estado (success, warning, danger)
- Números grandes en off-white
- Fondos gradient sutiles
- Glow accent de muted gold en hover

#### Botones
- Primary: Muted gold con texto dark
- Ghost: Bordes sutil, hover con background light gold
- Success: Verde con background suave
- Danger: Rojo con background suave

#### Estados de Cámara
- **Grabando**: Verde `#3f8f6b`
- **Sin señal**: Rojo `#b45f5f`
- **Stream local activo**: Ámbar `#b88a3b`

### Sombras y Efectos

- **Card Shadow**: `0 2px 12px rgba(0, 0, 0, 0.4)` - Sutil y profesional
- **Glow Subtle**: `0 0 16px rgba(194, 165, 108, 0.08)` - Muted gold glow
- **Modal Backdrop**: `rgba(0,0,0,0.72)` - Oscuro pero legible

### Tipografía

- **Font**: Inter (sin-serif, limpia, moderna)
- **Font Mono**: Consolas
- **Weights usados**: 400, 500, 600, 700, 800
- **Sizes**: Escala modular con múltiplos de 4px

### Variables CSS Disponibles

```css
:root {
  --color-bg: #0b0f14;
  --color-bg-alt: #11161d;
  --color-surface: #161d26;
  --color-surface-2: #1b2430;
  --color-surface-3: #212c39;
  
  --color-border: rgba(196, 182, 152, 0.12);
  --color-border-strong: rgba(196, 182, 152, 0.22);
  
  --color-text: #f3f1eb;
  --color-text-muted: #b8b1a4;
  --color-text-faint: #857d70;
  
  --color-accent: #c2a56c;
  --color-accent-hover: #d3b57a;
  --color-accent-soft: rgba(194, 165, 108, 0.14);
  
  --color-success: #3f8f6b;
  --color-success-soft: rgba(63, 143, 107, 0.14);
  
  --color-warning: #b88a3b;
  --color-warning-soft: rgba(184, 138, 59, 0.14);
  
  --color-danger: #b45f5f;
  --color-danger-soft: rgba(180, 95, 95, 0.14);
  
  --color-info: #7f8ea3;
  --color-info-soft: rgba(127, 142, 163, 0.14);
}
```

### Filosofía de Diseño

✅ **Lujo Sobrio**: Premium sin exceso de efectos
✅ **Enterprise Real**: Profesional y ejecutivo
✅ **Alto Contraste Controlado**: Legible pero no agresivo
✅ **Muted Gold Discreto**: Acento elegante, no dominante
✅ **Coherencia Visual**: Sistema unificado y consistente
✅ **Mejor Acabado**: Calidad de producto, no template genérico

### Restricciones de Diseño

❌ No azul brillante (#3b82f6 descartado)
❌ No paneles azul marino
❌ No borde azul alrededor de todo
❌ No saturación alta en colores
❌ No estilo gaming
❌ No look genérico de admin dashboard
❌ No glassmorphism exagerado
❌ No neón

---

**Versión**: 1.0 | **Actualizado**: 2026-05-27 | **Tema**: Slate + Muted Gold Premium
