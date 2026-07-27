/**
 * PAPER ALFA - PDF Exporter (v1.0)
 * Exportación vectorial exacta A4 1:1 en milímetros usando jsPDF
 * Cumple con especificación técnica de modelismo e impresora de referencia Epson L355
 */

export class PaperAlfaPdfExporter {
  constructor() {
    this.A4_WIDTH = 210; // mm
    this.A4_HEIGHT = 297; // mm
  }

  /**
   * Sincroniza y re-asigna piezas arrastradas a sus páginas A4 correspondientes, eliminando páginas vacías
   */
  syncPartsToPages(modelData) {
    if (!modelData || !modelData.pages) return;
    const allParts = [];
    modelData.pages.forEach(page => {
      if (page && page.parts) {
        allParts.push(...page.parts);
      }
    });
    if (allParts.length === 0) return;

    const spacing = 25;
    const pageH = 297;
    const maxPageIndex = Math.max(
      0,
      ...allParts.map(p => {
        if (!p.layout) return 0;
        const y = p.layout.y || 0;
        return y >= pageH ? Math.floor(y / (pageH + spacing)) : (p.layout.pageIndex || 0);
      })
    );

    const newPages = [];
    for (let i = 0; i <= maxPageIndex; i++) {
      newPages.push({ pageNum: i + 1, parts: [], overflow: false });
    }

    allParts.forEach(part => {
      if (!part.layout) part.layout = { x: 105, y: 148, rotation: 0, pageIndex: 0 };
      let idx = part.layout.pageIndex || 0;
      if (part.layout.y >= pageH) {
        idx = Math.floor(part.layout.y / (pageH + spacing));
        part.layout.y = part.layout.y % (pageH + spacing);
      }
      if (!newPages[idx]) {
        newPages[idx] = { pageNum: idx + 1, parts: [], overflow: false };
      }
      part.layout.pageIndex = idx;
      newPages[idx].parts.push(part);
    });

    const nonEmptyPages = newPages.filter(p => p && p.parts && p.parts.length > 0);
    if (nonEmptyPages.length > 0) {
      nonEmptyPages.forEach((p, idx) => { p.pageNum = idx + 1; });
      modelData.pages = nonEmptyPages;
      modelData.pageCount = nonEmptyPages.length;
    }
  }

  /**
   * Genera y descarga el PDF vectorial a escala real 1:1
   * @param {Object} modelData - Objeto resultante de PaperAlfaGeometry
   * @param {Object} options - { showRuler, showTitleBlock, marginSecurity }
   */
  exportA4PDF(modelData, options = {}) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert('Error: Librería jsPDF no cargada correctamente desde CDN.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = parseFloat(options.marginSecurity) || 5;
    const showRuler = options.showRuler !== false;
    const showTitleBlock = options.showTitleBlock !== false;

    this.syncPartsToPages(modelData);
    const pages = modelData.pages || [];

    pages.forEach((page, idx) => {
      if (idx > 0) {
        doc.addPage('a4', 'portrait');
      }

      // 1. Dibujar Marco Técnico / Cartela de Ingeniería (Title Block)
      if (showTitleBlock) {
        this.drawTitleBlock(doc, modelData, idx + 1, pages.length, margin);
      }

      // 2. Regla de Calibración de 50 mm (Crítica para verificar que no hubo reescalado de impresora)
      if (showRuler) {
        this.drawCalibrationRuler(doc, margin + 5, 12);
      }

      // 3. Dibujar las piezas asignadas a esta página
      page.parts.forEach(part => {
        const originX = part.layout ? part.layout.x : 105;
        const originY = part.layout ? part.layout.y : 148;
        const rot = part.layout && part.layout.rotation ? part.layout.rotation : 0;

        // Dibujar etiqueta técnica de la pieza (arriba del bounding box rotado o centro)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        const labelPos = this.transformPoint(0, -part.height / 2 - 3, originX, originY, rot);
        doc.text(part.name.toUpperCase(), labelPos.x - 10, labelPos.y);

        // Renderizar trazos vectoriales de la pieza
        this.drawPartLines(doc, part, originX, originY, rot);
      });

      // 4. Pie de página de seguridad 1:1
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `PAPER ALFA • PLANTILLA 1:1 (A4) • MARGEN: ${margin}mm • IMPRESORA REF: EPSON L355 • NO REESCALAR (100% SCALE)`,
        105,
        293,
        { align: 'center' }
      );
    });

    // Generar nombre de archivo estándar
    const filename = `PAPER_ALFA_${modelData.type.toUpperCase()}_A4_1-1.pdf`;
    this.previewPDF(doc, filename);
  }

  /**
   * Abre modal de previsualización con iframe y opciones de Guardar, Imprimir o Cerrar
   */
  previewPDF(doc, filename) {
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    
    let modal = document.getElementById('modal-pdf-preview');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-pdf-preview';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-card" style="width: 88vw; max-width: 1200px; height: 92vh; max-height: 92vh; display: flex; flex-direction: column; padding: 16px; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">📄 Previsualización Técnica A4 (1:1)</h3>
              <div id="pdf-preview-filename" style="font-size: 11px; color: var(--accent-cyan); margin-top: 3px;"></div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-pdf-preview-open" class="btn-preset" style="padding: 7px 14px; font-size: 12px; cursor: pointer;" title="Abrir en pestaña nueva del navegador para Imprimir con la impresora de referencia">🖨️ Abrir / Imprimir</button>
              <button id="btn-pdf-preview-download" class="btn-action" style="padding: 7px 16px; font-size: 12px; cursor: pointer;" title="Descargar archivo .pdf final a tu computadora">📥 Guardar PDF (.pdf)</button>
              <button id="btn-pdf-preview-close" class="btn-preset" style="padding: 7px 14px; font-size: 12px; background: rgba(255,59,48,0.2); color: #FF3B30; cursor: pointer;" title="Cerrar previsualización sin guardar">✕ Cerrar</button>
            </div>
          </div>
          <div style="flex: 1; width: 100%; background: #525659; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-subtle); position: relative;">
            <iframe id="pdf-preview-iframe" style="width: 100%; height: 100%; border: none;"></iframe>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      document.getElementById('btn-pdf-preview-close').addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    const filenameEl = document.getElementById('pdf-preview-filename');
    if (filenameEl) {
      filenameEl.textContent = `Archivo: ${filename} • Escala técnica 1:1 en mm • Listo para verificar o guardar`;
    }

    const iframe = document.getElementById('pdf-preview-iframe');
    if (iframe) {
      iframe.src = blobUrl;
    }

    const btnDownload = document.getElementById('btn-pdf-preview-download');
    const btnOpen = document.getElementById('btn-pdf-preview-open');

    const newDownload = btnDownload.cloneNode(true);
    btnDownload.parentNode.replaceChild(newDownload, btnDownload);
    newDownload.addEventListener('click', () => {
      doc.save(filename);
    });

    const newOpen = btnOpen.cloneNode(true);
    btnOpen.parentNode.replaceChild(newOpen, btnOpen);
    newOpen.addEventListener('click', () => {
      window.open(blobUrl, '_blank');
    });

    modal.classList.remove('hidden');
  }

  /**
   * Rota un punto (x, y) respecto al origen de la pieza por rotDeg grados
   */
  transformPoint(x, y, originX, originY, rotDeg = 0) {
    if (!rotDeg) {
      return { x: originX + x, y: originY + y };
    }
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: originX + (x * cos - y * sin),
      y: originY + (x * sin + y * cos)
    };
  }

  /**
   * Renderiza todos los segmentos y arcos de la pieza
   */
  drawPartLines(doc, part, originX, originY, rotDeg = 0) {
    const lines = part.lines || {};

    // A) Primero las líneas de doblez (montaña y valle)
    if (lines.mountainFolds) {
      doc.setDrawColor(0, 102, 204); // Azul #0066CC
      doc.setLineWidth(0.12);        // ~0.3 pt
      doc.setLineDash([2, 1], 0);    // Punteado montaña
      lines.mountainFolds.forEach(line => this.renderLineOrArc(doc, line, originX, originY, rotDeg));
    }

    if (lines.valleyFolds) {
      doc.setDrawColor(204, 0, 0);   // Rojo #CC0000
      doc.setLineWidth(0.12);        // ~0.3 pt
      doc.setLineDash([1, 1], 0);    // Punteado valle
      lines.valleyFolds.forEach(line => this.renderLineOrArc(doc, line, originX, originY, rotDeg));
    }

    // A2) Marcas CAD técnicas (cruces X de centro y eje +)
    if (lines.markings) {
      lines.markings.forEach(line => {
        if (line.type === 'centroid-x') {
          doc.setDrawColor(255, 59, 48); // Rojo técnica X
          doc.setLineWidth(0.15);
          doc.setLineDash([1, 0.5], 0);
        } else {
          doc.setDrawColor(0, 102, 204); // Azul eje 0,0 +
          doc.setLineWidth(0.12);
          doc.setLineDash([], 0);
        }
        this.renderLineOrArc(doc, line, originX, originY, rotDeg);
      });
    }

    // B) Después las líneas de corte exterior (negro continuo)
    if (lines.cuts) {
      doc.setDrawColor(0, 0, 0);     // Negro puro
      doc.setLineWidth(0.18);        // ~0.5 pt continuo
      doc.setLineDash([], 0);        // Línea continua
      lines.cuts.forEach(line => this.renderLineOrArc(doc, line, originX, originY, rotDeg));
    }
  }

  renderLineOrArc(doc, item, originX, originY, rotDeg = 0) {
    if (item.isArc) {
      const steps = 36;
      const angleStep = (item.endAngle - item.startAngle) / steps;
      let prevPt = this.transformPoint(
        item.cx + item.radius * Math.cos(item.startAngle),
        item.cy + item.radius * Math.sin(item.startAngle),
        originX, originY, rotDeg
      );

      for (let i = 1; i <= steps; i++) {
        const a = item.startAngle + i * angleStep;
        const curPt = this.transformPoint(
          item.cx + item.radius * Math.cos(a),
          item.cy + item.radius * Math.sin(a),
          originX, originY, rotDeg
        );
        doc.line(prevPt.x, prevPt.y, curPt.x, curPt.y);
        prevPt = curPt;
      }
    } else {
      const p1 = this.transformPoint(item.x1, item.y1, originX, originY, rotDeg);
      const p2 = this.transformPoint(item.x2, item.y2, originX, originY, rotDeg);
      doc.line(p1.x, p1.y, p2.x, p2.y);
    }
  }

  /**
   * Cartela de Ingeniería Aeronáutica / Papercraft
   */
  drawTitleBlock(doc, modelData, pageNum, totalPages, margin) {
    const boxW = 85;
    const boxH = 14;
    const x = this.A4_WIDTH - margin - boxW;
    const y = margin;

    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.25);
    doc.setLineDash([], 0);
    doc.rect(x, y, boxW, boxH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('PAPER ALFA - ENGINEERING STUDIO', x + 3, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const pStr = modelData.parameters ? `D1=${modelData.parameters.d1} D2=${modelData.parameters.d2} H=${modelData.parameters.height}` : '';
    doc.text(`MODELO: CONO TRUNCADO (${pStr})`, x + 3, y + 9);
    doc.text(`ESCALA: 1:1 MM   |   HOJA ${pageNum}/${totalPages}`, x + 3, y + 12.5);
  }

  /**
   * Regla de calibración de 50 mm con subdivisiones de milímetro
   */
  drawCalibrationRuler(doc, x, y) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDash([], 0);

    // Línea base de 50 mm
    doc.line(x, y, x + 50, y);

    // Ticks por milímetro
    for (let i = 0; i <= 50; i++) {
      let tickH = 1.2; // 1 mm tick
      if (i % 10 === 0) tickH = 3.5; // centímetro
      else if (i % 5 === 0) tickH = 2.2; // medio centímetro

      doc.line(x + i, y, x + i, y - tickH);

      if (i % 10 === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text(`${i}`, x + i, y - 4.2, { align: 'center' });
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('REGLA VERIFICACIÓN 50 MM (1:1)', x, y + 3);
  }
}
