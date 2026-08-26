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
    this.hideLabels = false;
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

    this.svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.resetView();
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

  selectPart(part, partG) {
    this.selectedPart = part;
    this.selectedPartG = partG;
    if (this.lastModelData) {
      this.render(this.lastModelData, this.lastPageIndex);
    }
    if (this.onSelectPart) {
      this.onSelectPart(part);
    }
  }

  startDraggingPart(e, part, partG) {
    let startMouseX = e.clientX;
    let startMouseY = e.clientY;
    const initialX = part.layout ? part.layout.x : 105;
    const initialY = part.layout ? part.layout.y : 148;

    const onMouseMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startMouseX) / this.zoom;
      const dy = (moveEvent.clientY - startMouseY) / this.zoom;
      if (!part.layout) part.layout = {};
      part.layout.x = Number((initialX + dx).toFixed(1));
      part.layout.y = Number((initialY + dy).toFixed(1));

      const rot = part.layout.rotation || 0;
      if (this.selectedPartG) {
        this.selectedPartG.setAttribute('transform', `translate(${part.layout.x}, ${part.layout.y}) rotate(${rot})`);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (this.selectedPartG) this.selectedPartG.style.cursor = 'grab';

      // FIX RAÍZ: Si estamos en vista 'all', detectar si la pieza cruzó de hoja
      if (this.lastPageIndex === 'all' && this.lastModelData && this.lastModelData.pages) {
        const spacing = 25;
        const pageH = this.A4_HEIGHT;
        const currentPageIdx = part.layout.pageIndex || 0;
        // layout.y es RELATIVO a la hoja actual → convertir a absoluto sumando el offset de la hoja
        const currentOffset = currentPageIdx * (pageH + spacing);
        const absY = currentOffset + part.layout.y;

        // Calcular en qué hoja cayó visualmente
        let newPageIdx = currentPageIdx;
        const pages = this.lastModelData.pages;
        for (let i = 0; i < pages.length; i++) {
          const top = i * (pageH + spacing);
          const bottom = top + pageH;
          if (absY >= top && absY < bottom) {
            newPageIdx = i;
            break;
          }
        }
        // Si cayó más abajo de la última hoja, asignar a la última
        if (absY >= pages.length * (pageH + spacing)) {
          newPageIdx = pages.length - 1;
        }

        if (newPageIdx !== currentPageIdx && pages[newPageIdx]) {
          // Quitar de la página original
          pages.forEach(page => {
            if (page && page.parts) {
              const idx = page.parts.indexOf(part);
              if (idx !== -1) page.parts.splice(idx, 1);
            }
          });
          // Convertir coordenada Y absoluta a relativa de la nueva hoja
          const newOffset = newPageIdx * (pageH + spacing);
          part.layout.y = absY - newOffset;
          part.layout.pageIndex = newPageIdx;
          pages[newPageIdx].parts.push(part);
          // Re-renderizar para que quede consistente
          this.render(this.lastModelData, this.lastPageIndex);
        }
      }

      if (this.onLayoutChanged) this.onLayoutChanged(part);
    };

    if (this.selectedPartG) this.selectedPartG.style.cursor = 'grabbing';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  rotateSelectedPart(deltaDeg) {
    if (!this.selectedPart) return;
    if (!this.selectedPart.layout) this.selectedPart.layout = {};
    const curRot = this.selectedPart.layout.rotation || 0;
    this.selectedPart.layout.rotation = (curRot + deltaDeg) % 360;
    if (this.lastModelData) {
      this.render(this.lastModelData, this.lastPageIndex);
    }
    if (this.onLayoutChanged) this.onLayoutChanged(this.selectedPart);
  }

  centerSelectedPartOnPage() {
    if (!this.selectedPart) return;
    if (!this.selectedPart.layout) this.selectedPart.layout = {};
    this.selectedPart.layout.x = 105;
    this.selectedPart.layout.y = 148;
    if (this.lastModelData) {
      this.render(this.lastModelData, this.lastPageIndex);
    }
    if (this.onLayoutChanged) this.onLayoutChanged(this.selectedPart);
  }

  deleteSelectedPart(modelData) {
    const md = modelData || this.lastModelData;
    if (!this.selectedPart || !md || !md.pages) return;
    md.pages.forEach(page => {
      if (page && page.parts) {
        const idx = page.parts.indexOf(this.selectedPart);
        if (idx !== -1) {
          page.parts.splice(idx, 1);
        }
      }
    });
    this.selectedPart = null;
    this.selectedPartG = null;
    this.render(md, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged(null);
  }

  duplicateSelectedPart(modelData) {
    const md = modelData || this.lastModelData;
    if (!this.selectedPart || !md || !md.pages) return;
    const copy = JSON.parse(JSON.stringify(this.selectedPart));
    copy.id = `${copy.id}_copy_${Date.now()}`;
    copy.name = `${copy.name} (Copia)`;
    if (!copy.layout) copy.layout = { x: 105, y: 148, rotation: 0, pageIndex: 0 };
    copy.layout.x = Math.round((copy.layout.x || 105) + 15);
    copy.layout.y = Math.round((copy.layout.y || 148) + 15);
    const targetIdx = copy.layout.pageIndex || 0;
    if (!md.pages[targetIdx]) {
      md.pages[0].parts.push(copy);
    } else {
      md.pages[targetIdx].parts.push(copy);
    }
    this.selectedPart = copy;
    this.render(md, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged(copy);
  }

  autoPackCurrentPage(modelData, pageIndex = 'all') {
    if (!modelData || !modelData.pages) return;
    const margin = parseFloat(modelData.parameters?.marginSecurity) || 5;

    const allParts = [];
    modelData.pages.forEach(page => {
      if (page && page.parts) {
        allParts.push(...page.parts);
      }
    });

    const newPages = [{ pageNum: 1, parts: [], overflow: false }];
    let curPageIdx = 0;
    let curX = margin + 15;
    let curY = margin + 25;
    let rowMaxH = 0;

    const getDim = (part) => {
      const rot = part.layout && part.layout.rotation ? ((part.layout.rotation % 360 + 360) % 360) : 0;
      const isRotated90 = (rot === 90 || rot === 270);
      return {
        w: isRotated90 ? (part.height || 60) : (part.width || 60),
        h: isRotated90 ? (part.width || 60) : (part.height || 60)
      };
    };

    allParts.forEach(part => {
      const dim = getDim(part);
      if (curX + dim.w / 2 > 210 - margin - 15) {
        curX = margin + 15;
        curY += rowMaxH + 15;
        rowMaxH = 0;
      }
      if (curY + dim.h / 2 > 297 - margin - 15 && newPages[curPageIdx].parts.length > 0) {
        curPageIdx++;
        newPages.push({ pageNum: curPageIdx + 1, parts: [], overflow: false });
        curX = margin + 15;
        curY = margin + 25;
        rowMaxH = 0;
      }

      if (!part.layout) part.layout = {};
      part.layout.pageIndex = curPageIdx;
      part.layout.x = Math.round(curX + dim.w / 2);
      part.layout.y = Math.round(curY + dim.h / 2);

      newPages[curPageIdx].parts.push(part);
      curX += dim.w + 15;
      if (dim.h > rowMaxH) rowMaxH = dim.h;
    });

    modelData.pages = newPages;
    modelData.pageCount = newPages.length;
    if (modelData.metrics) {
      modelData.metrics.pageCount = newPages.length;
      modelData.metrics.fitsInSingleA4 = (newPages.length === 1);
    }
    this.render(modelData, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged();
  }

  addBlankPage(modelData) {
    if (!modelData || !modelData.pages) return 0;
    const newIdx = modelData.pages.length;
    modelData.pages.push({ pageNum: newIdx + 1, parts: [], overflow: false });
    if (modelData.metrics) {
      modelData.metrics.pageCount = modelData.pages.length;
      modelData.metrics.fitsInSingleA4 = (modelData.pages.length === 1);
    }
    return newIdx;
  }

  removeEmptyPages(modelData) {
    if (!modelData || !modelData.pages) return;
    const filtered = modelData.pages.filter(p => p && p.parts && p.parts.length > 0);
    if (filtered.length === 0) {
      filtered.push({ pageNum: 1, parts: [], overflow: false });
    } else {
      filtered.forEach((p, idx) => { p.pageNum = idx + 1; });
    }
    modelData.pages = filtered;
    if (modelData.metrics) {
      modelData.metrics.pageCount = filtered.length;
      modelData.metrics.fitsInSingleA4 = (filtered.length === 1);
    }
    modelData.pageCount = filtered.length;
    this.render(modelData, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged();
  }

  deleteCurrentPage(modelData, pageIdxToDelete = 0) {
    if (!modelData || !modelData.pages || modelData.pages.length <= 1) {
      alert('No puedes eliminar la única hoja del documento.');
      return false;
    }

    let idx = typeof pageIdxToDelete === 'number' ? pageIdxToDelete : modelData.pages.length - 1;
    if (idx < 0 || idx >= modelData.pages.length) idx = modelData.pages.length - 1;

    const targetIdx = idx > 0 ? idx - 1 : 0;
    const pageToDelete = modelData.pages[idx];
    if (pageToDelete && pageToDelete.parts && pageToDelete.parts.length > 0) {
      const targetPage = modelData.pages[targetIdx];
      pageToDelete.parts.forEach(part => {
        if (!part.layout) part.layout = {};
        part.layout.pageIndex = targetIdx;
        targetPage.parts.push(part);
      });
    }

    modelData.pages.splice(idx, 1);

    modelData.pages.forEach((p, i) => {
      p.pageNum = i + 1;
      if (p.parts) {
        p.parts.forEach(part => {
          if (part.layout) part.layout.pageIndex = i;
        });
      }
    });

    if (modelData.metrics) {
      modelData.metrics.pageCount = modelData.pages.length;
      modelData.metrics.fitsInSingleA4 = (modelData.pages.length === 1);
    }
    modelData.pageCount = modelData.pages.length;

    this.render(modelData, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged();
    return true;
  }

  moveSelectedPartToNextPage(modelData) {
    if (!this.selectedPart || !modelData || !modelData.pages) return null;
    let currentIdx = -1;
    modelData.pages.forEach((page, idx) => {
      if (page && page.parts) {
        const found = page.parts.indexOf(this.selectedPart);
        if (found !== -1) {
          currentIdx = idx;
          page.parts.splice(found, 1);
        }
      }
    });
    if (currentIdx === -1) return null;

    if (modelData.pages.length === 1) {
      modelData.pages.push({ pageNum: 2, parts: [], overflow: false });
    }
    const nextIdx = (currentIdx + 1) % modelData.pages.length;
    modelData.pages[nextIdx].parts.push(this.selectedPart);
    if (!this.selectedPart.layout) this.selectedPart.layout = {};
    this.selectedPart.layout.pageIndex = nextIdx;

    if (modelData.metrics) {
      modelData.metrics.pageCount = modelData.pages.length;
      modelData.metrics.fitsInSingleA4 = (modelData.pages.length === 1);
    }
    this.render(modelData, 'all');
    if (this.onLayoutChanged) this.onLayoutChanged();
    return nextIdx;
  }

  /**
   * Renderiza el modelo 2D en el SVG
   * @param {Object} modelData - Datos calculados por PaperAlfaGeometry
   * @param {number|string} pageIndex - Hoja A4 a mostrar ('all' para ver todas juntas)
   */
  toggleLabels() {
    this.hideLabels = !this.hideLabels;
    if (this.lastModelData) {
      this.render(this.lastModelData, this.lastPageIndex);
    }
  }

  render(modelData, pageIndex = 0) {
    this.lastModelData = modelData;
    this.lastPageIndex = pageIndex;
    if (!this.svg) return;
    this.svg.innerHTML = ''; // Limpiar lienzo

    const margin = parseFloat(modelData.parameters?.marginSecurity) || 5;
    const pages = modelData.pages || [];

    // Grupo contenedor para Zoom / Pan
    const container = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    container.setAttribute('id', 'layout-container');
    this.svg.appendChild(container);

    if (modelData.parameters?.useMosaic) {
      // MODO MOSAICO MANUAL: Lienzo infinito
      const page = pages[0] || { parts: [] };
      let minX = 0, minY = 0, maxX = this.A4_WIDTH, maxY = this.A4_HEIGHT;
      page.parts.forEach(p => {
        if (p.layout) {
          minX = Math.min(minX, p.layout.x - p.boundingBox.width / 2);
          minY = Math.min(minY, p.layout.y - p.boundingBox.height / 2);
          maxX = Math.max(maxX, p.layout.x + p.boundingBox.width / 2);
          maxY = Math.max(maxY, p.layout.y + p.boundingBox.height / 2);
        }
      });
      // Expandir lienzo a múltiplos de A4 y garantizar un mínimo de 3x3 hojas (Matriz de 9 hojas)
      minX = Math.min(0, Math.floor(minX / this.A4_WIDTH) * this.A4_WIDTH);
      minY = Math.min(0, Math.floor(minY / this.A4_HEIGHT) * this.A4_HEIGHT);
      maxX = Math.max(this.A4_WIDTH * 3, Math.ceil(maxX / this.A4_WIDTH) * this.A4_WIDTH);
      maxY = Math.max(this.A4_HEIGHT * 3, Math.ceil(maxY / this.A4_HEIGHT) * this.A4_HEIGHT);
      
      this.svg.setAttribute('viewBox', `${minX - 10} ${minY - 10} ${maxX - minX + 20} ${maxY - minY + 20}`);
      this.renderMosaicCanvas(container, modelData, page, minX, minY, maxX, maxY, margin);
    } else if (pageIndex === 'all' || pageIndex === -1) {
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

  renderMosaicCanvas(container, modelData, page, minX, minY, maxX, maxY, margin) {
    const pageGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    container.appendChild(pageGroup);

    // Fondo gris oscuro del entorno (más grande que la grilla)
    const bgRect = this.createSVGRect(minX, minY, maxX - minX, maxY - minY, '#0f172a', 1.0);
    pageGroup.appendChild(bgRect);

    // Grilla A4 (Rectángulos blancos)
    for (let x = minX; x < maxX; x += this.A4_WIDTH) {
      for (let y = minY; y < maxY; y += this.A4_HEIGHT) {
        const sheet = this.createSVGRect(x, y, this.A4_WIDTH, this.A4_HEIGHT, '#FFFFFF', 1.0);
        sheet.setAttribute('stroke', '#CBD5E1'); // Gris sutil para los bordes de la hoja
        sheet.setAttribute('stroke-width', '1');
        sheet.setAttribute('stroke-dasharray', '10, 5');
        pageGroup.appendChild(sheet);

        // Texto de coordenada
        const coord = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        coord.setAttribute('x', x + 10);
        coord.setAttribute('y', y + 15);
        coord.setAttribute('fill', '#10B981');
        coord.setAttribute('font-family', 'JetBrains Mono, monospace');
        coord.setAttribute('font-size', '10');
        coord.setAttribute('font-weight', 'bold');
        coord.textContent = `A4 (${x / this.A4_WIDTH}, ${y / this.A4_HEIGHT})`;
        pageGroup.appendChild(coord);
      }
    }

    // Área de las piezas
    const partsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    partsGroup.setAttribute('id', 'parts-group');

    page.parts.forEach(part => {
      const partG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      partG.setAttribute('id', `part-${part.id}`);
      
      const rot = part.layout && part.layout.rotation ? part.layout.rotation : 0;
      const tx = part.layout && part.layout.x !== undefined ? part.layout.x : this.A4_WIDTH / 2;
      const ty = part.layout && part.layout.y !== undefined ? part.layout.y : this.A4_HEIGHT / 2;
      partG.setAttribute('transform', `translate(${tx}, ${ty}) rotate(${rot})`);

      const isSelected = (this.selectedPart && this.selectedPart.id === part.id);
      
      const wBox = part.boundingBox.width;
      const hBox = part.boundingBox.height;
      const hitRect = this.createSVGRect(-wBox / 2, -hBox / 2, wBox, hBox, isSelected ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.001)', isSelected ? 0.8 : 0.2);
      hitRect.setAttribute('stroke', isSelected ? '#00F0FF' : 'transparent');
      if (isSelected) {
        hitRect.setAttribute('stroke-dasharray', '4, 2');
        this.selectedPartG = partG;
      }
      partG.appendChild(hitRect);

      const lines = part.lines || {};
      (lines.mountainFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#000000', '0.35', 'none')));
      (lines.valleyFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#000000', '0.35', 'none')));
      (lines.markings || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, l.color || (l.type === 'centerline' ? '#EF4444' : '#FF3B30'), (l.width || 0.45).toString(), l.type === 'centroid-x' ? '1, 0.5' : ((l.type === 'registration' || l.type === 'centerline') ? '6, 4' : 'none'))));
      (lines.cuts || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#090D14', '0.55', 'none')));

      if (!this.hideLabels) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', 0);
        label.setAttribute('y', -part.boundingBox.height / 2 - 4);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', isSelected ? '#00F0FF' : '#334155');
        label.setAttribute('font-family', 'JetBrains Mono, monospace');
        label.setAttribute('font-size', '4.5');
        label.setAttribute('font-weight', 'bold');
        label.textContent = `${part.name.toUpperCase()} (${Math.round(wBox)}x${Math.round(hBox)}mm)`;
        partG.appendChild(label);
      }

      partG.style.cursor = 'grab';
      partG.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 0) {
          this.selectPart(part, partG);
          this.startDraggingPart(e, part, partG);
        }
      });

      partsGroup.appendChild(partG);
    });

    pageGroup.appendChild(partsGroup);
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
        const rot = part.layout && part.layout.rotation ? part.layout.rotation : 0;

        partG.setAttribute('transform', `translate(${originX}, ${originY}) rotate(${rot})`);

        // Hitbox interactivo y resaltado de selección
        const wBox = (part.width || 60) + 10;
        const hBox = (part.height || 60) + 10;
        const isSelected = (this.selectedPart && this.selectedPart.name === part.name);
        const hitRect = this.createSVGRect(-wBox / 2, -hBox / 2, wBox, hBox, isSelected ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.001)', isSelected ? 0.8 : 0.2);
        hitRect.setAttribute('stroke', isSelected ? '#00F0FF' : 'transparent');
        if (isSelected) {
          hitRect.setAttribute('stroke-dasharray', '4, 2');
          this.selectedPartG = partG;
        }
        partG.appendChild(hitRect);

        // Etiqueta de la pieza
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', 0);
        label.setAttribute('y', -part.height / 2 - 4);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', isSelected ? '#00F0FF' : '#334155');
        label.setAttribute('font-family', 'JetBrains Mono, monospace');
        label.setAttribute('font-size', '4.5');
        label.setAttribute('font-weight', 'bold');
        
        const dispW = part.boundingBox ? part.boundingBox.width : part.width;
        const dispH = part.boundingBox ? part.boundingBox.height : part.height;
        label.textContent = `${part.name.toUpperCase()} (${Math.round(dispW)}x${Math.round(dispH)}mm)${rot ? ` [${rot}°]` : ''}`;
        
        if (!this.hideLabels) {
          partG.appendChild(label);
        }

        // Renderizar trazos
        const lines = part.lines || {};
        // Dobleces montaña (línea continua negra fina)
        (lines.mountainFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#000000', '0.35', 'none')));
        // Dobleces valle (línea continua negra fina)
        (lines.valleyFolds || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#000000', '0.35', 'none')));
        // Marcas CAD técnicas (cruces X de centro y eje)
        (lines.markings || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, l.color || (l.type === 'centerline' ? '#EF4444' : '#FF3B30'), (l.width || 0.45).toString(), l.type === 'centroid-x' ? '1, 0.5' : ((l.type === 'registration' || l.type === 'centerline') ? '6, 4' : 'none'))));
        // Cortes exteriores (negro continuo)
        (lines.cuts || []).forEach(l => partG.appendChild(this.createSVGPathOrLine(l, '#090D14', '0.55', 'none')));

        partG.style.cursor = 'grab';
        partG.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (e.button === 0) {
            this.selectPart(part, partG);
            this.startDraggingPart(e, part, partG);
          }
        });

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
