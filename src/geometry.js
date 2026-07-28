/**
 * PAPER ALFA - Geometer Engine (v1.0)
 * Motor Geométrico Paramétrico para Desarrollo 2D de Modelismo y Papercraft
 * Precisión 1:1 en milímetros (mm)
 */

export class PaperAlfaGeometry {
  constructor() {
    this.A4_WIDTH = 210; // mm
    this.A4_HEIGHT = 297; // mm
  }

  /**
   * Genera el desarrollo 2D de un Cono Truncado (Frustum of a Cone)
   * @param {Object} params - Parámetros en mm: { d1, d2, height, tabHeight, tabAngleDeg, teethPerArc, includeTopCap, includeBottomCap, marginSecurity }
   * @returns {Object} Datos de despiece 2D listos para SVG y PDF A4 1:1
   */
  calculateTruncatedCone(params) {
    const d1 = parseFloat(params.d1) || 80;
    const d2 = parseFloat(params.d2) || 45;
    const h = parseFloat(params.height) || 90;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const tabAngle = parseFloat(params.tabAngleDeg) || 60;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const incTop = params.includeTopCap !== false;
    const incBottom = params.includeBottomCap !== false;
    const margin = parseFloat(params.marginSecurity) || 5;

    const r1 = d1 / 2;
    const r2 = d2 / 2;

    // Caso especial: Cilindro (D1 == D2)
    if (Math.abs(r1 - r2) < 0.01) {
      return this.calculateCylinder({ d1, height: h, tabHeight: tabH, teethPerArc: teethCount, includeTopCap: incTop, includeBottomCap: incBottom, marginSecurity: margin });
    }

    // Asegurarse de que r1 es el radio mayor; si el usuario ingresó d2 > d1, invertimos para el cálculo
    const isInverted = r2 > r1;
    const R_BASE = isInverted ? r2 : r1; // Radio de base inferior mayor
    const R_TOP = isInverted ? r1 : r2;  // Radio de base superior menor

    // Generatriz del tronco de cono
    const g = Math.sqrt(Math.pow(R_BASE - R_TOP, 2) + Math.pow(h, 2));

    // Distancias desde el vértice del cono completo hasta los arcos
    // Por semejanza de triángulos: R1 / rho1 = R2 / rho2  y  rho1 - rho2 = g
    const rho1 = g * (R_BASE / (R_BASE - R_TOP)); // Radio exterior del sector (mm)
    const rho2 = g * (R_TOP / (R_BASE - R_TOP));  // Radio interior del sector (mm)

    // Ángulo del sector desplegado (en radianes y grados)
    // Longitud de arco exterior = 2 * PI * R_BASE = rho1 * theta
    const thetaRad = (2 * Math.PI * R_BASE) / rho1;
    const thetaDeg = thetaRad * (180 / Math.PI);

    // Bounding Box preliminar del sector de desarrollo lateral
    const sectorBox = this.getSectorBoundingBox(rho1, rho2, thetaRad, tabH);

    // Generar piezas de despiece
    const parts = [];

    // 1. Pieza: Desarrollo Lateral (Manto principal)
    const mantlePart = this.buildMantlePiece({
      rho1,
      rho2,
      thetaRad,
      tabHeight: tabH,
      tabAngleDeg: tabAngle,
      teethCount,
      rBase: R_BASE,
      rTop: R_TOP,
      g,
      box: sectorBox
    });
    parts.push(mantlePart);

    // 2. Tapa Superior (D2 o R_TOP)
    if (incTop && R_TOP > 0) {
      parts.push(this.buildCapPiece(R_TOP, 'Tapa Superior (D=' + (R_TOP * 2).toFixed(1) + 'mm)', 'top-cap', tabH));
    }

    // 3. Tapa Inferior (D1 o R_BASE)
    if (incBottom && R_BASE > 0) {
      parts.push(this.buildCapPiece(R_BASE, 'Tapa Inferior (D=' + (R_BASE * 2).toFixed(1) + 'mm)', 'bottom-cap', tabH));
    }

    // Empaquetar las piezas en páginas A4 (210 x 297 mm) con margen de seguridad
    const layout = this.layoutPartsOnA4(parts, margin);

    return {
      type: 'truncated_cone',
      parameters: { d1, d2, height: h, tabHeight: tabH, g: g.toFixed(2), rho1: rho1.toFixed(2), rho2: rho2.toFixed(2), thetaDeg: thetaDeg.toFixed(1) },
      metrics: {
        slantHeightMm: g.toFixed(2),
        sectorAngleDeg: thetaDeg.toFixed(1),
        surfaceAreaCm2: ((Math.PI * (R_BASE + R_TOP) * g) / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  /**
   * Genera las rutas SVG (corte, doblez, pestañas) del Manto del Cono Truncado
   */
  buildMantlePiece({ rho1, rho2, thetaRad, tabHeight, tabAngleDeg, teethCount, rBase, rTop, g, box }) {
    const lines = {
      cuts: [],         // Trazos de corte exterior (negro 0.5pt)
      mountainFolds: [], // Trazos de doblez montaña (azul punteado)
      valleyFolds: [],   // Trazos de doblez valle (rojo punteado)
      tabs: []           // Geometría de solapas
    };

    // Ángulo inicial (centrado verticalmente o comenzando desde ángulo simétrico para estética)
    const startAngle = -thetaRad / 2;
    const endAngle = thetaRad / 2;

    // Aristas rectas laterales del sector
    const pStartInner = this.polarToCartesian(0, 0, rho2, startAngle);
    const pStartOuter = this.polarToCartesian(0, 0, rho1, startAngle);
    const pEndInner = this.polarToCartesian(0, 0, rho2, endAngle);
    const pEndOuter = this.polarToCartesian(0, 0, rho1, endAngle);

    // 1. Pestaña de unión lateral recta en arista izquierda (startAngle)
    const sideTab = this.buildStraightSideTab(pStartInner, pStartOuter, tabHeight, 30);
    lines.cuts.push(...sideTab.cutLines);
    lines.cuts.push({ x1: pStartInner.x, y1: pStartInner.y, x2: pStartOuter.x, y2: pStartOuter.y, type: 'cut' });

    // 2. Arista derecha de cierre (corte recto)
    lines.cuts.push({ x1: pEndInner.x, y1: pEndInner.y, x2: pEndOuter.x, y2: pEndOuter.y, type: 'cut' });

    // 3. Pestañas dentadas (dientes de sierra) y contorno superior (rho2)
    const topSawtooth = this.buildSawtoothArc(rho2, startAngle, endAngle, tabHeight, teethCount, true);
    lines.cuts.push(...topSawtooth.cuts);
    lines.cuts.push(this.createArcPath(0, 0, rho2, startAngle, endAngle, 'cut'));

    // 4. Pestañas dentadas (dientes de sierra) y contorno inferior (rho1)
    const bottomSawtooth = this.buildSawtoothArc(rho1, startAngle, endAngle, tabHeight, teethCount, false);
    lines.cuts.push(...bottomSawtooth.cuts);
    lines.cuts.push(this.createArcPath(0, 0, rho1, startAngle, endAngle, 'cut'));

    return {
      id: 'mantle',
      name: 'Desarrollo Lateral (Manto)',
      width: box.width,
      height: box.height,
      centerOffset: box.centerOffset,
      lines,
      boundingBox: box
    };
  }

  /**
   * Construye solapa lateral recta trapezoidal con chaflán
   */
  buildStraightSideTab(pInner, pOuter, height, bevelDeg) {
    if (height <= 0) {
      return {
        cutLines: []
      };
    }
    const dx = pOuter.x - pInner.x;
    const dy = pOuter.y - pInner.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    // Normal exterior perpendicular hacia la izquierda
    const nx = uy;
    const ny = -ux;

    const bevelRad = (bevelDeg * Math.PI) / 180;
    const inset = height * Math.tan(bevelRad);

    const p1 = { x: pInner.x + ux * inset + nx * height, y: pInner.y + uy * inset + ny * height };
    const p2 = { x: pOuter.x - ux * inset + nx * height, y: pOuter.y - uy * inset + ny * height };

    return {
      cutLines: [
        { x1: pInner.x, y1: pInner.y, x2: p1.x, y2: p1.y, type: 'cut' },
        { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' },
        { x1: p2.x, y1: p2.y, x2: pOuter.x, y2: pOuter.y, type: 'cut' }
      ]
    };
  }

  /**
   * Genera dientes de sierra en arcos curvos (triangulados / trapezoidales para encastre)
   */
  buildSawtoothArc(radius, startAngle, endAngle, tabHeight, teethCount, isInner) {
    if (tabHeight <= 0) {
      return {
        cuts: []
      };
    }
    const cuts = [];
    const totalAngle = endAngle - startAngle;
    const step = totalAngle / teethCount;

    // Si es arco interior (rho2), la pestaña va hacia el vértice (-radius direction)
    // Si es arco exterior (rho1), la pestaña va hacia afuera (+radius direction)
    const sign = isInner ? -1 : 1;

    for (let i = 0; i < teethCount; i++) {
      const a0 = startAngle + i * step;
      const a1 = startAngle + (i + 1) * step;
      const am = (a0 + a1) / 2;

      // Puntos en la línea base (doblez)
      const p0 = this.polarToCartesian(0, 0, radius, a0);
      const p1 = this.polarToCartesian(0, 0, radius, a1);

      // Punto punta del diente (triangulado o trapecio)
      const pPeak = this.polarToCartesian(0, 0, radius + sign * tabHeight, am);
      const pBaseLeft = this.polarToCartesian(0, 0, radius + sign * (tabHeight * 0.95), a0 + step * 0.15);
      const pBaseRight = this.polarToCartesian(0, 0, radius + sign * (tabHeight * 0.95), a1 - step * 0.15);

      // Trazos de corte para el diente
      cuts.push({ x1: p0.x, y1: p0.y, x2: pBaseLeft.x, y2: pBaseLeft.y, type: 'cut' });
      cuts.push({ x1: pBaseLeft.x, y1: pBaseLeft.y, x2: pPeak.x, y2: pPeak.y, type: 'cut' });
      cuts.push({ x1: pPeak.x, y1: pPeak.y, x2: pBaseRight.x, y2: pBaseRight.y, type: 'cut' });
      cuts.push({ x1: pBaseRight.x, y1: pBaseRight.y, x2: p1.x, y2: p1.y, type: 'cut' });
    }

    return { cuts };
  }

  /**
   * Genera tapa circular estructural de diámetro D (superior o inferior)
   */
  buildCapPiece(radius, name, id, tabHeight) {
    const diameter = radius * 2;
    const cuts = [];
    const folds = [];

    // Perímetro exterior de corte circular puro (sin solapa propia ya que encastra en los dientes del manto)
    const segments = 64;
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * 2 * Math.PI;
      const a2 = ((i + 1) / segments) * 2 * Math.PI;
      const p1 = { x: Math.cos(a1) * radius, y: Math.sin(a1) * radius };
      const p2 = { x: Math.cos(a2) * radius, y: Math.sin(a2) * radius };
      cuts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' });
    }

    return {
      id,
      name,
      width: diameter + 4,
      height: diameter + 4,
      centerOffset: { x: 0, y: 0 },
      lines: {
        cuts,
        mountainFolds: [],
        valleyFolds: [],
        tabs: [],
        markings: [
          { x1: -5, y1: -5, x2: 5, y2: 5, type: 'centroid-x', color: '#FF3B30', width: 0.5 },
          { x1: -5, y1: 5, x2: 5, y2: -5, type: 'centroid-x', color: '#FF3B30', width: 0.5 },
          { x1: -6, y1: 0, x2: 6, y2: 0, type: 'axis-plus', color: '#0066CC', width: 0.4 },
          { x1: 0, y1: -6, x2: 0, y2: 6, type: 'axis-plus', color: '#0066CC', width: 0.4 }
        ]
      },
      boundingBox: { minX: -radius, maxX: radius, minY: -radius, maxY: radius, width: diameter, height: diameter }
    };
  }

  sampleEquidistantPolyline(rawVertices, N) {
    if (!rawVertices || rawVertices.length < 3) return [];
    const pts = [...rawVertices, rawVertices[0]];
    const cumLen = [0];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i+1].y - pts[i].y, pts[i+1].z - pts[i].z);
      cumLen.push(cumLen[cumLen.length - 1] + d);
    }
    const totalLen = cumLen[cumLen.length - 1];
    if (totalLen < 1e-6) return pts.slice(0, N + 1);

    const res = [];
    for (let i = 0; i <= N; i++) {
      const target = (i / N) * totalLen;
      let idx = 0;
      while (idx < cumLen.length - 2 && cumLen[idx + 1] < target) {
        idx++;
      }
      const l0 = cumLen[idx];
      const l1 = cumLen[idx + 1];
      const t = (l1 - l0) > 1e-6 ? (target - l0) / (l1 - l0) : 0;
      res.push({
        y: pts[idx].y + t * (pts[idx+1].y - pts[idx].y),
        z: pts[idx].z + t * (pts[idx+1].z - pts[idx].z)
      });
    }
    return res;
  }

  calculateShapeCentroid(vertices2D) {
    let A = 0;
    let Cy = 0;
    let Cz = 0;
    const n = vertices2D.length;
    for (let i = 0; i < n; i++) {
      const p1 = vertices2D[i];
      const p2 = vertices2D[(i + 1) % n];
      const cross = (p1.y * p2.z - p2.y * p1.z);
      A += cross;
      Cy += (p1.y + p2.y) * cross;
      Cz += (p1.z + p2.z) * cross;
    }
    A *= 0.5;
    if (Math.abs(A) < 1e-6) {
      const sum = vertices2D.reduce((acc, p) => ({ y: acc.y + p.y, z: acc.z + p.z }), { y: 0, z: 0 });
      return { y: sum.y / n, z: sum.z / n, area: 0 };
    }
    Cy /= (6 * A);
    Cz /= (6 * A);
    return { y: Cy, z: Cz, area: Math.abs(A) };
  }

  getStationPerimeter2D(station, N = 32) {
    const shape = station.shape || 'circle';
    const cz = station.z || 0;
    const cy = station.yOffset || 0;
    const raw = [];

    if (shape === 'ellipse') {
      const rx = (station.w || station.d || 60) / 2;
      const ry = (station.h || station.d || 40) / 2;
      for (let i = 0; i < N; i++) {
        const phi = (i / N) * 2 * Math.PI - Math.PI;
        raw.push({ y: cy + rx * Math.cos(phi), z: cz + ry * Math.sin(phi) });
      }
      return this.sampleEquidistantPolyline(raw, N);
    } else if (shape === 'rect') {
      const w = station.w || 60;
      const h = station.h || 40;
      const pts = [];
      const m = Math.max(1, Math.floor(N / 4));
      
      // Comenzar en el centro inferior (0, -h/2) para alinear con círculos que empiezan en -PI/2
      // Recorrido en sentido antihorario
      // 1. Mitad derecha del borde inferior
      for(let i=0; i<m/2; i++) pts.push({ y: cy + (w/2)*(i/(m/2)), z: cz - h/2 });
      // 2. Borde derecho
      for(let i=0; i<m; i++) pts.push({ y: cy + w/2, z: cz - h/2 + h*(i/m) });
      // 3. Borde superior
      for(let i=0; i<m; i++) pts.push({ y: cy + w/2 - w*(i/m), z: cz + h/2 });
      // 4. Borde izquierdo
      for(let i=0; i<m; i++) pts.push({ y: cy - w/2, z: cz + h/2 - h*(i/m) });
      // 5. Mitad izquierda del borde inferior
      for(let i=0; i<m/2; i++) pts.push({ y: cy - w/2 + (w/2)*(i/(m/2)), z: cz - h/2 });
      
      while(pts.length < N) pts.push({ ...pts[pts.length - 1] });
      pts.length = N; // Asegurar exactamente N puntos
      pts.push({ ...pts[0] }); // Cerrar el loop
      return pts;
    } else if (shape === 'rounded_rect') {
      const w = station.w || 60;
      const h = station.h || 40;
      const r = Math.min(station.r || 10, w/2, h/2);
      const steps = 8;
      const corners = [
        { cx: cy + w/2 - r, cy: cz - h/2 + r, startAngle: -Math.PI/2, endAngle: 0 },
        { cx: cy + w/2 - r, cy: cz + h/2 - r, startAngle: 0, endAngle: Math.PI/2 },
        { cx: cy - w/2 + r, cy: cz + h/2 - r, startAngle: Math.PI/2, endAngle: Math.PI },
        { cx: cy - w/2 + r, cy: cz - h/2 + r, startAngle: Math.PI, endAngle: Math.PI*1.5 }
      ];
      corners.forEach(c => {
        for (let i = 0; i < steps; i++) {
          const a = c.startAngle + (i / steps) * (c.endAngle - c.startAngle);
          raw.push({ y: c.cx + r * Math.cos(a), z: c.cy + r * Math.sin(a) });
        }
      });
      return this.sampleEquidistantPolyline(raw, N);
    } else if (shape === 'polygon') {
      const d = station.d || 60;
      const sides = Math.max(3, parseInt(station.sides) || 6);
      const rad = d / 2;
      const pts = [];
      const m = Math.max(1, Math.floor(N / sides));
      
      for (let i = 0; i < sides; i++) {
        const phi1 = (i / sides) * 2 * Math.PI - Math.PI / 2;
        const phi2 = ((i + 1) / sides) * 2 * Math.PI - Math.PI / 2;
        const p1 = { y: cy + rad * Math.cos(phi1), z: cz + rad * Math.sin(phi1) };
        const p2 = { y: cy + rad * Math.cos(phi2), z: cz + rad * Math.sin(phi2) };
        
        for (let j = 0; j < m; j++) {
           pts.push({
             y: p1.y + (p2.y - p1.y) * (j / m),
             z: p1.z + (p2.z - p1.z) * (j / m)
           });
        }
      }
      while(pts.length < N) pts.push({ ...pts[pts.length - 1] });
      pts.length = N;
      pts.push({ ...pts[0] });
      return pts;
    } else if (shape === 'airfoil') {
      const c = station.w || 80;
      const t = (station.h || 12) / 100;
      const pointsTop = [];
      const pointsBot = [];
      const m = 20;
      for (let i = 0; i < m; i++) {
        const xc = (1 - Math.cos((i / (m - 1)) * Math.PI)) / 2;
        const yt = 5 * t * c * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc*xc + 0.2843 * Math.pow(xc, 3) - 0.1015 * Math.pow(xc, 4));
        pointsTop.push({ y: cy - c/2 + xc * c, z: cz + yt });
        pointsBot.unshift({ y: cy - c/2 + xc * c, z: cz - yt });
      }
      return this.sampleEquidistantPolyline([...pointsTop, ...pointsBot.slice(1, -1)], N);
    } else if (shape === 'custom') {
      if (station.customPoints && station.customPoints.length >= 3) {
        const pts = station.customPoints.map(p => ({ y: cy + (p.y || 0), z: cz + (p.z || 0) }));
        return this.sampleEquidistantPolyline(pts, N);
      }
    }

    // Default: 'circle'
    const R = (station.d || 60) / 2;
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * 2 * Math.PI - Math.PI;
      raw.push({ y: cy + R * Math.cos(phi), z: cz + R * Math.sin(phi) });
    }
    return this.sampleEquidistantPolyline(raw, N);
  }

  getStationPerimeter3D(station, xPos, N = 32) {
    const pts2D = this.getStationPerimeter2D(station, N);
    // Limitamos a 89.9 grados para evitar infinito en la tangente
    const pitchRad = Math.max(-89.9, Math.min(89.9, station.pitch || 0)) * (Math.PI / 180);
    const tanP = Math.tan(pitchRad);
    const cz = station.z || 0;
    
    return pts2D.map(p => {
      const localZ = p.z - cz; 
      // Transformación de Sesgo (Shear):
      // Mantiene la coordenada Z intacta para que las caras superior e inferior sigan horizontales,
      // pero desplaza X en base a la altura, simulando un corte oblicuo (ej. tobera F-15).
      const newX = xPos + localZ * tanP;
      return { x: newX, y: p.y, z: p.z };
    });
  }

  buildStationCapPiece(station, index, tabHeight) {
    const pts = this.getStationPerimeter2D(station, 64);
    const cuts = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = { x: pts[i].y, y: -pts[i].z };
      const p2 = { x: pts[i+1].y, y: -pts[i+1].z };
      cuts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' });
      minX = Math.min(minX, p1.x, p2.x);
      maxX = Math.max(maxX, p1.x, p2.x);
      minY = Math.min(minY, p1.y, p2.y);
      maxY = Math.max(maxY, p1.y, p2.y);
    }

    const centroid = this.calculateShapeCentroid(pts);
    const cx = centroid.y;
    const cy = -centroid.z;
    const size = 5;

    const markings = [
      { x1: cx - size, y1: cy - size, x2: cx + size, y2: cy + size, type: 'centroid-x', color: '#FF3B30', width: 0.5 },
      { x1: cx - size, y1: cy + size, x2: cx + size, y2: cy - size, type: 'centroid-x', color: '#FF3B30', width: 0.5 },
      { x1: -6, y1: 0, x2: 6, y2: 0, type: 'axis-plus', color: '#0066CC', width: 0.4 },
      { x1: 0, y1: -6, x2: 0, y2: 6, type: 'axis-plus', color: '#0066CC', width: 0.4 }
    ];

    const shapeName = station.shape ? station.shape.toUpperCase() : 'CIRCLE';
    return {
      id: `loft-cap-${index}`,
      name: `Cuaderna ${index} (${shapeName}, X=${station.x}mm)`,
      width: (maxX - minX) + 4,
      height: (maxY - minY) + 4,
      centerOffset: { x: 0, y: 0 },
      lines: {
        cuts,
        mountainFolds: [],
        valleyFolds: [],
        tabs: [],
        markings
      },
      boundingBox: { minX, maxX, minY, maxY, width: (maxX - minX), height: (maxY - minY) }
    };
  }

  /**
   * Generador para el caso Cilindro (D1 == D2)
   */
  calculateCylinder(params) {
    const d = parseFloat(params.d1) || 80;
    const h = parseFloat(params.height) || 90;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const incTop = params.includeTopCap !== false;
    const incBottom = params.includeBottomCap !== false;
    const margin = parseFloat(params.marginSecurity) || 5;

    const circumference = Math.PI * d;
    const w = circumference;
    const radius = d / 2;

    const lines = {
      cuts: [],
      mountainFolds: [],
      valleyFolds: [],
      tabs: []
    };

    const halfW = w / 2;
    const halfH = h / 2;

    if (tabH > 0) {
      // Dobleces en arista superior e inferior
      lines.mountainFolds.push({ x1: -halfW, y1: -halfH, x2: halfW, y2: -halfH, type: 'mountain' });
      lines.mountainFolds.push({ x1: -halfW, y1: halfH, x2: halfW, y2: halfH, type: 'mountain' });

      // Pestaña lateral izquierda
      const p1 = { x: -halfW - tabH, y: -halfH + tabH };
      const p2 = { x: -halfW - tabH, y: halfH - tabH };
      lines.cuts.push({ x1: -halfW, y1: -halfH, x2: p1.x, y2: p1.y, type: 'cut' });
      lines.cuts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' });
      lines.cuts.push({ x1: p2.x, y1: p2.y, x2: -halfW, y2: halfH, type: 'cut' });
      lines.mountainFolds.push({ x1: -halfW, y1: -halfH, x2: -halfW, y2: halfH, type: 'mountain' });

      // Borde lateral derecho (corte)
      lines.cuts.push({ x1: halfW, y1: -halfH, x2: halfW, y2: halfH, type: 'cut' });

      // Dientes de sierra en bordes superior e inferior
      const step = w / teethCount;
      for (let i = 0; i < teethCount; i++) {
        const x0 = -halfW + i * step;
        const x1 = -halfW + (i + 1) * step;
        const xm = (x0 + x1) / 2;
        // Superior (-Y)
        lines.cuts.push({ x1: x0, y1: -halfH, x2: xm, y2: -halfH - tabH, type: 'cut' });
        lines.cuts.push({ x1: xm, y1: -halfH - tabH, x2: x1, y2: -halfH, type: 'cut' });
        // Inferior (+Y)
        lines.cuts.push({ x1: x0, y1: halfH, x2: xm, y2: halfH + tabH, type: 'cut' });
        lines.cuts.push({ x1: xm, y1: halfH + tabH, x2: x1, y2: halfH, type: 'cut' });
      }
    } else {
      // Contorno rectangular puro (corte a tope / sin solapas)
      lines.cuts.push({ x1: -halfW, y1: -halfH, x2: halfW, y2: -halfH, type: 'cut' });
      lines.cuts.push({ x1: halfW, y1: -halfH, x2: halfW, y2: halfH, type: 'cut' });
      lines.cuts.push({ x1: halfW, y1: halfH, x2: -halfW, y2: halfH, type: 'cut' });
      lines.cuts.push({ x1: -halfW, y1: halfH, x2: -halfW, y2: -halfH, type: 'cut' });
    }

    const mantlePart = {
      id: 'mantle',
      name: 'Desarrollo Lateral (Cilindro)',
      width: w + tabH * 2,
      height: h + tabH * 2,
      lines,
      boundingBox: { minX: -halfW - tabH, maxX: halfW, minY: -halfH - tabH, maxY: halfH + tabH, width: w + tabH, height: h + tabH * 2 }
    };

    const parts = [mantlePart];
    if (incTop && radius > 0) {
      parts.push(this.buildCapPiece(radius, 'Tapa Superior (D=' + d.toFixed(1) + 'mm)', 'top-cap', tabH));
    }
    if (incBottom && radius > 0) {
      parts.push(this.buildCapPiece(radius, 'Tapa Inferior (D=' + d.toFixed(1) + 'mm)', 'bottom-cap', tabH));
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'cylinder',
      parameters: { d1: d, d2: d, height: h, tabHeight: tabH },
      metrics: {
        slantHeightMm: h.toFixed(2),
        sectorAngleDeg: '360.0',
        surfaceAreaCm2: ((Math.PI * d * h) / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  /**
   * Centra la geometría de cualquier pieza en (0, 0) según su bounding box
   */
  centerPieceGeometry(part) {
    if (!part || !part.boundingBox) return part;
    const box = part.boundingBox;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    if (Math.abs(cx) < 0.001 && Math.abs(cy) < 0.001) return part;

    const shiftLine = (line) => {
      if (line.isArc) {
        line.cx -= cx;
        line.cy -= cy;
        const start = this.polarToCartesian(line.cx, line.cy, line.radius, line.startAngle);
        const end = this.polarToCartesian(line.cx, line.cy, line.radius, line.endAngle);
        const largeArcFlag = line.endAngle - line.startAngle <= Math.PI ? 0 : 1;
        line.d = `M ${start.x} ${start.y} A ${line.radius} ${line.radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
      } else {
        if (line.x1 !== undefined) line.x1 -= cx;
        if (line.y1 !== undefined) line.y1 -= cy;
        if (line.x2 !== undefined) line.x2 -= cx;
        if (line.y2 !== undefined) line.y2 -= cy;
      }
    };

    if (part.lines) {
      ['cuts', 'mountainFolds', 'valleyFolds', 'markings', 'tabs'].forEach(key => {
        (part.lines[key] || []).forEach(shiftLine);
      });
    }

    part.boundingBox = {
      minX: box.minX - cx,
      maxX: box.maxX - cx,
      minY: box.minY - cy,
      maxY: box.maxY - cy,
      width: box.width,
      height: box.height,
      centerOffset: { x: 0, y: 0 }
    };
    return part;
  }

  /**
   * Empaqueta piezas en hojas A4 (210 x 297 mm) manteniendo escala real 1:1 en mm
   */
  layoutPartsOnA4(parts, marginSec) {
    parts.forEach(part => this.centerPieceGeometry(part));

    const pageWidth = this.A4_WIDTH - marginSec * 2;
    const pageHeight = this.A4_HEIGHT - marginSec * 2;

    const pages = [{ pageNum: 1, parts: [], overflow: false }];
    let currentPage = 0;

    // Posición actual para ir acomodando piezas
    let curX = marginSec + 15;
    let curY = marginSec + 20;
    let rowMaxH = 0;

    for (const part of parts) {
      const box = part.boundingBox;
      const partW = box.width;
      const partH = box.height;

      // Si la pieza sola es más ancha que una página A4, la centramos con advertencia de overflow
      if (partW > pageWidth || partH > pageHeight) {
        pages[currentPage].overflow = true;
      }

      // Si no cabe en la fila actual de la hoja, bajamos de fila
      if (curX + partW > this.A4_WIDTH - marginSec && pages[currentPage].parts.length > 0) {
        curX = marginSec + 15;
        curY += rowMaxH + 15;
        rowMaxH = 0;
      }

      // Si se pasa en vertical, creamos una nueva página A4
      if (curY + partH > this.A4_HEIGHT - marginSec && pages[currentPage].parts.length > 0) {
        currentPage++;
        pages.push({ pageNum: currentPage + 1, parts: [], overflow: false });
        curX = marginSec + 15;
        curY = marginSec + 20;
        rowMaxH = 0;
      }

      // Asignar posición central absoluta para la pieza en mm (origen = centro geométrico de la pieza)
      const posX = Math.round(curX + partW / 2);
      const posY = Math.round(curY + partH / 2);

      part.layout = {
        pageIndex: currentPage,
        x: posX,
        y: posY,
        rotation: 0
      };

      pages[currentPage].parts.push(part);

      curX += partW + 15;
      if (partH > rowMaxH) {
        rowMaxH = partH;
      }
    }

    return {
      pages,
      pageCount: pages.length,
      overflow: pages.some(p => p.overflow)
    };
  }

  /**
   * Bounding box en mm de un sector circular
   */
  getSectorBoundingBox(rho1, rho2, thetaRad, tabH) {
    const minAngle = -thetaRad / 2;
    const maxAngle = thetaRad / 2;

    const sampleAngles = [minAngle, maxAngle, 0];
    if (minAngle < -Math.PI / 2 && maxAngle > -Math.PI / 2) sampleAngles.push(-Math.PI / 2);
    if (minAngle < Math.PI / 2 && maxAngle > Math.PI / 2) sampleAngles.push(Math.PI / 2);
    if (minAngle < -Math.PI && maxAngle > -Math.PI) sampleAngles.push(-Math.PI);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const r of [rho2 - tabH, rho1 + tabH]) {
      for (const a of sampleAngles) {
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerOffset: { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2 }
    };
  }

  polarToCartesian(cx, cy, r, angleRad) {
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad)
    };
  }

  createArcPath(cx, cy, radius, startAngle, endAngle, type) {
    const start = this.polarToCartesian(cx, cy, radius, startAngle);
    const end = this.polarToCartesian(cx, cy, radius, endAngle);
    const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;

    return {
      isArc: true,
      cx,
      cy,
      radius,
      startAngle,
      endAngle,
      d: `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      type
    };
  }

  /**
   * Genera el desarrollo 2D de un Cono Completo (Vértice en punta sin D2)
   */
  calculateCone(params) {
    const d1 = parseFloat(params.d1) || 80;
    const h = parseFloat(params.height) || 90;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const incBottom = params.includeBottomCap !== false;
    const margin = parseFloat(params.marginSecurity) || 5;

    const r1 = d1 / 2;
    const g = Math.sqrt(r1 * r1 + h * h);
    const rho1 = g;
    const thetaRad = (2 * Math.PI * r1) / rho1;
    const thetaDeg = thetaRad * (180 / Math.PI);

    const sectorBox = this.getSectorBoundingBox(rho1, 0, thetaRad, tabH);
    const parts = [];

    const mantlePart = this.buildConeMantlePiece({
      rho1,
      thetaRad,
      tabHeight: tabH,
      teethCount,
      box: sectorBox
    });
    parts.push(mantlePart);

    if (incBottom && r1 > 0) {
      parts.push(this.buildCapPiece(r1, 'Tapa Inferior Base (D=' + (r1 * 2).toFixed(1) + 'mm)', 'bottom-cap', tabH));
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'cone',
      parameters: { d1, d2: 0, height: h, tabHeight: tabH, g: g.toFixed(2), rho1: rho1.toFixed(2), rho2: '0.00', thetaDeg: thetaDeg.toFixed(1) },
      metrics: {
        slantHeightMm: g.toFixed(2),
        sectorAngleDeg: thetaDeg.toFixed(1),
        surfaceAreaCm2: ((Math.PI * r1 * g) / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  buildConeMantlePiece({ rho1, thetaRad, tabHeight, teethCount, box }) {
    const lines = {
      cuts: [],
      mountainFolds: [],
      valleyFolds: [],
      tabs: []
    };

    const startAngle = -thetaRad / 2;
    const endAngle = thetaRad / 2;

    const pStartInner = { x: 0, y: 0 };
    const pStartOuter = this.polarToCartesian(0, 0, rho1, startAngle);
    const pEndInner = { x: 0, y: 0 };
    const pEndOuter = this.polarToCartesian(0, 0, rho1, endAngle);

    // Pestaña lateral recta en arista izquierda
    const sideTab = this.buildStraightSideTab(pStartInner, pStartOuter, tabHeight, 30);
    lines.cuts.push(...sideTab.cutLines);
    lines.cuts.push({ x1: 0, y1: 0, x2: pStartOuter.x, y2: pStartOuter.y, type: 'cut' });

    // Corte derecho
    lines.cuts.push({ x1: 0, y1: 0, x2: pEndOuter.x, y2: pEndOuter.y, type: 'cut' });

    // Pestañas dentadas SOLAMENTE en arco inferior (rho1)
    const bottomSawtooth = this.buildSawtoothArc(rho1, startAngle, endAngle, tabHeight, teethCount, false);
    lines.cuts.push(...bottomSawtooth.cuts);
    lines.cuts.push(this.createArcPath(0, 0, rho1, startAngle, endAngle, 'cut'));

    return {
      id: 'mantle',
      name: 'Desarrollo Lateral (Cono Completo)',
      width: box.width,
      height: box.height,
      centerOffset: box.centerOffset,
      lines,
      boundingBox: box
    };
  }

  intersect2DCircles(p1, r1, p2, r2, preferSidePt) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
      const ux = dx / (d || 1), uy = dy / (d || 1);
      return { x: p1.x + ux * r1, y: p1.y + uy * r1 };
    }
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const x2 = p1.x + (dx * a) / d;
    const y2 = p1.y + (dy * a) / d;
    const s1 = { x: x2 + (h * dy) / d, y: y2 - (h * dx) / d };
    const s2 = { x: x2 - (h * dy) / d, y: y2 + (h * dx) / d };
    const dist1 = (s1.x - preferSidePt.x) ** 2 + (s1.y - preferSidePt.y) ** 2;
    const dist2 = (s2.x - preferSidePt.x) ** 2 + (s2.y - preferSidePt.y) ** 2;
    return dist1 < dist2 ? s1 : s2;
  }

  buildSawtoothPolyline(points, tabHeight, teethCount, isTop) {
    const cuts = [];
    const mountainFolds = [];
    if (points.length < 2) return { cuts, mountainFolds };
    if (tabHeight <= 0) {
      for (let i = 0; i < points.length - 1; i++) {
        cuts.push({ x1: points[i].x, y1: points[i].y, x2: points[i+1].x, y2: points[i+1].y, type: 'cut' });
      }
      return { cuts, mountainFolds };
    }
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      mountainFolds.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'mountain' });
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      let nx = dy / len;
      let ny = -dx / len;
      if (!isTop) {
        nx = -nx;
        ny = -ny;
      }
      const insetX = dx * 0.15;
      const insetY = dy * 0.15;
      const pBaseA = { x: p1.x + insetX, y: p1.y + insetY };
      const pBaseB = { x: p2.x - insetX, y: p2.y - insetY };
      const pPeakA = { x: pBaseA.x + nx * tabHeight, y: pBaseA.y + ny * tabHeight };
      const pPeakB = { x: pBaseB.x + nx * tabHeight, y: pBaseB.y + ny * tabHeight };
      cuts.push({ x1: p1.x, y1: p1.y, x2: pPeakA.x, y2: pPeakA.y, type: 'cut' });
      cuts.push({ x1: pPeakA.x, y1: pPeakA.y, x2: pPeakB.x, y2: pPeakB.y, type: 'cut' });
      cuts.push({ x1: pPeakB.x, y1: pPeakB.y, x2: p2.x, y2: p2.y, type: 'cut' });
    }
    return { cuts, mountainFolds };
  }

  /**
   * Genera desarrollo 2D por Triangulación para una sección excéntrica (Descentrado Vertical Z / Oblicua / Codo)
   */
  calculateEccentricSegment(params) {
    const d1 = parseFloat(params.d1) || 60;
    const d2 = parseFloat(params.d2) || 60;
    const L = parseFloat(params.height) || 50;
    const z1 = parseFloat(params.z1) || 0;
    const z2 = parseFloat(params.z2) || 0;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const margin = parseFloat(params.marginSecurity) || 5;

    const s1 = params.station1 || { d: d1, z: z1, shape: 'circle' };
    const s2 = params.station2 || { d: d2, z: z2, shape: 'circle' };
    const N = 32;
    const pts3D_1 = this.getStationPerimeter3D(s1, 0, N);
    const pts3D_2 = this.getStationPerimeter3D(s2, L, N);

    const V1 = [{ x: 0, y: 0 }];
    const G0 = Math.hypot(pts3D_2[0].x - pts3D_1[0].x, pts3D_2[0].y - pts3D_1[0].y, pts3D_2[0].z - pts3D_1[0].z);
    const V2 = [{ x: 0, y: -G0 }];

    let totalArea = 0;
    for (let i = 0; i < N; i++) {
      const P1_a = pts3D_1[i], P1_b = pts3D_1[i+1];
      const P2_a = pts3D_2[i], P2_b = pts3D_2[i+1];
      
      const a1 = Math.hypot(P1_b.x - P1_a.x, P1_b.y - P1_a.y, P1_b.z - P1_a.z);
      const a2 = Math.hypot(P2_b.x - P2_a.x, P2_b.y - P2_a.y, P2_b.z - P2_a.z);
      const D  = Math.hypot(P2_a.x - P1_b.x, P2_a.y - P1_b.y, P2_a.z - P1_b.z);
      const G_next = Math.hypot(P2_b.x - P1_b.x, P2_b.y - P1_b.y, P2_b.z - P1_b.z);
      
      let dir1x = 1, dir1y = 0;
      if (i > 0) {
        const d_prev = Math.hypot(V1[i].x - V1[i-1].x, V1[i].y - V1[i-1].y) || 1;
        dir1x = (V1[i].x - V1[i-1].x) / d_prev;
        dir1y = (V1[i].y - V1[i-1].y) / d_prev;
      }
      const pref1 = { x: V1[i].x + dir1x * a1, y: V1[i].y + dir1y * a1 };
      const nextV1 = this.intersect2DCircles(V1[i], a1, V2[i], D, pref1);
      V1.push(nextV1);
      
      let dir2x = 1, dir2y = 0;
      if (i > 0) {
        const d_prev = Math.hypot(V2[i].x - V2[i-1].x, V2[i].y - V2[i-1].y) || 1;
        dir2x = (V2[i].x - V2[i-1].x) / d_prev;
        dir2y = (V2[i].y - V2[i-1].y) / d_prev;
      }
      const pref2 = { x: V2[i].x + dir2x * a2, y: V2[i].y + dir2y * a2 };
      const nextV2 = this.intersect2DCircles(nextV1, G_next, V2[i], a2, pref2);
      V2.push(nextV2);

      totalArea += 0.5 * a1 * D + 0.5 * a2 * G_next;
    }

    // Calcular bounding box para centrar en el origen de la pieza
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    [...V1, ...V2].forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });

    const w = maxX - minX;
    const h = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // Desplazar puntos para que el centro sea (0,0)
    const V1_c = V1.map(p => ({ x: p.x - cx, y: p.y - cy }));
    const V2_c = V2.map(p => ({ x: p.x - cx, y: p.y - cy }));

    const lines = { cuts: [], mountainFolds: [], valleyFolds: [], tabs: [] };

    // Borde izquierdo con solapa lateral recta
    const sideTab = this.buildStraightSideTab(V1_c[0], V2_c[0], tabH, 30);
    lines.cuts.push(...sideTab.cutLines);
    if (tabH > 0) {
      lines.mountainFolds.push({ x1: V1_c[0].x, y1: V1_c[0].y, x2: V2_c[0].x, y2: V2_c[0].y, type: 'mountain' });
    }

    // Borde derecho de cierre
    lines.cuts.push({ x1: V1_c[N].x, y1: V1_c[N].y, x2: V2_c[N].x, y2: V2_c[N].y, type: 'cut' });

    // Curvas superior e inferior con dientes de sierra (o corte a tope si tabH=0)
    const topSaw = this.buildSawtoothPolyline(V2_c, tabH, N, true);
    lines.cuts.push(...topSaw.cuts);
    lines.mountainFolds.push(...topSaw.mountainFolds);

    const botSaw = this.buildSawtoothPolyline(V1_c, tabH, N, false);
    lines.cuts.push(...botSaw.cuts);
    lines.mountainFolds.push(...botSaw.mountainFolds);

    const mantlePart = {
      id: 'mantle',
      name: 'Desarrollo Oblicuo / Excéntrico',
      width: w + tabH * 2,
      height: h + tabH * 2,
      lines,
      boundingBox: { minX: -w/2 - tabH, maxX: w/2 + tabH, minY: -h/2 - tabH, maxY: h/2 + tabH, width: w + tabH*2, height: h + tabH*2 }
    };

    const parts = [mantlePart];
    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'eccentric',
      parameters: { d1, d2, height: L, z1, z2, tabHeight: tabH },
      metrics: {
        totalWidthMm: (w + tabH * 2).toFixed(1),
        totalHeightMm: (h + tabH * 2).toFixed(1),
        surfaceAreaCm2: (totalArea / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  /**
   * Genera desarrollo 2D para un Prisma N-Lados (Caja / Tubo Poligonal)
   */
  calculatePrism(params) {
    const d1 = parseFloat(params.d1) || 80;
    const h = parseFloat(params.height) || 90;
    const sides = parseInt(params.sides) || 6;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const margin = parseFloat(params.marginSecurity) || 5;
    const incTop = params.includeTopCap !== false;
    const incBottom = params.includeBottomCap !== false;

    // Ancho de cada cara
    const sideW = d1 * Math.sin(Math.PI / sides);
    const totalW = sideW * sides;

    const lines = {
      cuts: [],
      mountainFolds: [],
      valleyFolds: [],
      tabs: []
    };

    const startX = -totalW / 2;
    const startY = -h / 2;

    for (let i = 0; i < sides; i++) {
      const x0 = startX + i * sideW;
      const x1 = startX + (i + 1) * sideW;

      // Líneas de doblez entre caras
      if (i > 0) {
        lines.mountainFolds.push({ x1: x0, y1: startY, x2: x0, y2: startY + h, type: 'mountain' });
      }

      // Solapas superiores e inferiores (trapezoidales)
      if (tabH > 0) {
        const inset = tabH * 0.4;
        // Superior
        lines.cuts.push({ x1: x0, y1: startY, x2: x0 + inset, y2: startY - tabH, type: 'cut' });
        lines.cuts.push({ x1: x0 + inset, y1: startY - tabH, x2: x1 - inset, y2: startY - tabH, type: 'cut' });
        lines.cuts.push({ x1: x1 - inset, y1: startY - tabH, x2: x1, y2: startY, type: 'cut' });
        lines.mountainFolds.push({ x1: x0, y1: startY, x2: x1, y2: startY, type: 'mountain' });

        // Inferior
        lines.cuts.push({ x1: x0, y1: startY + h, x2: x0 + inset, y2: startY + h + tabH, type: 'cut' });
        lines.cuts.push({ x1: x0 + inset, y1: startY + h + tabH, x2: x1 - inset, y2: startY + h + tabH, type: 'cut' });
        lines.cuts.push({ x1: x1 - inset, y1: startY + h + tabH, x2: x1, y2: startY + h, type: 'cut' });
        lines.mountainFolds.push({ x1: x0, y1: startY + h, x2: x1, y2: startY + h, type: 'mountain' });
      } else {
        lines.cuts.push({ x1: x0, y1: startY, x2: x1, y2: startY, type: 'cut' });
        lines.cuts.push({ x1: x0, y1: startY + h, x2: x1, y2: startY + h, type: 'cut' });
      }
    }

    // Solapa lateral izquierda
    if (tabH > 0) {
      const p1 = { x: startX - tabH, y: startY + tabH };
      const p2 = { x: startX - tabH, y: startY + h - tabH };
      lines.cuts.push({ x1: startX, y1: startY, x2: p1.x, y2: p1.y, type: 'cut' });
      lines.cuts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' });
      lines.cuts.push({ x1: p2.x, y1: p2.y, x2: startX, y2: startY + h, type: 'cut' });
      lines.mountainFolds.push({ x1: startX, y1: startY, x2: startX, y2: startY + h, type: 'mountain' });
    } else {
      lines.cuts.push({ x1: startX, y1: startY, x2: startX, y2: startY + h, type: 'cut' });
    }

    // Cierre derecho
    lines.cuts.push({ x1: startX + totalW, y1: startY, x2: startX + totalW, y2: startY + h, type: 'cut' });

    const parts = [{
      id: 'mantle',
      name: `Desarrollo Prisma (${sides} Lados)`,
      width: totalW + tabH * 2,
      height: h + tabH * 2,
      lines,
      boundingBox: { minX: startX - tabH, maxX: startX + totalW, minY: startY - tabH, maxY: startY + h + tabH, width: totalW + tabH, height: h + tabH * 2 }
    }];

    if (incTop && d1 > 0) {
      parts.push(this.buildPolygonCapPiece(d1 / 2, sides, `Tapa Superior (${sides}-Gon)`, 'top-cap'));
    }
    if (incBottom && d1 > 0) {
      parts.push(this.buildPolygonCapPiece(d1 / 2, sides, `Tapa Inferior (${sides}-Gon)`, 'bottom-cap'));
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'prism',
      parameters: { d1, d2: d1, height: h, sides, tabHeight: tabH },
      metrics: {
        slantHeightMm: h.toFixed(2),
        sectorAngleDeg: `${sides} Caras`,
        surfaceAreaCm2: ((totalW * h) / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  buildPolygonCapPiece(radius, sides, name, id) {
    const cuts = [];
    for (let i = 0; i < sides; i++) {
      const a1 = (i / sides) * 2 * Math.PI - Math.PI / 2;
      const a2 = ((i + 1) / sides) * 2 * Math.PI - Math.PI / 2;
      const p1 = { x: Math.cos(a1) * radius, y: Math.sin(a1) * radius };
      const p2 = { x: Math.cos(a2) * radius, y: Math.sin(a2) * radius };
      cuts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, type: 'cut' });
    }
    return {
      id,
      name,
      width: radius * 2 + 4,
      height: radius * 2 + 4,
      centerOffset: { x: 0, y: 0 },
      lines: { cuts, mountainFolds: [], valleyFolds: [], tabs: [] },
      boundingBox: { minX: -radius, maxX: radius, minY: -radius, maxY: radius, width: radius * 2, height: radius * 2 }
    };
  }

  /**
   * Genera desarrollo 2D para una Pirámide N-Lados
   */
  calculatePyramid(params) {
    const d1 = parseFloat(params.d1) || 80;
    const h = parseFloat(params.height) || 90;
    const sides = parseInt(params.sides) || 4;
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const margin = parseFloat(params.marginSecurity) || 5;
    const incBottom = params.includeBottomCap !== false;

    const rBase = d1 / 2;
    const g = Math.sqrt(rBase * rBase + h * h);
    const thetaRad = (2 * Math.PI * rBase) / g;
    const thetaDeg = thetaRad * (180 / Math.PI);

    const sectorBox = this.getSectorBoundingBox(g, 0, thetaRad, tabH);
    const lines = { cuts: [], mountainFolds: [], valleyFolds: [], tabs: [] };

    const startAngle = -thetaRad / 2;
    const endAngle = thetaRad / 2;
    const step = (endAngle - startAngle) / sides;

    const pStartOuter = this.polarToCartesian(0, 0, g, startAngle);
    const sideTab = this.buildStraightSideTab({ x: 0, y: 0 }, pStartOuter, tabH, 30);
    lines.cuts.push(...sideTab.cutLines);
    if (tabH > 0) {
      lines.mountainFolds.push({ x1: 0, y1: 0, x2: pStartOuter.x, y2: pStartOuter.y, type: 'mountain' });
    }

    for (let i = 0; i < sides; i++) {
      const a0 = startAngle + i * step;
      const a1 = startAngle + (i + 1) * step;
      const p0 = this.polarToCartesian(0, 0, g, a0);
      const p1 = this.polarToCartesian(0, 0, g, a1);

      if (i > 0) {
        lines.mountainFolds.push({ x1: 0, y1: 0, x2: p0.x, y2: p0.y, type: 'mountain' });
      }

      if (tabH > 0) {
        // Arista exterior recta del polígono
        lines.mountainFolds.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, type: 'mountain' });
        // Solapa inferior en cada cara
        const ux = (p1.x - p0.x);
        const uy = (p1.y - p0.y);
        const len = Math.sqrt(ux * ux + uy * uy);
        const nx = uy / len;
        const ny = -ux / len;
        const pt0 = { x: p0.x + nx * tabH, y: p0.y + ny * tabH };
        const pt1 = { x: p1.x + nx * tabH, y: p1.y + ny * tabH };
        lines.cuts.push({ x1: p0.x, y1: p0.y, x2: pt0.x, y2: pt0.y, type: 'cut' });
        lines.cuts.push({ x1: pt0.x, y1: pt0.y, x2: pt1.x, y2: pt1.y, type: 'cut' });
        lines.cuts.push({ x1: pt1.x, y1: pt1.y, x2: p1.x, y2: p1.y, type: 'cut' });
      } else {
        lines.cuts.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, type: 'cut' });
      }
    }

    const pEndOuter = this.polarToCartesian(0, 0, g, endAngle);
    lines.cuts.push({ x1: 0, y1: 0, x2: pEndOuter.x, y2: pEndOuter.y, type: 'cut' });

    const parts = [{
      id: 'mantle',
      name: `Desarrollo Pirámide (${sides} Caras)`,
      width: sectorBox.width,
      height: sectorBox.height,
      centerOffset: sectorBox.centerOffset,
      lines,
      boundingBox: sectorBox
    }];

    if (incBottom && d1 > 0) {
      parts.push(this.buildPolygonCapPiece(rBase, sides, `Base Inferior (${sides}-Gon)`, 'bottom-cap'));
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'pyramid',
      parameters: { d1, d2: 0, height: h, sides, tabHeight: tabH },
      metrics: {
        slantHeightMm: g.toFixed(2),
        sectorAngleDeg: thetaDeg.toFixed(1),
        surfaceAreaCm2: ((Math.PI * rBase * g) / 100).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  /**
   * Genera desarrollo 2D para Media Esfera / Cúpula por Anillos Latitudinales (Conos Truncados Apilados)
   */
  calculateHemisphere(params) {
    const d1 = parseFloat(params.d1) || 100; // Diámetro ecuatorial
    const rings = Math.max(3, Math.min(12, parseInt(params.rings) || 5)); // Cantidad de anillos
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const margin = parseFloat(params.marginSecurity) || 5;
    const incBottom = params.includeBottomCap !== false;

    const R = d1 / 2;
    const parts = [];
    let totalAreaCm2 = 0;

    for (let i = 0; i < rings; i++) {
      const phi0 = (i / rings) * (Math.PI / 2);
      const phi1 = ((i + 1) / rings) * (Math.PI / 2);

      const rBot = R * Math.cos(phi0);
      const rTop = R * Math.cos(phi1);
      const h = R * (Math.sin(phi1) - Math.sin(phi0));

      const g = Math.sqrt(Math.pow(rBot - rTop, 2) + Math.pow(h, 2));

      if (i < rings - 1 && rBot - rTop > 0.01) {
        // Anillo como Cono Truncado
        const rho1 = g * (rBot / (rBot - rTop));
        const rho2 = g * (rTop / (rBot - rTop));
        const thetaRad = (2 * Math.PI * rBot) / rho1;
        const box = this.getSectorBoundingBox(rho1, rho2, thetaRad, tabH);

        const part = this.buildMantlePiece({
          rho1,
          rho2,
          thetaRad,
          tabHeight: tabH,
          tabAngleDeg: 60,
          teethCount,
          rBase: rBot,
          rTop,
          g,
          box
        });
        part.id = `ring_${i + 1}`;
        part.name = `Anillo ${i + 1}/${rings} (D=${(rBot * 2).toFixed(0)}→${(rTop * 2).toFixed(0)}mm)`;
        parts.push(part);
        totalAreaCm2 += (Math.PI * (rBot + rTop) * g) / 100;
      } else {
        // Casquete Polar superior como Cono Completo
        const rho1 = g;
        const thetaRad = (2 * Math.PI * rBot) / rho1;
        const box = this.getSectorBoundingBox(rho1, 0, thetaRad, tabH);

        const part = this.buildConeMantlePiece({
          rho1,
          thetaRad,
          tabHeight: tabH,
          teethCount,
          box
        });
        part.id = `ring_${i + 1}`;
        part.name = `Anillo ${i + 1}/${rings}: Casquete Polar (D=${(rBot * 2).toFixed(0)}mm)`;
        parts.push(part);
        totalAreaCm2 += (Math.PI * rBot * g) / 100;
      }
    }

    if (incBottom && R > 0) {
      parts.push(this.buildCapPiece(R, `Tapa Ecuador (D=${d1.toFixed(0)}mm)`, 'bottom-cap', tabH));
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'hemisphere',
      parameters: { d1, d2: 0, height: R, rings, tabHeight: tabH },
      metrics: {
        slantHeightMm: `${rings} Anillos`,
        sectorAngleDeg: 'Latitudinal',
        surfaceAreaCm2: totalAreaCm2.toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }

  /**
   * Genera desarrollo 2D para una Esfera Completa por Anillos Latitudinales
   */
  calculateSphere(params) {
    const d1 = parseFloat(params.d1) || 100;
    const rings = Math.max(3, Math.min(10, parseInt(params.rings) || 5));
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const margin = parseFloat(params.marginSecurity) || 5;

    // Calculamos los anillos del hemisferio norte y duplicamos para el sur (indicando en la etiqueta)
    const hemi = this.calculateHemisphere({
      d1,
      rings,
      tabHeight: tabH,
      teethPerArc: teethCount,
      marginSecurity: margin,
      includeBottomCap: false
    });

    const sphereParts = [];
    hemi.parts.forEach(p => {
      const pNorth = JSON.parse(JSON.stringify(p));
      pNorth.name = `[NORTE] ${p.name}`;
      pNorth.id = `${p.id}_N`;
      sphereParts.push(pNorth);

      const pSouth = JSON.parse(JSON.stringify(p));
      pSouth.name = `[SUR] ${p.name}`;
      pSouth.id = `${p.id}_S`;
      sphereParts.push(pSouth);
    });

    const layout = this.layoutPartsOnA4(sphereParts, margin);
    return {
      type: 'sphere',
      parameters: { d1, d2: 0, height: d1, rings: rings * 2, tabHeight: tabH },
      metrics: {
        slantHeightMm: `${rings * 2} Anillos`,
        sectorAngleDeg: 'Esfera 360°',
        surfaceAreaCm2: (parseFloat(hemi.metrics.surfaceAreaCm2) * 2).toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts: sphereParts
    };
  }
  /**
   * Genera desarrollo 2D para un Fuselaje de Revolución por Cuadernas (Loft)
   * @param {Object} params - { stations: [{x, d}, ...], tabHeight, includeCaps, marginSecurity, teethPerArc }
   */
  calculateLoft(params) {
    const stations = params.stations || [];
    const tabH = (params.tabHeight !== undefined && !isNaN(params.tabHeight)) ? Number(params.tabHeight) : 6;
    const teethCount = parseInt(params.teethPerArc) || 16;
    const margin = parseFloat(params.marginSecurity) || 5;
    const incCaps = params.includeCaps !== false;

    // Ordenar estaciones por X
    stations.sort((a, b) => a.x - b.x);

    const parts = [];
    let totalAreaCm2 = 0;
    let totalLength = 0;

    // Generar segmentos entre estaciones adyacentes
    for (let i = 0; i < stations.length - 1; i++) {
      const s1 = stations[i];
      const s2 = stations[i+1];
      const length = Math.abs(s2.x - s1.x);
      
      if (length <= 0.01) continue; // Ignorar segmentos de longitud 0
      
      const dz = (s2.z || 0) - (s1.z || 0);

      const p = {
        station1: s1,
        station2: s2,
        d1: s1.d || s1.w || 60,
        d2: s2.d || s2.w || 60,
        height: length,
        z1: s1.z || 0,
        z2: s2.z || 0,
        tabHeight: tabH,
        teethPerArc: teethCount,
        marginSecurity: margin,
        includeTopCap: false,
        includeBottomCap: false
      };

      let segData;
      const isCircle1 = (!s1.shape || s1.shape === 'circle') && !s1.yOffset;
      const isCircle2 = (!s2.shape || s2.shape === 'circle') && !s2.yOffset;

      if (!isCircle1 || !isCircle2 || Math.abs(dz) >= 0.01) {
        segData = this.calculateEccentricSegment(p);
      } else if (Math.abs(p.d1 - p.d2) < 0.01) {
        segData = this.calculateCylinder(p);
      } else if (p.d2 === 0 || p.d1 === 0) {
        const dMayor = Math.max(p.d1, p.d2);
        segData = this.calculateCone({ ...p, d1: dMayor });
      } else {
        segData = this.calculateTruncatedCone(p);
      }

      // Añadir la pieza de manto del segmento, renombrada apropiadamente
      if (segData.parts && segData.parts.length > 0) {
        const mantle = segData.parts[0]; // Siempre es el primero porque includeCaps = false
        const dzStr = Math.abs(dz) >= 0.01 ? `, dz=${dz}mm` : '';
        mantle.name = `Sección ${i+1} (D=${p.d1} a ${p.d2}, L=${length}${dzStr})`;
        mantle.id = `loft-sec-${i+1}`;
        parts.push(mantle);
        totalAreaCm2 += parseFloat(segData.metrics.surfaceAreaCm2 || 0);
      }
      totalLength += length;
    }

    // Generar Cuadernas estructurales
    if (incCaps) {
      stations.forEach((s, i) => {
        if ((s.d && s.d > 0) || (s.w && s.w > 0) || s.shape === 'custom') {
          const cap = this.buildStationCapPiece(s, i+1, tabH);
          parts.push(cap);
        }
      });
    }

    const layout = this.layoutPartsOnA4(parts, margin);
    return {
      type: 'loft',
      parameters: { stations, tabHeight: tabH },
      metrics: {
        slantHeightMm: `${stations.length} Cuadernas`,
        sectorAngleDeg: `${parts.length} Piezas`,
        surfaceAreaCm2: totalAreaCm2.toFixed(2),
        fitsInSingleA4: layout.pageCount === 1 && !layout.overflow,
        pageCount: layout.pageCount
      },
      pages: layout.pages,
      parts
    };
  }
}
