import React, { useState, useEffect, useRef } from 'react';
import floorPlanUrl from '../assets/floor_plan.svg';

const API_BASE = '/api';

const I = {
  camera: <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>,
  trash: <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
  pan: <svg viewBox="0 0 24 24"><path d="M20 9h-3V4h-2v5h-3V4h-2v5H7V4H5v11c0 4.42 3.58 8 8 8s8-3.58 8-8V9zm-8 12c-3.31 0-6-2.69-6-6v-9h2v7h2V6h2v9h2V6h2v9h2v-4h2v9c0 3.31-2.69 6-6 6z"/></svg>,
  draw: <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
  center: <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>,
  zoomIn: <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2z"/></svg>,
  zoomOut: <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>,
  upload: <svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
};

const INITIAL_CAMERAS = [
  { id: 'CAM-01', name: 'Entrada Principal', x: 0.5, y: 0.8 },
  { id: 'CAM-02', name: 'Zona de Carga', x: 0.15, y: 0.15 },
  { id: 'CAM-03', name: 'Planta Alta', x: 0.15, y: 0.75 },
  { id: 'CAM-04', name: 'Sótano', x: 0.85, y: 0.85 },
  { id: 'CAM-05', name: 'Acopio Materiales', x: 0.85, y: 0.15 },
];

export default function ZonesMap({ mode = 'read-only', zones = [], fetchZones = () => {} }) {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [bgImage, setBgImage] = useState(floorPlanUrl);
  const [imageSize, setImageSize] = useState({ width: 800, height: 600 });
  const [cameras, setCameras] = useState(INITIAL_CAMERAS);

  // Tools state: 'pan', 'draw', 'camera'
  const [activeTool, setActiveTool] = useState(mode === 'edit' ? 'pan' : 'none');

  // View state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [mousePos, setMousePos] = useState(null);

  // Camera drag state
  const [draggingCam, setDraggingCam] = useState(null);

  const loadBgImage = () => {
    const customUrl = `${API_BASE.replace('/api', '')}/static/custom_floor_plan.png?t=${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      setBgImage(customUrl);
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      centerView(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      setBgImage(floorPlanUrl);
      centerView(800, 600); // Default fallback dimensions
    };
    img.src = customUrl;
  };

  useEffect(() => {
    loadBgImage();
    // eslint-disable-next-line
  }, []);

  const centerView = (w = imageSize.width, h = imageSize.height) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min(cw / w, ch / h) * 0.9;
    setTransform({
      x: (cw - w * scale) / 2,
      y: (ch - h * scale) / 2,
      scale
    });
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/floorplan`, { method: 'POST', body: formData });
      if (res.ok) loadBgImage();
    } catch (err) {
      console.error(err);
    }
  };

  // Convert screen coordinates to image-relative (0.0 to 1.0)
  const getRelativeCoords = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = (e.clientX - rect.left - transform.x) / transform.scale;
    const sy = (e.clientY - rect.top - transform.y) / transform.scale;
    return {
      x: Math.max(0, Math.min(1, sx / imageSize.width)),
      y: Math.max(0, Math.min(1, sy / imageSize.height))
    };
  };

  // Event Handlers for Canvas Container (attached natively to prevent passive listener issues)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e) => {
      if (activeTool === 'none' && mode !== 'edit') return;
      e.preventDefault();
      
      const zoomFactor = -e.deltaY * 0.001;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      setTransform(prev => {
        const newScale = Math.min(Math.max(prev.scale * (1 + zoomFactor), 0.1), 10);
        const dx = mx - prev.x;
        const dy = my - prev.y;
        const scaleRatio = newScale / prev.scale;
        return {
          x: mx - dx * scaleRatio,
          y: my - dy * scaleRatio,
          scale: newScale
        };
      });
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, [activeTool, mode]);

  const handlePointerDown = (e) => {
    if (e.button === 1 || activeTool === 'pan' || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    } else if (activeTool === 'draw') {
      const pt = getRelativeCoords(e);
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrentPoints([pt]);
      } else {
        const firstPt = currentPoints[0];
        const dist = Math.hypot(pt.x - firstPt.x, pt.y - firstPt.y);
        // Dist in relative units. Let's make threshold ~20 pixels in screen space
        if (currentPoints.length > 2 && dist * imageSize.width * transform.scale < 20) {
          finishDrawing(currentPoints);
        } else {
          setCurrentPoints([...currentPoints, pt]);
        }
      }
    }
  };

  const handlePointerMove = (e) => {
    if (isPanning) {
      setTransform({ ...transform, x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (activeTool === 'draw' && isDrawing) {
      setMousePos(getRelativeCoords(e));
    } else if (draggingCam) {
      const pt = getRelativeCoords(e);
      setCameras(cameras.map(c => c.id === draggingCam ? { ...c, x: pt.x, y: pt.y } : c));
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    if (draggingCam) setDraggingCam(null);
  };

  const finishDrawing = async (points) => {
    setIsDrawing(false);
    setMousePos(null);
    setCurrentPoints([]);
    const name = window.prompt("Nombre de la nueva zona restringida:");
    if (!name || name.trim() === "") return;
    try {
      const res = await fetch(`${API_BASE}/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, polygon_points: points })
      });
      if (res.ok) fetchZones();
    } catch (err) {
      console.error("Error saving zone", err);
    }
  };

  const deleteZone = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta zona restringida?")) return;
    try {
      await fetch(`${API_BASE}/zones/${id}`, { method: 'DELETE' });
      fetchZones();
    } catch (err) {
      console.error("Error deleting zone", err);
    }
  };

  // Convert relative coordinates back to SVG view space (which is size 0->width, 0->height)
  const toPointsString = (pts) => pts.map(p => `${p.x * imageSize.width},${p.y * imageSize.height}`).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px', background: 'var(--bg-card)', overflow: 'hidden' }}>
      
      {/* Tools Panel */}
      {mode === 'edit' && (
        <div style={{ 
          position: 'absolute', top: 16, left: 16, zIndex: 10, 
          background: 'rgba(11, 17, 32, 0.85)', backdropFilter: 'blur(10px)', 
          padding: '6px', borderRadius: '12px', border: '1px solid var(--bg-glass-border)',
          display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: 'var(--shadow-card)'
        }}>
          <button className={`tool-btn ${activeTool === 'pan' ? 'tool-btn--active' : ''}`} onClick={() => setActiveTool('pan')} title="Mover plano">
            {I.pan}
          </button>
          <button className={`tool-btn ${activeTool === 'camera' ? 'tool-btn--active' : ''}`} onClick={() => setActiveTool('camera')} title="Posicionar Cámaras">
            {I.camera}
          </button>
          <button className={`tool-btn ${activeTool === 'draw' ? 'tool-btn--active' : ''}`} onClick={() => setActiveTool('draw')} title="Dibujar Zona">
            {I.draw}
          </button>
          <div style={{ width: '100%', height: '1px', background: 'var(--bg-glass-border)', margin: '4px 0' }} />
          <button className="tool-btn" onClick={() => setTransform({...transform, scale: transform.scale * 1.2})} title="Acercar">
            {I.zoomIn}
          </button>
          <button className="tool-btn" onClick={() => setTransform({...transform, scale: transform.scale / 1.2})} title="Alejar">
            {I.zoomOut}
          </button>
          <button className="tool-btn" onClick={() => centerView()} title="Centrar Vista">
            {I.center}
          </button>
          <div style={{ width: '100%', height: '1px', background: 'var(--bg-glass-border)', margin: '4px 0' }} />
          <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Subir Plano">
            {I.upload}
          </button>
          <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleUpload} />
        </div>
      )}

      {/* Helper text overlay */}
      {mode === 'edit' && activeTool === 'draw' && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, background: 'rgba(11, 17, 32, 0.9)', padding: '8px 16px', borderRadius: '24px', border: '1px solid var(--color-blue)', fontSize: '0.75rem', color: 'var(--text-primary)', boxShadow: 'var(--shadow-glow-subtle)' }}>
          Haz clic en el mapa para añadir vértices. Haz clic en el punto inicial para cerrar la zona.
        </div>
      )}

      {/* Canvas Container */}
      <div 
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          width: '100%', height: '100%',
          cursor: isPanning ? 'grabbing' : activeTool === 'pan' ? 'grab' : activeTool === 'draw' ? 'crosshair' : 'default',
          touchAction: 'none' // Prevent browser scrolling
        }}
      >
        <div style={{
          transformOrigin: '0 0',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          width: imageSize.width, height: imageSize.height,
          position: 'relative'
        }}>
          {/* Background Image Layer */}
          <img src={bgImage} alt="Floor Plan" style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }} />

          {/* SVG Overlay Layer */}
          <svg
            viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <defs>
              <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45 0 0)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-red)" strokeOpacity="0.4" strokeWidth="1" />
              </pattern>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Zonas guardadas */}
            {zones.map((z) => {
              const xs = z.polygon_points.map(p => p.x * imageSize.width);
              const ys = z.polygon_points.map(p => p.y * imageSize.height);
              const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
              const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

              return (
                <g key={z.id} style={{ pointerEvents: mode === 'edit' && activeTool === 'pan' ? 'auto' : 'none' }}>
                  <polygon
                    points={toPointsString(z.polygon_points)}
                    fill="url(#diagonalHatch)"
                    stroke="var(--color-red)"
                    strokeWidth={2 / transform.scale}
                    style={{ transition: 'all 0.2s' }}
                  />
                  {z.polygon_points.map((p, i) => (
                    <circle key={i} cx={p.x * imageSize.width} cy={p.y * imageSize.height} r={4 / transform.scale} fill="var(--color-red)" opacity={mode === 'edit' ? 0.8 : 0} />
                  ))}
                  
                  {/* Etiqueta de la zona */}
                  <g transform={`translate(${cx}, ${cy})`}>
                    <rect x={-40/transform.scale} y={-10/transform.scale} width={80/transform.scale} height={20/transform.scale} rx={4/transform.scale} fill="rgba(11, 17, 32, 0.8)" />
                    <text x="0" y={4/transform.scale} fill="#fff" fontSize={12 / transform.scale} fontWeight="600" textAnchor="middle">
                      {z.name}
                    </text>
                  </g>

                  {mode === 'edit' && (
                    <g onClick={(e) => deleteZone(z.id, e)} style={{ cursor: 'pointer', pointerEvents: 'auto' }} transform={`translate(${cx}, ${cy + 25/transform.scale})`}>
                      <rect x={-12/transform.scale} y={-12/transform.scale} width={24/transform.scale} height={24/transform.scale} fill="var(--color-red)" rx={4/transform.scale} />
                      <path d="M-4,-4 L4,4 M-4,4 L4,-4" stroke="#fff" strokeWidth={2/transform.scale} />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Polígono en progreso */}
            {isDrawing && currentPoints.length > 0 && (
              <g>
                <polyline
                  points={toPointsString([...currentPoints, mousePos || currentPoints[currentPoints.length - 1]])}
                  fill="rgba(59, 130, 246, 0.15)"
                  stroke="var(--color-blue)"
                  strokeWidth={2 / transform.scale}
                  strokeDasharray={`${6/transform.scale} ${4/transform.scale}`}
                />
                {currentPoints.map((p, i) => (
                  <circle key={i} cx={p.x * imageSize.width} cy={p.y * imageSize.height} r={5 / transform.scale} fill="var(--color-blue)" stroke="#fff" strokeWidth={1/transform.scale} />
                ))}
              </g>
            )}

            {/* Cámaras Renderizadas */}
            {cameras.map(c => {
              const cx = c.x * imageSize.width;
              const cy = c.y * imageSize.height;
              const isDraggable = mode === 'edit' && activeTool === 'camera';
              return (
                <g 
                  key={c.id} 
                  transform={`translate(${cx}, ${cy})`} 
                  style={{ 
                    pointerEvents: isDraggable ? 'auto' : 'none',
                    cursor: isDraggable ? 'grab' : 'default'
                  }}
                  onPointerDown={(e) => {
                    if (isDraggable) {
                      e.stopPropagation();
                      setDraggingCam(c.id);
                    }
                  }}
                >
                  <circle cx="0" cy="0" r={16 / transform.scale} fill="rgba(11, 17, 32, 0.9)" stroke="var(--color-emerald)" strokeWidth={2 / transform.scale} filter="url(#glow)" />
                  <path d={`M${-8/transform.scale} ${-5/transform.scale} h${16/transform.scale} v${10/transform.scale} h${-16/transform.scale} z`} fill="var(--color-emerald)" />
                  <circle cx="0" cy="0" r={3 / transform.scale} fill="#fff" />
                  
                  {/* Tooltip Hover (simulated with standard text for now) */}
                  <g transform={`translate(0, ${28/transform.scale})`}>
                    <rect x={-45/transform.scale} y={-10/transform.scale} width={90/transform.scale} height={20/transform.scale} fill="rgba(11,17,32,0.9)" rx={4/transform.scale} border="1px solid var(--color-emerald)" />
                    <text x="0" y={4/transform.scale} fill="var(--color-emerald)" fontSize={10 / transform.scale} fontWeight="bold" textAnchor="middle">
                      {c.id}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      
      {/* Inject custom CSS for tools */}
      <style>{`
        .tool-btn {
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: 8px;
          color: var(--text-secondary); cursor: pointer;
          transition: all 0.2s;
        }
        .tool-btn:hover {
          background: rgba(255,255,255,0.05); color: var(--text-primary);
        }
        .tool-btn--active {
          background: var(--color-blue-bg); color: var(--color-blue);
        }
        .tool-btn svg { width: 20px; height: 20px; fill: currentColor; }
      `}</style>
    </div>
  );
}
