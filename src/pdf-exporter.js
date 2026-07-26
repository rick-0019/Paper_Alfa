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

        // Dibujar etiqueta técnica de la pieza
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(part.name.toUpperCase(), originX - part.width / 2, originY - part.height / 2 - 3);

        // Renderizar trazos vectoriales de la pieza
        this.drawPartLines(doc, part, originX, originY);
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
    doc.save(filename);
  }

  /**
   * Renderiza todos los segmentos y arcos de la pieza
   */
  drawPartLines(doc, part, originX, originY) {
    const lines = part.lines || {};

    // A) Primero las líneas de doblez (montaña y valle)
    if (lines.mountainFolds) {
      doc.setDrawColor(0, 102, 204); // Azul #0066CC
      doc.setLineWidth(0.12);        // ~0.3 pt
      doc.setLineDash([2, 1], 0);    // Punteado montaña
      lines.mountainFolds.forEach(line => this.renderLineOrArc(doc, line, originX, originY));
    }

    if (lines.valleyFolds) {
      doc.setDrawColor(204, 0, 0);   // Rojo #CC0000
      doc.setLineWidth(0.12);        // ~0.3 pt
      doc.setLineDash([1, 1], 0);    // Punteado valle
      lines.valleyFolds.forEach(line => this.renderLineOrArc(doc, line, originX, originY));
    }

    // B) Después las líneas de corte exterior (negro continuo)
    if (lines.cuts) {
      doc.setDrawColor(0, 0, 0);     // Negro puro
      doc.setLineWidth(0.18);        // ~0.5 pt continuo
      doc.setLineDash([], 0);        // Línea continua
      lines.cuts.forEach(line => this.renderLineOrArc(doc, line, originX, originY));
    }
  }

  renderLineOrArc(doc, item, originX, originY) {
    if (item.isArc) {
      // jsPDF no tiene arco polar nativo simple en mm sin Bezier, aproximamos el arco por 36 segmentos precisos
      const steps = 36;
      const angleStep = (item.endAngle - item.startAngle) / steps;
      let prevX = originX + item.cx + item.radius * Math.cos(item.startAngle);
      let prevY = originY + item.cy + item.radius * Math.sin(item.startAngle);

      for (let i = 1; i <= steps; i++) {
        const a = item.startAngle + i * angleStep;
        const curX = originX + item.cx + item.radius * Math.cos(a);
        const curY = originY + item.cy + item.radius * Math.sin(a);
        doc.line(prevX, prevY, curX, curY);
        prevX = curX;
        prevY = curY;
      }
    } else {
      // Segmento recto
      doc.line(
        originX + item.x1,
        originY + item.y1,
        originX + item.x2,
        originY + item.y2
      );
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
