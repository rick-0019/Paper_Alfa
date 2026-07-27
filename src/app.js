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
    this.setupPepakuraToolbar();
    this.setupCollapsibleSections();
    this.setupUIModeToggle();

    // Cálculo inicial (Cono Truncado por defecto)
    this.recalculateAndRender();

    console.log('PAPER ALFA Ingeniería Paramétrica iniciada correctamente (A4 1:1)');
  }

  setupPepakuraToolbar() {
    if (!this.viewer2D) return;

    this.viewer2D.onSelectPart = (part) => {
      const el = document.getElementById('pep-selected-name');
      if (el) {
        el.textContent = part ? `${part.name.toUpperCase()} (${Math.round(part.width)}x${Math.round(part.height)}mm)` : 'Ninguna';
        el.style.color = part ? '#00F0FF' : '#FFFFFF';
      }
    };

    const bindPepBtn = (id, fn) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', fn);
    };

    bindPepBtn('btn-pep-rot-ccw-90', () => this.viewer2D.rotateSelectedPart(-90));
    bindPepBtn('btn-pep-rot-ccw-15', () => this.viewer2D.rotateSelectedPart(-15));
    bindPepBtn('btn-pep-rot-cw-15', () => this.viewer2D.rotateSelectedPart(15));
    bindPepBtn('btn-pep-rot-cw-90', () => this.viewer2D.rotateSelectedPart(90));
    bindPepBtn('btn-pep-center-page', () => this.viewer2D.centerSelectedPartOnPage());
    bindPepBtn('btn-pep-auto-pack', () => this.viewer2D.autoPackCurrentPage(this.currentModelData, this.currentPageIndex));
    bindPepBtn('btn-pep-fit-sheet', () => this.viewer2D.resetView());
    bindPepBtn('btn-pep-duplicate', () => this.viewer2D.duplicateSelectedPart(this.currentModelData));
    bindPepBtn('btn-pep-delete', () => this.viewer2D.deleteSelectedPart(this.currentModelData));

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.viewer2D && this.viewer2D.selectedPart) {
          e.preventDefault();
          this.viewer2D.deleteSelectedPart(this.currentModelData);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (this.viewer2D && this.viewer2D.selectedPart) {
          e.preventDefault();
          this.viewer2D.duplicateSelectedPart(this.currentModelData);
        }
      }
    });
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

    this.setupStationEditorModal();
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
        const pepToolbar = document.getElementById('pepakura-toolbar');
        if (pepToolbar) pepToolbar.style.display = 'flex';
      });

      btnView3D.addEventListener('click', () => {
        btnView3D.classList.add('active');
        btnView2D.classList.remove('active');
        if (container3D) container3D.classList.remove('hidden');
        if (container2D) container2D.classList.add('hidden');
        const pepToolbar = document.getElementById('pepakura-toolbar');
        if (pepToolbar) pepToolbar.style.display = 'none';
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

  setupCollapsibleSections() {
    const titles = document.querySelectorAll('.sidebar-content .section-title');
    titles.forEach(title => {
      title.style.cursor = 'pointer';
      title.style.userSelect = 'none';
      title.title = 'Haz clic para colapsar / expandir sección';
      title.addEventListener('click', () => {
        const next = title.nextElementSibling;
        if (next && next.classList.contains('card-panel')) {
          const isHidden = next.style.display === 'none';
          next.style.display = isHidden ? '' : 'none';
          title.style.opacity = isHidden ? '1' : '0.65';
        }
      });
    });
  }

  setupUIModeToggle() {
    this.uiMode = localStorage.getItem('pep_ui_mode') || 'simplified';
    const btnToggle = document.getElementById('btn-toggle-ui-mode');
    const selectCat = document.getElementById('select-phase-category');

    if (selectCat) {
      selectCat.addEventListener('change', (e) => {
        this.switchPhase(e.target.value);
      });
    }

    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.uiMode = this.uiMode === 'simplified' ? 'classic' : 'simplified';
        localStorage.setItem('pep_ui_mode', this.uiMode);
        this.applyUIMode();
      });
    }

    this.applyUIMode();
  }

  applyUIMode() {
    const btnToggle = document.getElementById('btn-toggle-ui-mode');
    const topNav = document.getElementById('top-phase-nav');
    const catSelector = document.getElementById('simplified-category-selector');
    const selectCat = document.getElementById('select-phase-category');

    if (this.uiMode === 'simplified') {
      if (topNav) topNav.style.display = 'none';
      if (catSelector) catSelector.style.display = 'block';
      if (btnToggle) {
        btnToggle.textContent = '⏪ Menú Clásico';
        btnToggle.title = 'Volver al Menú Clásico con solapas superiores y todas las secciones visibles';
      }
      if (selectCat) selectCat.value = this.activePhase || 'phase1';
    } else {
      if (topNav) topNav.style.display = 'flex';
      if (catSelector) catSelector.style.display = 'none';
      if (btnToggle) {
        btnToggle.textContent = '✨ Menú Simplificado';
        btnToggle.title = 'Activar el Menú Simplificado sin solapas y solo controles usados';
      }
      document.querySelectorAll('.sidebar-content .card-panel').forEach(p => {
        p.style.display = '';
      });
    }
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
      ],
      'preset-loft-intake': [
        { id: 1, x: 0, z: 0, d: 50, shape: 'rect', w: 50, h: 50 },
        { id: 2, x: 50, z: 0, d: 60, shape: 'circle' },
        { id: 3, x: 120, z: 0, d: 60, shape: 'circle' },
        { id: 4, x: 170, z: 0, d: 40, shape: 'circle' }
      ],
      'preset-loft-oval': [
        { id: 1, x: 0, z: 0, d: 20, shape: 'ellipse', w: 30, h: 15 },
        { id: 2, x: 40, z: 0, d: 60, shape: 'ellipse', w: 80, h: 40 },
        { id: 3, x: 120, z: 0, d: 60, shape: 'ellipse', w: 80, h: 40 },
        { id: 4, x: 160, z: 0, d: 40, shape: 'circle', d: 40 }
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
      if (elGroupD2) elGroupD2.style.display = 'none';
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

    const selectCat = document.getElementById('select-phase-category');
    if (selectCat && selectCat.value !== phase) selectCat.value = phase;

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
      numLabel.style.fontWeight = '700';
      numLabel.style.color = 'var(--text-muted)';
      
      const inputX = document.createElement('input');
      inputX.type = 'number';
      inputX.value = station.x;
      inputX.style.width = '68px';
      inputX.placeholder = 'X';
      inputX.title = 'Posición X en el eje (mm)';
      inputX.addEventListener('input', (e) => {
        station.x = parseFloat(e.target.value) || 0;
        this.recalculateAndRender();
      });

      const inputZ = document.createElement('input');
      inputZ.type = 'number';
      inputZ.value = station.z || 0;
      inputZ.style.width = '60px';
      inputZ.placeholder = 'Z';
      inputZ.title = 'Descentrado Z / Elevación en mm';
      inputZ.addEventListener('input', (e) => {
        station.z = parseFloat(e.target.value) || 0;
        this.recalculateAndRender();
      });

      const selectShape = document.createElement('select');
      selectShape.style.width = '88px';
      selectShape.style.fontSize = '11px';
      selectShape.style.padding = '4px';
      selectShape.style.background = 'var(--bg-panel)';
      selectShape.style.color = 'var(--text-primary)';
      selectShape.style.border = '1px solid var(--border-subtle)';
      selectShape.style.borderRadius = '4px';

      const shapes = [
        { val: 'circle', label: 'Círculo' },
        { val: 'ellipse', label: 'Elipse' },
        { val: 'rect', label: 'Rectángulo' },
        { val: 'rounded_rect', label: 'Rect. Red.' },
        { val: 'polygon', label: 'Polígono' },
        { val: 'airfoil', label: 'Perfil NACA' },
        { val: 'custom', label: 'Personalizado' }
      ];
      shapes.forEach(sh => {
        const opt = document.createElement('option');
        opt.value = sh.val;
        opt.textContent = sh.label;
        if ((station.shape || 'circle') === sh.val) opt.selected = true;
        selectShape.appendChild(opt);
      });
      selectShape.addEventListener('change', (e) => {
        station.shape = e.target.value;
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });

      const dimBox = document.createElement('div');
      dimBox.style.display = 'flex';
      dimBox.style.gap = '4px';
      dimBox.style.flex = '1';

      if (station.shape === 'ellipse' || station.shape === 'rect' || station.shape === 'rounded_rect' || station.shape === 'airfoil') {
        const inpW = document.createElement('input');
        inpW.type = 'number';
        inpW.value = station.w || station.d || 60;
        inpW.style.width = '54px';
        inpW.title = 'Ancho W (mm)';
        inpW.addEventListener('input', (e) => {
          station.w = Math.max(1, parseFloat(e.target.value) || 0);
          this.recalculateAndRender();
        });
        const inpH = document.createElement('input');
        inpH.type = 'number';
        inpH.value = station.h || 40;
        inpH.style.width = '54px';
        inpH.title = 'Alto H (mm)';
        inpH.addEventListener('input', (e) => {
          station.h = Math.max(1, parseFloat(e.target.value) || 0);
          this.recalculateAndRender();
        });
        dimBox.appendChild(inpW);
        dimBox.appendChild(inpH);
      } else if (station.shape === 'custom') {
        const lblCustom = document.createElement('span');
        lblCustom.textContent = '[CAD 2D]';
        lblCustom.style.fontSize = '11px';
        lblCustom.style.fontWeight = '700';
        lblCustom.style.color = 'var(--accent-cyan)';
        lblCustom.style.alignSelf = 'center';
        dimBox.appendChild(lblCustom);
      } else {
        const inputD = document.createElement('input');
        inputD.type = 'number';
        inputD.value = station.d || 50;
        inputD.style.width = '68px';
        inputD.title = 'Diámetro D (mm)';
        inputD.addEventListener('input', (e) => {
          station.d = Math.max(0, parseFloat(e.target.value) || 0);
          this.recalculateAndRender();
        });
        dimBox.appendChild(inputD);
      }

      const btnEdit2D = document.createElement('button');
      btnEdit2D.textContent = '✏️';
      btnEdit2D.className = 'btn-preset';
      btnEdit2D.style.padding = '4px 6px';
      btnEdit2D.style.minWidth = 'auto';
      btnEdit2D.title = 'Dibujar / Editar Forma 2D en Milímetros';
      btnEdit2D.addEventListener('click', () => {
        this.openStationEditorModal(station, index);
      });
      
      const btnDel = document.createElement('button');
      btnDel.textContent = '×';
      btnDel.className = 'btn-preset';
      btnDel.style.padding = '4px 6px';
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
      
      const btnCopyRow = document.createElement('button');
      btnCopyRow.textContent = '📋';
      btnCopyRow.className = 'btn-preset';
      btnCopyRow.style.padding = '4px 6px';
      btnCopyRow.style.minWidth = 'auto';
      btnCopyRow.title = 'Copiar forma de esta cuaderna';
      btnCopyRow.addEventListener('click', () => {
        window.PaperAlfaClipboardStation = JSON.parse(JSON.stringify({
          shape: station.shape,
          d: station.d,
          w: station.w,
          h: station.h,
          customPoints: station.customPoints ? JSON.parse(JSON.stringify(station.customPoints)) : null
        }));
        btnCopyRow.textContent = '✓';
        setTimeout(() => { btnCopyRow.textContent = '📋'; }, 1500);
      });

      const btnPasteRow = document.createElement('button');
      btnPasteRow.textContent = '📥';
      btnPasteRow.className = 'btn-preset';
      btnPasteRow.style.padding = '4px 6px';
      btnPasteRow.style.minWidth = 'auto';
      btnPasteRow.title = 'Pegar forma copiada en esta cuaderna';
      btnPasteRow.addEventListener('click', () => {
        if (!window.PaperAlfaClipboardStation) {
          alert('No has copiado ninguna cuaderna aún. Pulsa 📋 primero en la cuaderna origen.');
          return;
        }
        const clip = window.PaperAlfaClipboardStation;
        station.shape = clip.shape;
        if (clip.d !== undefined) station.d = clip.d;
        if (clip.w !== undefined) station.w = clip.w;
        if (clip.h !== undefined) station.h = clip.h;
        if (clip.customPoints) {
          station.customPoints = JSON.parse(JSON.stringify(clip.customPoints));
        }
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });

      row.appendChild(numLabel);
      row.appendChild(inputX);
      row.appendChild(inputZ);
      row.appendChild(selectShape);
      row.appendChild(dimBox);
      row.appendChild(btnEdit2D);
      row.appendChild(btnCopyRow);
      row.appendChild(btnPasteRow);
      row.appendChild(btnDel);
      container.appendChild(row);
    });
  }

  openStationEditorModal(station, index) {
    this.editingStation = station;
    this.editingStationIndex = index;
    const modal = document.getElementById('modal-station-editor');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (station.customPoints && station.customPoints.length >= 3) {
      this.editingPoints = JSON.parse(JSON.stringify(station.customPoints));
    } else {
      const pts = this.geometry.getStationPerimeter2D(station, 16);
      this.editingPoints = pts.slice(0, pts.length - 1).map(p => ({ y: Number(p.y.toFixed(1)), z: Number(p.z.toFixed(1)) }));
    }

    this.cadHistory = [JSON.parse(JSON.stringify(this.editingPoints))];
    this.cadHistoryIndex = 0;
    this.selectedCadPointIndex = 0;

    const select = document.getElementById('cad-select-template');
    if (select) select.value = station.shape || 'circle';

    this.renderCADEditor(false);
  }

  pushCadHistory() {
    if (!this.editingPoints) return;
    this.cadHistory = this.cadHistory.slice(0, this.cadHistoryIndex + 1);
    this.cadHistory.push(JSON.parse(JSON.stringify(this.editingPoints)));
    if (this.cadHistory.length > 40) {
      this.cadHistory.shift();
    } else {
      this.cadHistoryIndex++;
    }
    this.cadHistoryIndex = this.cadHistory.length - 1;
  }

  cadUndo() {
    if (this.cadHistoryIndex > 0) {
      this.cadHistoryIndex--;
      this.editingPoints = JSON.parse(JSON.stringify(this.cadHistory[this.cadHistoryIndex]));
      if (this.selectedCadPointIndex >= this.editingPoints.length) {
        this.selectedCadPointIndex = this.editingPoints.length - 1;
      }
      this.renderCADEditor(false);
    }
  }

  cadRedo() {
    if (this.cadHistoryIndex < this.cadHistory.length - 1) {
      this.cadHistoryIndex++;
      this.editingPoints = JSON.parse(JSON.stringify(this.cadHistory[this.cadHistoryIndex]));
      if (this.selectedCadPointIndex >= this.editingPoints.length) {
        this.selectedCadPointIndex = this.editingPoints.length - 1;
      }
      this.renderCADEditor(false);
    }
  }

  applySymmetry() {
    if (!this.editingPoints || this.editingPoints.length < 2) return;
    
    // 1. Detectar si el usuario dibujó en el lado izquierdo (Y <= 0) o derecho (Y >= 0)
    const maxPos = Math.max(...this.editingPoints.map(p => p.y));
    const minNeg = Math.min(...this.editingPoints.map(p => p.y));
    const useLeftHalf = (Math.abs(minNeg) > maxPos && maxPos <= 0.5);
    
    let sourceHalf = useLeftHalf
      ? this.editingPoints.filter(p => p.y <= 0.2)
      : this.editingPoints.filter(p => p.y >= -0.2);

    if (sourceHalf.length < 2) return;

    // 2. Limpiar puntos intermedios en el eje central Y=0 (puntos que el usuario dibujó para cerrar la plantilla de media hoja)
    const centerPts = sourceHalf.filter(p => Math.abs(p.y) <= 0.2);
    if (centerPts.length > 2) {
      const maxZ = Math.max(...centerPts.map(p => p.z));
      const minZ = Math.min(...centerPts.map(p => p.z));
      // Solo conservar en el eje Y=0 el punto más alto (techo) y el más bajo (piso)
      sourceHalf = sourceHalf.filter(p => {
        if (Math.abs(p.y) <= 0.2) {
          return (Math.abs(p.z - maxZ) <= 0.2 || Math.abs(p.z - minZ) <= 0.2);
        }
        return true;
      });
    }

    if (sourceHalf.length < 2) return;

    // 3. Calcular Z central para ordenar por ángulo polar respecto al centro (evita cruces en líneas horizontales)
    const cz = sourceHalf.reduce((sum, p) => sum + p.z, 0) / sourceHalf.length;
    const getAngle = (p) => Math.atan2(p.z - cz, Math.abs(p.y));
    
    // 4. Ordenar el lado derecho en sentido de las agujas del reloj desde el techo (+90°) hasta la panza (-90°)
    const rightSide = sourceHalf
      .map(p => ({ y: Number(Math.abs(p.y).toFixed(1)), z: p.z }))
      .sort((a, b) => {
        const angA = getAngle(a);
        const angB = getAngle(b);
        if (Math.abs(angA - angB) > 1e-4) {
          return angB - angA; // Descendente: desde techo (+1.57 rad) a panza (-1.57 rad)
        }
        return b.y - a.y;
      });

    // 5. El lado izquierdo recorre en orden inverso (desde panza hasta techo) y con Y negativa
    const leftSide = rightSide
      .slice()
      .reverse()
      .map(p => ({ y: Number((-p.y).toFixed(1)), z: p.z }));

    const combined = [];
    const addUnique = (pt) => {
      const isDup = combined.some(existing => Math.hypot(existing.y - pt.y, existing.z - pt.z) < 0.2);
      if (!isDup) combined.push(pt);
    };

    rightSide.forEach(addUnique);
    leftSide.forEach(addUnique);

    if (combined.length >= 3) {
      this.editingPoints = combined;
      this.selectedCadPointIndex = 0;
      this.renderCADEditor(true);
    }
  }

  copyCADProfile() {
    if (!this.editingPoints || this.editingPoints.length === 0) return;
    window.PaperAlfaClipboardProfile = JSON.parse(JSON.stringify(this.editingPoints));
    const status = document.getElementById('cad-clipboard-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = `✓ Perfil copiado (${this.editingPoints.length} vértices en memoria)`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
  }

  pasteCADProfile() {
    if (!window.PaperAlfaClipboardProfile || window.PaperAlfaClipboardProfile.length < 3) {
      alert('No hay ninguna forma en la memoria. Primero pulsa "📋 Copiar Forma" en la cuaderna original.');
      return;
    }
    this.editingPoints = JSON.parse(JSON.stringify(window.PaperAlfaClipboardProfile));
    this.selectedCadPointIndex = 0;
    const sel = document.getElementById('cad-select-template');
    if (sel) sel.value = 'custom';
    const status = document.getElementById('cad-clipboard-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = `✓ Forma pegada y aplicada en esta cuaderna`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
    this.renderCADEditor(true);
  }

  scaleCADProfile(scaleFactor) {
    if (!this.editingPoints || typeof scaleFactor !== 'number' || isNaN(scaleFactor) || scaleFactor <= 0) return;
    this.editingPoints.forEach(p => {
      p.y = Number((p.y * scaleFactor).toFixed(1));
      p.z = Number((p.z * scaleFactor).toFixed(1));
    });
    const status = document.getElementById('cad-clipboard-status');
    if (status) {
      status.style.display = 'block';
      status.textContent = `✓ Tamaño escalado (× ${scaleFactor.toFixed(2)})`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
    this.renderCADEditor(true);
  }

  addCADPointAfterSelected() {
    if (!this.editingPoints || this.editingPoints.length === 0) return;
    const idx = (this.selectedCadPointIndex !== null && this.selectedCadPointIndex < this.editingPoints.length)
      ? this.selectedCadPointIndex
      : this.editingPoints.length - 1;
    const nextIdx = (idx + 1) % this.editingPoints.length;
    const p1 = this.editingPoints[idx];
    const p2 = this.editingPoints[nextIdx];
    const dist = Math.hypot(p2.y - p1.y, p2.z - p1.z);
    
    let newPt;
    if (dist === 0) {
      newPt = { y: p1.y + 5, z: p1.z };
    } else if (dist <= 20) {
      newPt = {
        y: Number(((p1.y + p2.y) / 2).toFixed(1)),
        z: Number(((p1.z + p2.z) / 2).toFixed(1))
      };
    } else {
      // Si están lejos, colocar el punto a 10 mm del punto seleccionado en dirección al siguiente para no romper la figura
      const t = 10 / dist;
      newPt = {
        y: Number((p1.y + (p2.y - p1.y) * t).toFixed(1)),
        z: Number((p1.z + (p2.z - p1.z) * t).toFixed(1))
      };
    }
    
    this.editingPoints.splice(idx + 1, 0, newPt);
    this.selectedCadPointIndex = idx + 1;
    this.renderCADEditor(true);
  }

  toggleCADAddClickMode() {
    this.isCadAddingByClick = !this.isCadAddingByClick;
    const btn = document.getElementById('btn-cad-add-click');
    const hint = document.getElementById('cad-add-click-hint');
    const svg = document.getElementById('cad-svg-editor');
    if (btn && hint && svg) {
      if (this.isCadAddingByClick) {
        btn.style.background = 'var(--accent-cyan)';
        btn.style.color = '#0D1117';
        hint.style.display = 'block';
        svg.style.cursor = 'crosshair';
      } else {
        btn.style.background = '';
        btn.style.color = '';
        hint.style.display = 'none';
        svg.style.cursor = '';
      }
    }
  }

  selectCadPoint(i) {
    if (!this.editingPoints || i < 0 || i >= this.editingPoints.length) return;
    this.selectedCadPointIndex = i;
    
    // Resaltar en tabla y hacer scroll
    const rows = document.querySelectorAll('#cad-points-tbody tr');
    rows.forEach((r, idx) => {
      r.classList.toggle('selected-row', idx === i);
      if (idx === i) {
        r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // Mostrar estadísticas y distancias en vivo del punto seleccionado
    const box = document.getElementById('cad-stat-selected');
    if (box && this.editingPoints[i]) {
      const pt = this.editingPoints[i];
      const n = this.editingPoints.length;
      const prevPt = this.editingPoints[(i - 1 + n) % n];
      const nextPt = this.editingPoints[(i + 1) % n];
      const dPrev = Math.hypot(pt.y - prevPt.y, pt.z - prevPt.z).toFixed(1);
      const dNext = Math.hypot(pt.y - nextPt.y, pt.z - nextPt.z).toFixed(1);
      box.innerHTML = `
        <div style="font-weight: 700; color: #FFF; margin-bottom: 2px;">📍 Vértice #${i + 1} Seleccionado</div>
        <div>Coord: <strong>Y = ${pt.y} mm</strong> | <strong>Z = ${pt.z} mm</strong></div>
        <div style="color: var(--text-secondary); margin-top: 2px;">
          ↔ Distancia anterior (#${(i - 1 + n) % n + 1}): <strong>${dPrev} mm</strong> | siguiente (#${(i + 1) % n + 1}): <strong>${dNext} mm</strong>
        </div>
      `;
    }

    this.drawCADCanvas();
  }

  renderCADEditor(pushHistory = true) {
    if (pushHistory) this.pushCadHistory();
    const tbody = document.getElementById('cad-points-tbody');
    if (tbody && this.editingPoints) {
      tbody.innerHTML = '';
      this.editingPoints.forEach((pt, i) => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', (e) => {
          if (!e.target.matches('input, button')) {
            this.selectCadPoint(i);
          }
        });
        
        const tdIdx = document.createElement('td');
        tdIdx.textContent = i + 1;
        
        const tdY = document.createElement('td');
        const inpY = document.createElement('input');
        inpY.type = 'number';
        inpY.step = '0.5';
        inpY.value = pt.y;
        inpY.addEventListener('focus', () => this.selectCadPoint(i));
        inpY.addEventListener('input', (e) => {
          pt.y = parseFloat(e.target.value) || 0;
          this.pushCadHistory();
          this.drawCADCanvas();
          this.selectCadPoint(i);
        });
        tdY.appendChild(inpY);

        const tdZ = document.createElement('td');
        const inpZ = document.createElement('input');
        inpZ.type = 'number';
        inpZ.step = '0.5';
        inpZ.value = pt.z;
        inpZ.addEventListener('focus', () => this.selectCadPoint(i));
        inpZ.addEventListener('input', (e) => {
          pt.z = parseFloat(e.target.value) || 0;
          this.pushCadHistory();
          this.drawCADCanvas();
          this.selectCadPoint(i);
        });
        tdZ.appendChild(inpZ);

        const tdDel = document.createElement('td');
        const btnD = document.createElement('button');
        btnD.textContent = '×';
        btnD.className = 'btn-preset';
        btnD.style.padding = '2px 5px';
        btnD.style.color = '#ff4a4a';
        btnD.style.borderColor = 'transparent';
        btnD.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.editingPoints.length > 3) {
            this.editingPoints.splice(i, 1);
            if (this.selectedCadPointIndex >= this.editingPoints.length) {
              this.selectedCadPointIndex = this.editingPoints.length - 1;
            }
            this.renderCADEditor(true);
          }
        });
        tdDel.appendChild(btnD);

        tr.appendChild(tdIdx);
        tr.appendChild(tdY);
        tr.appendChild(tdZ);
        tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
    }

    this.drawCADCanvas();
    if (this.selectedCadPointIndex !== null && this.editingPoints && this.selectedCadPointIndex < this.editingPoints.length) {
      this.selectCadPoint(this.selectedCadPointIndex);
    }
  }

  drawCADCanvas() {
    const svg = document.getElementById('cad-svg-editor');
    if (!svg || !this.editingPoints) return;
    svg.innerHTML = '';

    const createEl = (tag, attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };

    for (let g = -80; g <= 80; g += 10) {
      const isMajor = g % 50 === 0;
      const color = isMajor ? '#2E3C56' : '#1A2333';
      const width = isMajor ? '0.4' : '0.2';
      svg.appendChild(createEl('line', { x1: g, y1: -80, x2: g, y2: 80, stroke: color, 'stroke-width': width }));
      svg.appendChild(createEl('line', { x1: -80, y1: g, x2: 80, y2: g, stroke: color, 'stroke-width': width }));
    }

    svg.appendChild(createEl('line', { x1: -80, y1: 0, x2: 80, y2: 0, stroke: '#0066CC', 'stroke-width': '0.5' }));
    svg.appendChild(createEl('line', { x1: 0, y1: -80, x2: 0, y2: 80, stroke: '#0066CC', 'stroke-width': '0.5' }));

    svg.appendChild(createEl('line', { x1: -5, y1: 0, x2: 5, y2: 0, stroke: '#0066CC', 'stroke-width': '0.8' }));
    svg.appendChild(createEl('line', { x1: 0, y1: -5, x2: 0, y2: 5, stroke: '#0066CC', 'stroke-width': '0.8' }));

    // Dibujar marcas de graduación (ticks) y etiquetas numéricas de coordenadas en los ejes
    for (let val = -70; val <= 70; val += 10) {
      if (val === 0) continue;
      const isMajor = val % 20 === 0;
      const tickLen = isMajor ? 1.8 : 1.0;
      
      // Ticks en eje Y (horizontal, y=0 en SVG)
      svg.appendChild(createEl('line', {
        x1: val, y1: -tickLen, x2: val, y2: tickLen,
        stroke: isMajor ? '#5E7A9C' : '#2E3C56',
        'stroke-width': '0.4'
      }));
      // Ticks en eje Z (vertical, x=0 en SVG)
      svg.appendChild(createEl('line', {
        x1: -tickLen, y1: -val, x2: tickLen, y2: -val,
        stroke: isMajor ? '#5E7A9C' : '#2E3C56',
        'stroke-width': '0.4'
      }));

      // Etiquetas numéricas cada 20 mm
      if (isMajor) {
        const textY = createEl('text', {
          x: val,
          y: 3.8,
          fill: '#7B96B8',
          'font-size': '3.2',
          'font-family': 'monospace',
          'text-anchor': 'middle',
          'user-select': 'none'
        });
        textY.textContent = val > 0 ? `+${val}` : `${val}`;
        svg.appendChild(textY);

        const textZ = createEl('text', {
          x: 2.2,
          y: -val + 1.1,
          fill: '#7B96B8',
          'font-size': '3.2',
          'font-family': 'monospace',
          'text-anchor': 'start',
          'user-select': 'none'
        });
        textZ.textContent = val > 0 ? `+${val}` : `${val}`;
        svg.appendChild(textZ);
      }
    }

    // Etiqueta de Origen (0,0) en la intersección
    const originText = createEl('text', {
      x: -1.8,
      y: 3.8,
      fill: '#00F0FF',
      'font-size': '3.4',
      'font-family': 'monospace',
      'font-weight': 'bold',
      'text-anchor': 'end',
      'user-select': 'none'
    });
    originText.textContent = '0';
    svg.appendChild(originText);

    const centroid = this.geometry.calculateShapeCentroid(this.editingPoints);
    const cy = centroid.y;
    const cz = -centroid.z;
    
    const spanCentroid = document.getElementById('cad-stat-centroid');
    if (spanCentroid) spanCentroid.textContent = `Y=${cy.toFixed(1)} mm, Z=${(-cz).toFixed(1)} mm`;
    const spanArea = document.getElementById('cad-stat-area');
    if (spanArea && centroid.area !== undefined) {
      spanArea.textContent = `${(centroid.area / 100).toFixed(2)} cm² (${centroid.area.toFixed(0)} mm²)`;
    }

    // Calcular Perímetro Total (L) y Caja Envolvente (W x H)
    let perim = 0;
    const pts = this.editingPoints;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      perim += Math.hypot(p2.y - p1.y, p2.z - p1.z);
    }
    const spanPerim = document.getElementById('cad-stat-perim');
    if (spanPerim) spanPerim.textContent = `${perim.toFixed(1)} mm (${(perim / 10).toFixed(1)} cm)`;

    const ys = pts.map(p => p.y);
    const zs = pts.map(p => p.z);
    const wBox = Math.max(...ys) - Math.min(...ys);
    const hBox = Math.max(...zs) - Math.min(...zs);
    const spanBBox = document.getElementById('cad-stat-bbox');
    if (spanBBox) spanBBox.textContent = `W=${wBox.toFixed(1)} mm × H=${hBox.toFixed(1)} mm`;

    const sz = 4;
    svg.appendChild(createEl('line', { x1: cy - sz, y1: cz - sz, x2: cy + sz, y2: cz + sz, stroke: '#FF3B30', 'stroke-width': '0.8' }));
    svg.appendChild(createEl('line', { x1: cy - sz, y1: cz + sz, x2: cy + sz, y2: cz - sz, stroke: '#FF3B30', 'stroke-width': '0.8' }));

    const pointsStr = [...this.editingPoints, this.editingPoints[0]].map(p => `${p.y},${-p.z}`).join(' ');
    svg.appendChild(createEl('polygon', {
      points: pointsStr,
      fill: 'rgba(0, 240, 255, 0.12)',
      stroke: '#00F0FF',
      'stroke-width': '1.2'
    }));

    this.editingPoints.forEach((pt, i) => {
      const isSelected = (i === this.selectedCadPointIndex);
      if (isSelected) {
        svg.appendChild(createEl('circle', {
          cx: pt.y,
          cy: -pt.z,
          r: 5.5,
          fill: 'none',
          stroke: '#00F0FF',
          'stroke-width': '0.8',
          opacity: '0.7'
        }));
      }
      const circle = createEl('circle', {
        cx: pt.y,
        cy: -pt.z,
        r: isSelected ? 3.2 : 1.8,
        fill: isSelected ? '#00F0FF' : '#FF8000',
        stroke: '#FFFFFF',
        'stroke-width': isSelected ? '0.8' : '0.4',
        style: 'cursor: pointer;'
      });
      circle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectCadPoint(i);
      });
      svg.appendChild(circle);
    });
  }

  setupStationEditorModal() {
    const btnClose = document.getElementById('btn-close-station-editor');
    const modal = document.getElementById('modal-station-editor');
    if (btnClose && modal) {
      btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    }

    const btnAdd = document.getElementById('btn-cad-add-point');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.addCADPointAfterSelected());
    }

    const btnAddClick = document.getElementById('btn-cad-add-click');
    if (btnAddClick) {
      btnAddClick.addEventListener('click', () => this.toggleCADAddClickMode());
    }

    const btnUndo = document.getElementById('btn-cad-undo');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => this.cadUndo());
    }

    const btnRedo = document.getElementById('btn-cad-redo');
    if (btnRedo) {
      btnRedo.addEventListener('click', () => this.cadRedo());
    }

    const btnSymmetry = document.getElementById('btn-cad-symmetry');
    if (btnSymmetry) {
      btnSymmetry.addEventListener('click', () => this.applySymmetry());
    }

    const btnCenter = document.getElementById('btn-cad-center');
    if (btnCenter) {
      btnCenter.addEventListener('click', () => {
        if (!this.editingPoints) return;
        const c = this.geometry.calculateShapeCentroid(this.editingPoints);
        this.editingPoints.forEach(p => {
          p.y = Number((p.y - c.y).toFixed(1));
          p.z = Number((p.z - c.z).toFixed(1));
        });
        this.renderCADEditor(true);
      });
    }

    const btnClear = document.getElementById('btn-cad-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.editingPoints = [
          { y: -25, z: -15 },
          { y: 25, z: -15 },
          { y: 25, z: 15 },
          { y: -25, z: 15 }
        ];
        this.selectedCadPointIndex = 0;
        const sel = document.getElementById('cad-select-template');
        if (sel) sel.value = 'custom';
        this.renderCADEditor(true);
      });
    }

    const btnCopyProfile = document.getElementById('btn-cad-copy-profile');
    if (btnCopyProfile) {
      btnCopyProfile.addEventListener('click', () => this.copyCADProfile());
    }

    const btnPasteProfile = document.getElementById('btn-cad-paste-profile');
    if (btnPasteProfile) {
      btnPasteProfile.addEventListener('click', () => this.pasteCADProfile());
    }

    const quickScaleBtns = document.querySelectorAll('.btn-cad-scale-quick');
    quickScaleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const scale = parseFloat(btn.dataset.scale);
        if (scale && !isNaN(scale)) {
          this.scaleCADProfile(scale);
        }
      });
    });

    const btnApplyScale = document.getElementById('btn-cad-apply-scale');
    if (btnApplyScale) {
      btnApplyScale.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('cad-custom-scale-input')?.value);
        if (val && !isNaN(val)) {
          this.scaleCADProfile(val);
        }
      });
    }

    const selectTemplate = document.getElementById('cad-select-template');
    if (selectTemplate) {
      selectTemplate.addEventListener('change', (e) => {
        if (!this.editingStation) return;
        this.editingStation.shape = e.target.value;
        const pts = this.geometry.getStationPerimeter2D(this.editingStation, 16);
        this.editingPoints = pts.slice(0, pts.length - 1).map(p => ({ y: Number(p.y.toFixed(1)), z: Number(p.z.toFixed(1)) }));
        this.selectedCadPointIndex = 0;
        this.renderCADEditor(true);
      });
    }

    const svg = document.getElementById('cad-svg-editor');
    if (svg) {
      svg.addEventListener('click', (e) => {
        if (!this.editingPoints || !this.isCadAddingByClick) return;
        const rect = svg.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        let yCoord = -80 + normX * 160;
        let zCoord = -( -80 + normY * 160 );
        
        const snap = document.getElementById('cad-snap-mm')?.checked !== false;
        if (snap) {
          yCoord = Math.round(yCoord);
          zCoord = Math.round(zCoord);
        } else {
          yCoord = Number(yCoord.toFixed(1));
          zCoord = Number(zCoord.toFixed(1));
        }

        const idx = (this.selectedCadPointIndex !== null && this.selectedCadPointIndex < this.editingPoints.length)
          ? this.selectedCadPointIndex
          : this.editingPoints.length - 1;

        this.editingPoints.splice(idx + 1, 0, { y: yCoord, z: zCoord });
        this.selectedCadPointIndex = idx + 1;
        this.toggleCADAddClickMode(); // Desactivar modo tras insertar el punto
        this.renderCADEditor(true);
      });
    }

    window.addEventListener('keydown', (e) => {
      const cadModal = document.getElementById('modal-station-editor');
      if (!cadModal || cadModal.classList.contains('hidden')) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          this.cadRedo();
        } else {
          this.cadUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        this.cadRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!e.target.matches('input, textarea, select')) {
          if (this.selectedCadPointIndex !== null && this.editingPoints && this.editingPoints.length > 3) {
            e.preventDefault();
            this.editingPoints.splice(this.selectedCadPointIndex, 1);
            if (this.selectedCadPointIndex >= this.editingPoints.length) {
              this.selectedCadPointIndex = this.editingPoints.length - 1;
            }
            this.renderCADEditor(true);
          }
        }
      }
    });

    const btnApply = document.getElementById('btn-cad-apply');
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        if (!this.editingStation) return;
        this.editingStation.customPoints = JSON.parse(JSON.stringify(this.editingPoints));
        this.editingStation.shape = 'custom';
        modal.classList.add('hidden');
        this.renderLoftStationsUI();
        this.recalculateAndRender();
      });
    }
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

  refreshLayoutUI(targetPageIndex) {
    if (!this.currentModelData) return;
    if (typeof targetPageIndex !== 'undefined') {
      this.currentPageIndex = targetPageIndex;
    } else if (typeof this.currentPageIndex === 'number' && this.currentPageIndex >= (this.currentModelData.pages?.length || 1)) {
      this.currentPageIndex = Math.max(0, (this.currentModelData.pages?.length || 1) - 1);
    }
    if (this.viewer2D) {
      this.viewer2D.render(this.currentModelData, this.currentPageIndex);
    }
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
          this.refreshLayoutUI('all');
        });
        elPageSelector.appendChild(btnAll);

        for (let i = 0; i < totalPages; i++) {
          const btn = document.createElement('button');
          btn.className = `page-btn ${this.currentPageIndex === i ? 'active' : ''}`;
          btn.textContent = `Hoja #${i + 1}`;
          btn.addEventListener('click', () => {
            this.userSelectedSinglePage = true;
            this.refreshLayoutUI(i);
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
