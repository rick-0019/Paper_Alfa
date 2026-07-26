/**
 * PAPER ALFA - Main Application Controller (v1.0)
 * Arquitectura e Interfaz Principal para Generación Paramétrica de Papercraft
 */

import { PaperAlfaGeometry } from './geometry.js';
import { PaperAlfaViewer2D } from './viewer-2d.js';
import { PaperAlfaViewer3D } from './viewer-3d.js';
import { PaperAlfaPdfExporter } from './pdf-exporter.js';

class PaperAlfaApp {
  constructor() {
    this.geometry = new PaperAlfaGeometry();
    this.exporter = new PaperAlfaPdfExporter();
    this.viewer2D = null;
    this.viewer3D = null;

    this.currentModelData = null;
    this.currentPageIndex = 'all'; // Por defecto ver todas las hojas
    this.userSelectedSinglePage = false;
    this.activePhase = 'phase1'; // phase1, phase2, phase3
    
    // Estado de estaciones Loft (X y D en mm)
    this.loftStations = [
      { id: 1, x: 0, d: 20 },
      { id: 2, x: 30, d: 70 },
      { id: 3, x: 100, d: 70 },
      { id: 4, x: 160, d: 50 },
      { id: 5, x: 200, d: 15 }
    ];
    this.nextStationId = 6;

    this.init();
  }

  init() {
    // Inicializar visualizadores después de montar el DOM
    this.viewer2D = new PaperAlfaViewer2D('svg-viewer');
    this.viewer3D = new PaperAlfaViewer3D('webgl-canvas');

    // Registrar Event Listeners para controles de parámetros
    this.bindParameterControls();
    this.bindToolbarButtons();
    this.bindPhaseTabs();
    this.bindPresetButtons();

    // Cálculo inicial (Cono Truncado por defecto)
    this.recalculateAndRender();

    console.log('PAPER ALFA Ingeniería Paramétrica iniciada correctamente (A4 1:1)');
  }

  bindParameterControls() {
    const paramInputs = [
      'input-d1', 'input-d2', 'input-sides', 'input-rings', 'input-h', 
      'input-tab-h', 'input-teeth', 'input-margin', 'check-top-cap', 
      'check-bottom-cap', 'check-no-tabs',
      'input-loft-tab-h', 'check-loft-no-tabs', 'check-loft-caps'
    ];
    
    paramInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.recalculateAndRender());
        el.addEventListener('change', () => this.recalculateAndRender());
      }
    });

    // Sincronizar checkboxes de 'Sin Pestañas' entre Fase 1 y Fase 2
    const c1 = document.getElementById('check-no-tabs');
    const c2 = document.getElementById('check-loft-no-tabs');
    if (c1 && c2) {
      c1.addEventListener('change', () => { c2.checked = c1.checked; this.recalculateAndRender(); });
      c2.addEventListener('change', () => { c1.checked = c2.checked; this.recalculateAndRender(); });
    }

    const btnAddStation = document.getElementById('btn-add-station');
    if (btnAddStation) {
      btnAddStation.addEventListener('click', () => {
        const last = this.loftStations[this.loftStations.length - 1] || { x: 0, z: 0, d: 50 };
        this.loftStations.push({ id: this.nextStationId++, x: last.x + 30, z: last.z || 0, d: last.d });
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });
    }

    const btnAddNoseCone = document.getElementById('btn-add-nose-cone');
    if (btnAddNoseCone) {
      btnAddNoseCone.addEventListener('click', () => {
        // Desplazar 40mm todas las estaciones existentes hacia la derecha para hacer sitio al morro en X=0
        this.loftStations.forEach(s => s.x += 40);
        const first = this.loftStations[0] || { z: 0 };
        this.loftStations.unshift({ id: this.nextStationId++, x: 0, z: first.z || 0, d: 0 });
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });
    }

    const btnAddTailCone = document.getElementById('btn-add-tail-cone');
    if (btnAddTailCone) {
      btnAddTailCone.addEventListener('click', () => {
        const last = this.loftStations[this.loftStations.length - 1] || { x: 0, z: 0, d: 20 };
        this.loftStations.push({ id: this.nextStationId++, x: last.x + 40, z: last.z || 0, d: 0 });
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });
    }

    // Cambiar tipo de primitiva
    const primSelect = document.getElementById('select-primitive');
    if (primSelect) {
      primSelect.addEventListener('change', (e) => {
        this.onPrimitiveChanged(e.target.value);
      });
    }
  }

  bindToolbarButtons() {
    // Botón de Exportación PDF A4 1:1
    const btnExport = document.getElementById('btn-export-pdf');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (!this.currentModelData) return;
        this.exporter.exportA4PDF(this.currentModelData, {
          showRuler: document.getElementById('check-ruler')?.checked !== false,
          showTitleBlock: true,
          marginSecurity: parseFloat(document.getElementById('input-margin')?.value) || 5
        });
      });
    }

    // Toggle 2D/3D Vista principal
    const btnView2D = document.getElementById('btn-view-2d');
    const btnView3D = document.getElementById('btn-view-3d');
    const container2D = document.getElementById('container-2d');
    const container3D = document.getElementById('container-3d');

    if (btnView2D && btnView3D) {
      btnView2D.addEventListener('click', () => {
        btnView2D.classList.add('active');
        btnView3D.classList.remove('active');
        if (container2D) container2D.classList.remove('hidden');
        if (container3D) container3D.classList.add('hidden');
      });

      btnView3D.addEventListener('click', () => {
        btnView3D.classList.add('active');
        btnView2D.classList.remove('active');
        if (container3D) container3D.classList.remove('hidden');
        if (container2D) container2D.classList.add('hidden');
        if (this.viewer3D && this.viewer3D.onWindowResize) {
          this.viewer3D.onWindowResize();
        }
      });
    }

    // Zoom reset 2D
    const btnResetZoom = document.getElementById('btn-reset-zoom');
    if (btnResetZoom) {
      btnResetZoom.addEventListener('click', () => this.viewer2D.resetView());
    }

    // Modal Especificación JSON
    const btnJson = document.getElementById('btn-show-json');
    const modalJson = document.getElementById('modal-json');
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnJson && modalJson) {
      btnJson.addEventListener('click', () => {
        this.updateJsonModalText();
        modalJson.classList.remove('hidden');
      });
    }
    if (btnCloseModal && modalJson) {
      btnCloseModal.addEventListener('click', () => modalJson.classList.add('hidden'));
    }
  }

  bindPhaseTabs() {
    const tabs = document.querySelectorAll('.phase-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const phase = e.currentTarget.dataset.phase;
        this.switchPhase(phase);
      });
    });
  }

  bindPresetButtons() {
    const presets = {
      'preset-nozzle': { type: 'truncated_cone', d1: 80, d2: 45, height: 90, tabHeight: 6, teeth: 16 },
      'preset-nose': { type: 'cone', d1: 70, d2: 0, height: 110, tabHeight: 5, teeth: 18 },
      'preset-cylinder': { type: 'cylinder', d1: 60, d2: 60, height: 100, tabHeight: 6, teeth: 14 },
      'preset-dome': { type: 'hemisphere', d1: 100, rings: 5, tabHeight: 6, teeth: 16 }
    };

    const loftPresets = {
      'preset-loft-rocket': [
        { id: 1, x: 0, z: 0, d: 20 },
        { id: 2, x: 40, z: 0, d: 80 },
        { id: 3, x: 140, z: 0, d: 80 },
        { id: 4, x: 190, z: 0, d: 60 },
        { id: 5, x: 230, z: 0, d: 25 }
      ],
      'preset-loft-nozzle': [
        { id: 1, x: 0, z: 0, d: 60 },
        { id: 2, x: 25, z: 0, d: 40 },
        { id: 3, x: 50, z: 0, d: 45 },
        { id: 4, x: 80, z: 0, d: 65 }
      ],
      'preset-loft-zeppelin': [
        { id: 1, x: 0, z: 0, d: 10 },
        { id: 2, x: 30, z: 0, d: 50 },
        { id: 3, x: 80, z: 0, d: 70 },
        { id: 4, x: 160, z: 0, d: 70 },
        { id: 5, x: 210, z: 0, d: 40 },
        { id: 6, x: 240, z: 0, d: 10 }
      ],
      'preset-loft-sduct': [
        { id: 1, x: 0, z: 0, d: 40 },
        { id: 2, x: 40, z: 0, d: 60 },
        { id: 3, x: 90, z: 0, d: 60 },
        { id: 4, x: 140, z: -40, d: 60 }, // Transición oblicua bajando -40 mm en Z
        { id: 5, x: 190, z: -40, d: 60 },
        { id: 6, x: 230, z: -40, d: 40 }
      ]
    };

    Object.keys(loftPresets).forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          this.activePhase = 'phase2';
          const tabs = document.querySelectorAll('.phase-tab');
          tabs.forEach(t => t.classList.toggle('active', t.dataset.phase === 'phase2'));
          const p1 = document.getElementById('panel-phase1');
          const p2 = document.getElementById('panel-phase2');
          const p3 = document.getElementById('panel-phase3');
          if (p1) p1.classList.add('hidden');
          if (p2) p2.classList.remove('hidden');
          if (p3) p3.classList.add('hidden');

          this.loftStations = JSON.parse(JSON.stringify(loftPresets[id]));
          this.nextStationId = this.loftStations.length + 1;
          this.userSelectedSinglePage = false;
          this.renderLoftStationsUI();
          this.recalculateAndRender();
        });
      }
    });

    Object.keys(presets).forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          const cfg = presets[id];
          if (cfg.type && document.getElementById('select-primitive')) {
            document.getElementById('select-primitive').value = cfg.type;
            this.onPrimitiveChanged(cfg.type);
          }
          if (document.getElementById('input-d1')) document.getElementById('input-d1').value = cfg.d1;
          if (document.getElementById('input-d2') && cfg.d2 !== undefined) document.getElementById('input-d2').value = cfg.d2;
          if (document.getElementById('input-h') && cfg.height !== undefined) document.getElementById('input-h').value = cfg.height;
          if (document.getElementById('input-rings') && cfg.rings !== undefined) document.getElementById('input-rings').value = cfg.rings;
          if (document.getElementById('input-tab-h')) document.getElementById('input-tab-h').value = cfg.tabHeight;
          if (document.getElementById('input-teeth')) document.getElementById('input-teeth').value = cfg.teeth;
          this.userSelectedSinglePage = false;
          this.recalculateAndRender();
        });
      }
    });
  }

  onPrimitiveChanged(primitiveType) {
    const elGroupD2 = document.getElementById('group-d2');
    const elGroupSides = document.getElementById('group-sides');
    const elGroupRings = document.getElementById('group-rings');
    const elGroupH = document.getElementById('group-h');
    const elCheckTop = document.getElementById('check-top-cap');

    // Estado por defecto
    if (elGroupRings) elGroupRings.style.display = 'none';
    if (elGroupH) elGroupH.style.display = 'flex';

    if (primitiveType === 'hemisphere' || primitiveType === 'sphere') {
      if (elGroupD2) elGroupD2.style.display = 'none';
      if (elGroupSides) elGroupSides.style.display = 'none';
      if (elGroupRings) elGroupRings.style.display = 'flex';
      if (elGroupH) elGroupH.style.display = 'none';
      if (elCheckTop) { elCheckTop.checked = false; elCheckTop.disabled = true; }
    } else if (primitiveType === 'cone') {
      if (elGroupD2) elGroupD2.style.display = 'none';
      if (elGroupSides) elGroupSides.style.display = 'none';
      if (elCheckTop) { elCheckTop.checked = false; elCheckTop.disabled = true; }
    } else if (primitiveType === 'pyramid') {
      if (elGroupD2) elGroupD2.style.display = 'none';
      if (elGroupSides) elGroupSides.style.display = 'flex';
      if (elCheckTop) { elCheckTop.checked = false; elCheckTop.disabled = true; }
    } else if (primitiveType === 'prism') {
      if (elGroupD2) elGroupD2.style.display = 'flex';
      if (elGroupSides) elGroupSides.style.display = 'flex';
      if (elCheckTop) { elCheckTop.checked = true; elCheckTop.disabled = false; }
    } else if (primitiveType === 'cylinder') {
      if (elGroupD2) elGroupD2.style.display = 'flex';
      if (elGroupSides) elGroupSides.style.display = 'none';
      if (elCheckTop) { elCheckTop.checked = true; elCheckTop.disabled = false; }
      const d1 = document.getElementById('input-d1')?.value || 70;
      if (document.getElementById('input-d2')) document.getElementById('input-d2').value = d1;
    } else {
      // Cono truncado
      if (elGroupD2) elGroupD2.style.display = 'flex';
      if (elGroupSides) elGroupSides.style.display = 'none';
      if (elCheckTop) { elCheckTop.checked = true; elCheckTop.disabled = false; }
    }
    this.userSelectedSinglePage = false;
    this.recalculateAndRender();
  }

  switchPhase(phase) {
    this.activePhase = phase;
    this.userSelectedSinglePage = false;
    const panelPhase1 = document.getElementById('panel-phase1');
    const panelPhase2 = document.getElementById('panel-phase2');
    const panelPhase3 = document.getElementById('panel-phase3');

    if (panelPhase1) panelPhase1.classList.toggle('hidden', phase !== 'phase1');
    if (panelPhase2) panelPhase2.classList.toggle('hidden', phase !== 'phase2');
    if (panelPhase3) panelPhase3.classList.toggle('hidden', phase !== 'phase3');

    if (phase === 'phase2') {
      this.renderLoftStationsUI();
    }
    
    this.recalculateAndRender();
  }

  renderLoftStationsUI() {
    const container = document.getElementById('loft-stations-container');
    if (!container) return;
    
    container.innerHTML = '';
    this.loftStations.forEach((station, index) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.alignItems = 'center';
      
      const numLabel = document.createElement('span');
      numLabel.textContent = `#${index + 1}`;
      numLabel.style.width = '24px';
      numLabel.style.fontSize = '12px';
      numLabel.style.color = 'var(--text-muted)';
      
      const inputX = document.createElement('input');
      inputX.type = 'number';
      inputX.value = station.x;
      inputX.style.flex = '1';
      inputX.style.minWidth = '0';
      inputX.placeholder = 'X (mm)';
      inputX.title = 'Posición X en el eje';
      inputX.addEventListener('input', (e) => {
        station.x = parseFloat(e.target.value) || 0;
        this.recalculateAndRender();
      });

      const inputZ = document.createElement('input');
      inputZ.type = 'number';
      inputZ.value = station.z || 0;
      inputZ.style.flex = '1';
      inputZ.style.minWidth = '0';
      inputZ.placeholder = 'Z (mm)';
      inputZ.title = 'Elevación Z / Descentrado Vertical';
      inputZ.addEventListener('input', (e) => {
        station.z = parseFloat(e.target.value) || 0;
        this.recalculateAndRender();
      });

      const inputD = document.createElement('input');
      inputD.type = 'number';
      inputD.value = station.d;
      inputD.style.flex = '1';
      inputD.style.minWidth = '0';
      inputD.placeholder = 'D (mm)';
      inputD.title = 'Diámetro exterior';
      inputD.addEventListener('input', (e) => {
        station.d = Math.max(0, parseFloat(e.target.value) || 0);
        this.recalculateAndRender();
      });
      
      const btnDel = document.createElement('button');
      btnDel.textContent = '×';
      btnDel.className = 'btn-preset';
      btnDel.style.padding = '4px 8px';
      btnDel.style.minWidth = 'auto';
      btnDel.style.color = '#ff4a4a';
      btnDel.style.borderColor = 'transparent';
      btnDel.style.background = 'rgba(255, 74, 74, 0.1)';
      btnDel.disabled = this.loftStations.length <= 2;
      
      if (this.loftStations.length > 2) {
        btnDel.addEventListener('click', () => {
          this.loftStations = this.loftStations.filter(s => s.id !== station.id);
          this.renderLoftStationsUI();
          this.recalculateAndRender();
        });
      } else {
        btnDel.style.opacity = '0.3';
        btnDel.style.cursor = 'not-allowed';
      }
      
      row.appendChild(numLabel);
      row.appendChild(inputX);
      row.appendChild(inputZ);
      row.appendChild(inputD);
      row.appendChild(btnDel);
      container.appendChild(row);
    });
  }

  /**
   * Recalcula la geometría 2D/3D y actualiza la pantalla
   */
  recalculateAndRender() {
    const type = document.getElementById('select-primitive')?.value || 'truncated_cone';
    const d1 = parseFloat(document.getElementById('input-d1')?.value) || 80;
    const d2 = parseFloat(document.getElementById('input-d2')?.value) || 45;
    const sides = parseInt(document.getElementById('input-sides')?.value) || 6;
    const rings = parseInt(document.getElementById('input-rings')?.value) || 5;
    const h = parseFloat(document.getElementById('input-h')?.value) || 90;
    const noTabs = (document.getElementById('check-no-tabs')?.checked === true) || 
                   (document.getElementById('check-loft-no-tabs')?.checked === true);
    const tabH = noTabs ? 0 : (parseFloat(document.getElementById('input-tab-h')?.value) || 6);
    const teeth = parseInt(document.getElementById('input-teeth')?.value) || 16;
    const margin = parseFloat(document.getElementById('input-margin')?.value) || 5;
    const incTop = document.getElementById('check-top-cap')?.checked !== false;
    const incBottom = document.getElementById('check-bottom-cap')?.checked !== false;

    // Atenuar controles de solapas en UI cuando está activo "Sin Pestañas"
    const groupTabH = document.getElementById('group-tab-h');
    const groupTeeth = document.getElementById('group-teeth');
    if (groupTabH) {
      groupTabH.style.opacity = noTabs ? '0.35' : '1';
      groupTabH.style.pointerEvents = noTabs ? 'none' : 'auto';
    }
    if (groupTeeth) {
      groupTeeth.style.opacity = noTabs ? '0.35' : '1';
      groupTeeth.style.pointerEvents = noTabs ? 'none' : 'auto';
    }

    const params = {
      d1,
      d2,
      sides,
      rings,
      height: h,
      tabHeight: tabH,
      teethPerArc: teeth,
      marginSecurity: margin,
      includeTopCap: incTop,
      includeBottomCap: incBottom
    };

    // Ejecutar motor matemático según primitiva o fase
    if (this.activePhase === 'phase2') {
      const loftNoTabs = (document.getElementById('check-loft-no-tabs')?.checked === true) ||
                         (document.getElementById('check-no-tabs')?.checked === true);
      const loftTabH = loftNoTabs ? 0 : (parseFloat(document.getElementById('input-loft-tab-h')?.value) || 6);
      const incCaps = document.getElementById('check-loft-caps')?.checked !== false;
      
      const groupLoftTabH = document.getElementById('group-loft-tab-h');
      if (groupLoftTabH) {
        groupLoftTabH.style.opacity = loftNoTabs ? '0.35' : '1';
        groupLoftTabH.style.pointerEvents = loftNoTabs ? 'none' : 'auto';
      }

      this.currentModelData = this.geometry.calculateLoft({
        stations: JSON.parse(JSON.stringify(this.loftStations)), // pasar copia
        tabHeight: loftTabH,
        teethPerArc: 24, // Dientes más densos para fuselajes
        marginSecurity: margin,
        includeCaps: incCaps
      });
    } else if (type === 'hemisphere') {
      this.currentModelData = this.geometry.calculateHemisphere(params);
    } else if (type === 'sphere') {
      this.currentModelData = this.geometry.calculateSphere(params);
    } else if (type === 'cone') {
      this.currentModelData = this.geometry.calculateCone(params);
    } else if (type === 'prism') {
      this.currentModelData = this.geometry.calculatePrism(params);
    } else if (type === 'pyramid') {
      this.currentModelData = this.geometry.calculatePyramid(params);
    } else if (type === 'cylinder') {
      this.currentModelData = this.geometry.calculateCylinder(params);
    } else {
      this.currentModelData = this.geometry.calculateTruncatedCone(params);
    }

    const totalPages = this.currentModelData?.metrics?.pageCount || 1;
    if (totalPages > 1 && !this.userSelectedSinglePage) {
      this.currentPageIndex = 'all';
    } else if (totalPages === 1 || (typeof this.currentPageIndex === 'number' && this.currentPageIndex >= totalPages)) {
      this.currentPageIndex = 0;
      this.userSelectedSinglePage = false;
    }

    // Actualizar 2D SVG
    if (this.viewer2D) {
      this.viewer2D.render(this.currentModelData, this.currentPageIndex);
    }

    // Actualizar 3D WebGL
    if (this.viewer3D) {
      if (this.activePhase === 'phase2') {
        this.viewer3D.updateGeometry({
          type: 'loft',
          stations: JSON.parse(JSON.stringify(this.loftStations))
        });
      } else {
        this.viewer3D.updateGeometry({ type, d1, d2, height: h, sides, rings });
      }
    }

    // Actualizar panel de métricas e indicadores UI
    this.updateUIIndicators();
  }

  updateUIIndicators() {
    if (!this.currentModelData) return;
    const metrics = this.currentModelData.metrics || {};

    const elArea = document.getElementById('metric-area');
    const elSlant = document.getElementById('metric-slant');
    const elAngle = document.getElementById('metric-angle');
    const elStatus = document.getElementById('layout-status-badge');
    const elPageSelector = document.getElementById('page-selector-container');

    if (elArea) elArea.textContent = `${metrics.surfaceAreaCm2 || 0} cm²`;
    if (elSlant) elSlant.textContent = `${metrics.slantHeightMm || 0} mm`;
    if (elAngle) elAngle.textContent = `${metrics.sectorAngleDeg || 0}°`;

    if (elStatus) {
      if (metrics.fitsInSingleA4) {
        elStatus.className = 'status-badge status-ok';
        elStatus.innerHTML = '<span class="status-dot"></span> 100% ESCALA 1:1 EN A4';
      } else {
        elStatus.className = 'status-badge status-warn';
        elStatus.innerHTML = `<span class="status-dot"></span> DESPIECE MULTIPÁGINA (${metrics.pageCount} HOJAS A4)`;
      }
    }

    // Botones de página A4 si el modelo ocupa más de una hoja
    if (elPageSelector) {
      elPageSelector.innerHTML = '';
      const totalPages = metrics.pageCount || 1;
      if (totalPages > 1) {
        // Botón Ver Todas las Hojas
        const btnAll = document.createElement('button');
        btnAll.className = `page-btn ${this.currentPageIndex === 'all' ? 'active' : ''}`;
        btnAll.textContent = `📜 VER TODAS (${totalPages} HOJAS)`;
        btnAll.style.fontWeight = 'bold';
        btnAll.addEventListener('click', () => {
          this.userSelectedSinglePage = false;
          this.currentPageIndex = 'all';
          this.recalculateAndRender();
        });
        elPageSelector.appendChild(btnAll);

        for (let i = 0; i < totalPages; i++) {
          const btn = document.createElement('button');
          btn.className = `page-btn ${this.currentPageIndex === i ? 'active' : ''}`;
          btn.textContent = `Hoja #${i + 1}`;
          btn.addEventListener('click', () => {
            this.userSelectedSinglePage = true;
            this.currentPageIndex = i;
            this.recalculateAndRender();
          });
          elPageSelector.appendChild(btn);
        }
      } else {
        const span = document.createElement('span');
        span.style.fontSize = '12px';
        span.style.color = 'var(--text-muted)';
        span.style.fontFamily = "'JetBrains Mono', monospace";
        span.textContent = '1 HOJA A4';
        elPageSelector.appendChild(span);
      }
    }
  }

  updateJsonModalText() {
    const elJsonCode = document.getElementById('json-output');
    if (!elJsonCode) return;

    const exportSpec = {
      $schema: 'https://paperalfa.dev/schema/v1/model.json',
      version: '1.0.0',
      name: 'PaperAlfa-ConoTruncado-Prototipo',
      printSettings: {
        format: 'a4',
        unit: 'mm',
        width: 210,
        height: 297,
        marginSecurity: parseFloat(document.getElementById('input-margin')?.value) || 5,
        referencePrinter: 'Epson L355',
        scale: '1:1',
        tabSettings: {
          tabHeight: parseFloat(document.getElementById('input-tab-h')?.value) || 6,
          teethPerArc: parseInt(document.getElementById('input-teeth')?.value) || 16,
          showTabs: true
        }
      },
      phase1_primitives: {
        type: 'truncated_cone',
        parameters: {
          d1: parseFloat(document.getElementById('input-d1')?.value) || 80,
          d2: parseFloat(document.getElementById('input-d2')?.value) || 45,
          height: parseFloat(document.getElementById('input-h')?.value) || 90
        },
        calculatedMetrics: this.currentModelData?.metrics || {}
      }
    };

    elJsonCode.textContent = JSON.stringify(exportSpec, null, 2);
  }
}

// Iniciar app al cargar DOM
window.addEventListener('DOMContentLoaded', () => {
  window.paperAlfaApp = new PaperAlfaApp();
});
