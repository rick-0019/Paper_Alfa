/**
 * PAPER ALFA - 2D Vector Layout Viewer (v1.0)
 * Renderizador en tiempo real de SVG nativo que simula la hoja A4 (210x297 mm)
 * con margen de seguridad, grilla técnica en mm y despiece vectorial con estilos CAD.
 */

export class PaperAlfaViewer2D {
  constructor(svgElementId) {
    this.svg = document.getElementById(svgElementId);
    this.A4_WIDTH = 210; // mm
    this.A4_HEIGHT = 297; // mm
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.currentPage = 0;
    this.setupZoomPan();
  }

  setupZoomPan() {
    if (!this.svg) return;

    let isDragging = false;
    let startX = 0, startY = 0;

    this.svg.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Click izquierdo
        isDragging = true;
        startX = e.clientX - this.panX;
        startY = e.clientY - this.panY;
        this.svg.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      this.panX = e.clientX - startX;
      this.panY = e.clientY - startY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      if (this.svg) this.svg.style.cursor = 'default';
    });

    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.3, Math.min(5.0, this.zoom * zoomFactor));
      this.zoom = newZoom;
      this.updateTransform();
    });
  }

  updateTransform() {
    const container = this.svg.querySelector('#layout-container');
    if (container) {
      container.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`);
    }
  }

  resetView() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  /**
   * Renderiza el modelo 2D en el SVG
   * @param {Object} modelData - Datos calculados por PaperAlfaGeometry
   * @param {number|string} pageIndex - Hoja A4 a mostrar ('all' para ver todas juntas)
   */
  render(modelData, pageIndex = 0) {
    if (!this.svg) return;
    this.svg.innerHTML = ''; // Limpiar lienzo

    const margin = parseFloat(modelData.parameters?.marginSecurity) || 5;
    const pages = modelData.pages || [];

    // Grupo contenedor para Zoom / Pan
    const container = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    container.setAttribute('id', 'layout-container');
    this.svg.appendChild(container);

    if (pageIndex === 'all' || pageIndex === -1) {
      // Renderizar todas las páginas apiladas verticalmente con un espacio
      const spacing = 25;
      const totalHeight = pages.length * (this.A4_HEIGHT + spacing);
      this.svg.setAttribute('viewBox', `-15 -15 ${this.A4_WIDTH + 30} ${totalHeight + 15}`);

      pages.forEach((page, idx) => {
        const offsetY = idx * (this.A4_HEIGHT + spacing);
        this.renderSinglePage(container, modelData, page, idx + 1, pages.length, margin, 0, offsetY);

        // Título de separación de hoja
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', 5);
        title.setAttribute('y', offsetY - 5);
        title.setAttribute('fill', '#00F0FF');
        title.setAttribute('font-family', 'JetBrains Mono, monospace');
        title.setAttribute('font-size', '6');
        title.setAttribute('font-weight', 'bold');
        title.textContent = `[HOJA A4 #${idx + 1} DE ${pages.length}]`;
        container.appendChild(title);
      });
    } else {
      // Renderizar solo la página seleccionada
      this.svg.setAttribute('viewBox', `-10 -10 ${this.A4_WIDTH + 20} ${this.A4_HEIGHT + 20}`);
      const page = pages[pageIndex] || pages[0];
      this.renderSinglePage(container, modelData, page, (pageIndex || 0) + 1, pages.length, margin, 0, 0);
    }

    this.updateTransform();
  }

  renderSinglePage(container, modelData, page, pageNum, totalPages, margin, offsetX = 0, offsetY = 0) {
    const pageGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pageGroup.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);
    container.appendChild(pageGroup);

    // 1. Dibujar Hoja A4 blanca con sombreado realista
    const shadowRect = this.createSVGRect(-2, -2, this.A4_WIDTH + 4, this.A4_HEIGHT + 4, '#090D14', 0.5);
    pageGroup.appendChild(shadowRect);

    const sheetRect = this.createSVGRect(0, 0, this.A4_WIDTH, this.A4_HEIGHT, '#FFFFFF', 1.0);
    sheetRect.setAttribute('stroke', '#CCCCCC');
    sheetRect.setAttribute('stroke-width', '0.5');
    pageGroup.appendChild(sheetRect);

    // 2. Grilla milimétrica (cada 10 mm = 1 cm)
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('class', 'technical-grid');
    for (let x = 10; x < this.A4_WIDTH; x += 10) {
      gridGroup.appendChild(this.createSVGLine(x, 0, x, this.A4_HEIGHT, '#EEF2F6', 0.2));
    }
    for (let y = 10; y < this.A4_HEIGHT; y += 10) {
      gridGroup.appendChild(this.createSVGLine(0, y, this.A4_WIDTH, y, '#EEF2F6', 0.2));
    }
    pageGroup.appendChild(gridGroup);

    // 3. Línea de Margen de Seguridad (Rojo suave punteado)
    const marginRect = this.createSVGRect(
      margin,
      margin,
      this.A4_WIDTH - margin * 2,
      this.A4_HEIGHT - margin * 2,
      'none',
      1.0
    );
    marginRect.setAttribute('stroke', '#FF3B30');
    marginRect.setAttribute('stroke-width', '0.4');
    marginRect.setAttribute('stroke-dasharray', '4, 2');
    marginRect.setAttribute('stroke-opacity', '0.6');
    pageGroup.appendChild(marginRect);

    // 4. Cartela / Title Block en esquina
    this.renderSVGTitleBlock(pageGroup, modelData, pageNum, totalPages, margin);

    // 5. Renderizar piezas de esta hoja
    if (page && page.parts) {
      const partsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      partsGroup.setAttribute('class', 'parts-layer');

      page.parts.forEach(part => {
        const partG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const originX = part.layout ? part.layout.x : 105;
        const originY = part.layout ? part.layout.y : 148;

        partG.setAttribute('transform', `translate(${originX}, ${originY})`);

        // Etiqueta de la pieza
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', 0);
        label.setAttribute('y', -part.height / 2 - 4);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#334155');
        label.setAttribute('font-family', 'JetBrains Mono, monospace');
        label.setAttribute('font-size', '4.5');
        label.setAttribute('font-weight', 'bold');
        label.textContent = `${part.name.toUpperCase()} (${Math.round(part.width)}x${Math.round(part.height)}mm)`;
        partG.appendChild(label);

        // Renderizar trazos
        const lines = part.lines || {};
        // Dobleces montaña (azul punteado)
        (lines.mountainFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#0066CC', '0.35', '2, 1')));
        // Dobleces valle (rojo punteado)
        (lines.valleyFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#CC0000', '0.35', '1, 1')));
        // Cortes exteriores (negro continuo)
        (lines.cuts || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#090D14', '0.55', 'none')));

        partsGroup.appendChild(partG);
      });

      pageGroup.appendChild(partsGroup);
    }

    // 6. Regla de comprobación 50 mm abajo a la izquierda
    this.renderSVGRuler(pageGroup, margin + 5, this.A4_HEIGHT - margin - 12);
  }

  renderSVGTitleBlock(container, modelData, pageNum, totalPages, margin) {
    const boxW = 80, boxH = 12;
    const x = this.A4_WIDTH - margin - boxW;
    const y = margin;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = this.createSVGRect(x, y, boxW, boxH, '#F8FAFC', 0.9);
    rect.setAttribute('stroke', '#334155');
    rect.setAttribute('stroke-width', '0.4');
    g.appendChild(rect);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', x + 3);
    title.setAttribute('y', y + 4.5);
    title.setAttribute('fill', '#0F172A');
    title.setAttribute('font-family', 'Inter, sans-serif');
    title.setAttribute('font-size', '4');
    title.setAttribute('font-weight', 'bold');
    title.textContent = 'PAPER ALFA • CAD SPEC A4 (1:1)';
    g.appendChild(title);

    const subtitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subtitle.setAttribute('x', x + 3);
    subtitle.setAttribute('y', y + 9.5);
    subtitle.setAttribute('fill', '#475569');
    subtitle.setAttribute('font-family', 'JetBrains Mono, monospace');
    subtitle.setAttribute('font-size', '3.2');
    subtitle.textContent = `PÁGINA ${pageNum}/${totalPages}  |  MARGEN: ${margin}mm`;
    g.appendChild(subtitle);

    container.appendChild(g);
  }

  renderSVGRuler(container, x, y) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const base = this.createSVGLine(x, y, x + 50, y, '#090D14', 0.5);
    g.appendChild(base);

    for (let i = 0; i <= 50; i += 5) {
      let h = i % 10 === 0 ? 3 : 2;
      g.appendChild(this.createSVGLine(x + i, y, x + i, y - h, '#090D14', 0.4));
      if (i % 10 === 0) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + i);
        text.setAttribute('y', y - 4);
        text.setAttribute('fill', '#0F172A');
        text.setAttribute('font-size', '3');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', 'JetBrains Mono, monospace');
        text.textContent = `${i}`;
        g.appendChild(text);
      }
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', y + 3.5);
    label.setAttribute('fill', '#0066CC');
    label.setAttribute('font-size', '3');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.textContent = 'REGLA 50MM ESPECÍFICA DE CALIBRACIÓN';
    g.appendChild(label);

    container.appendChild(g);
  }

  createSVGRect(x, y, w, h, fill, opacity) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', fill);
    rect.setAttribute('fill-opacity', opacity);
    return rect;
  }

  createSVGLine(x1, y1, x2, y2, stroke, strokeWidth) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', strokeWidth);
    return line;
  }

  createSVGPathOrLine(item, strokeColor, strokeWidth, strokeDash) {
    if (item.isArc) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', item.d);
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', strokeWidth);
      path.setAttribute('fill', 'none');
      if (strokeDash !== 'none') path.setAttribute('stroke-dasharray', strokeDash);
      return path;
    } else {
      const line = this.createSVGLine(item.x1, item.y1, item.x2, item.y2, strokeColor, strokeWidth);
      if (strokeDash !== 'none') line.setAttribute('stroke-dasharray', strokeDash);
      return line;
    }
  }
}
