import { PaperAlfaGeometry } from './geometry.js';

/**
 * PAPER ALFA - 3D Three.js Interactive Viewer (v1.0)
 * Visualizador y verificador 3D en tiempo real con sombreado tipo papel Bristol y wireframe CAD
 */

export class PaperAlfaViewer3D {
  constructor(canvasElementId) {
    this.canvas = document.getElementById(canvasElementId);
    this.geom = new PaperAlfaGeometry();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.mesh = null;
    this.wireframeMesh = null;
    this.wireframeMode = false;
    this.init();
  }

  init() {
    if (!this.canvas || !window.THREE) return;

    const width = this.canvas.clientWidth || 500;
    const height = this.canvas.clientHeight || 400;

    this.scene = new window.THREE.Scene();
    this.scene.background = new window.THREE.Color(0x0a0f16);

    // Cámara de perspectiva en mm
    this.camera = new window.THREE.PerspectiveCamera(45, width / height, 1, 2000);
    this.camera.position.set(120, 90, 160);

    this.renderer = new window.THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    // Iluminación escenográfica de estudio
    const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const dirLight1 = new window.THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(100, 150, 100);
    this.scene.add(dirLight1);

    const dirLight2 = new window.THREE.DirectionalLight(0x00F0FF, 0.35); // Toque cyan espacial
    dirLight2.position.set(-100, -50, -100);
    this.scene.add(dirLight2);

    // Grilla de piso (Plano de referencia)
    const gridHelper = new window.THREE.GridHelper(300, 30, 0x1E293B, 0x0F172A);
    gridHelper.position.y = -60;
    this.scene.add(gridHelper);

    // OrbitControls si está disponible
    if (window.THREE.OrbitControls) {
      this.controls = new window.THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.set(0, 0, 0);
    }

    // Adaptar tamaño dinámicamente con ResizeObserver (mucho más robusto que window resize)
    const observer = new ResizeObserver(() => {
      this.onWindowResize();
    });
    observer.observe(this.canvas.parentElement);

    this.animate();
  }

  onWindowResize() {
    if (!this.canvas || !this.camera || !this.renderer) return;
    const width = this.canvas.parentElement.clientWidth;
    const height = this.canvas.parentElement.clientHeight;
    if (width === 0 || height === 0) return; // No redimensionar si está oculto
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  toggleWireframe(forceValue) {
    this.wireframeMode = forceValue !== undefined ? forceValue : !this.wireframeMode;
    if (this.mesh && this.mesh.material) {
      this.mesh.material.wireframe = this.wireframeMode;
    }
  }

  /**
   * Actualiza el modelo 3D según el Cono Truncado o Cilindro actual
   */
  updateGeometry(params) {
    if (!this.scene || !window.THREE) return;

    // Remover malla anterior de forma segura y recursiva
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
    if (this.wireframeMesh) {
      this.scene.remove(this.wireframeMesh);
      if (this.wireframeMesh.geometry) this.wireframeMesh.geometry.dispose();
      if (this.wireframeMesh.material) {
        if (Array.isArray(this.wireframeMesh.material)) {
          this.wireframeMesh.material.forEach(m => m.dispose());
        } else {
          this.wireframeMesh.material.dispose();
        }
      }
      this.wireframeMesh = null;
    }

    const type = params.type || 'truncated_cone';
    this.mesh = new window.THREE.Group();

    // Material tipo papel opalina mate de modelismo
    const material = new window.THREE.MeshStandardMaterial({
      color: 0xE2E8F0,
      roughness: 0.7,
      metalness: 0.05,
      wireframe: this.wireframeMode,
      side: window.THREE.DoubleSide
    });
    // Material alternativo para diferenciar secciones de loft
    const materialAlt = new window.THREE.MeshStandardMaterial({
      color: 0xD0D9E4,
      roughness: 0.7,
      metalness: 0.05,
      wireframe: this.wireframeMode,
      side: window.THREE.DoubleSide
    });
    const lineMaterial = new window.THREE.LineBasicMaterial({ color: 0x00F0FF, linewidth: 2 });

    if (type === 'loft' && params.stations && params.stations.length > 0) {
      const stations = params.stations;
      
      const minX = stations[0].x;
      const maxX = stations[stations.length - 1].x;
      const centerX = (minX + maxX) / 2;

      const zs = stations.map(s => s.z || 0);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const centerZ = (minZ + maxZ) / 2;
      const N = 64;

      // 1. Dibujar cada estación 2D y sus marcadores técnicos de Centroide X y Eje +
      stations.forEach((s, idx) => {
        const pts3D_geom = this.geom.getStationPerimeter3D(s, s.x, N);
        const pts3D = pts3D_geom.map(p => new window.THREE.Vector3(p.x - centerX, p.z - centerZ, p.y));

        // Borde de la estación en naranja técnico
        const geomLoop = new window.THREE.BufferGeometry().setFromPoints([...pts3D, pts3D[0]]);
        const matLoop = new window.THREE.LineBasicMaterial({ color: 0xFF8000, linewidth: 2 });
        this.mesh.add(new window.THREE.Line(geomLoop, matLoop));

        // Cruz técnica Roja X en Centroide (calculada sin pitch para el marcador)
        const pts2D = this.geom.getStationPerimeter2D(s, N);
        const centroid = this.geom.calculateShapeCentroid(pts2D);
        const cy = s.x - centerX;
        const cz = centroid.z - centerZ;
        const cx = centroid.y;
        const sz = 4;
        const ptsX = [
          new window.THREE.Vector3(cy, cz - sz, cx - sz), new window.THREE.Vector3(cy, cz + sz, cx + sz),
          new window.THREE.Vector3(cy, cz + sz, cx - sz), new window.THREE.Vector3(cy, cz - sz, cx + sz)
        ];
        const geomX = new window.THREE.BufferGeometry().setFromPoints(ptsX);
        const matX = new window.THREE.LineBasicMaterial({ color: 0xFF3B30, linewidth: 2 });
        this.mesh.add(new window.THREE.LineSegments(geomX, matX));

        // Cruz técnica Azul + de Eje aeronáutico en (0,0)
        const az = -centerZ;
        const szAx = 5;
        const ptsAx = [
          new window.THREE.Vector3(cy, az - szAx, 0), new window.THREE.Vector3(cy, az + szAx, 0),
          new window.THREE.Vector3(cy, az, -szAx), new window.THREE.Vector3(cy, az, szAx)
        ];
        const geomAx = new window.THREE.BufferGeometry().setFromPoints(ptsAx);
        const matAx = new window.THREE.LineBasicMaterial({ color: 0x0066CC, linewidth: 1.5 });
        this.mesh.add(new window.THREE.LineSegments(geomAx, matAx));
      });

      // 2. Construir la malla reglada 3D para cada segmento entre estaciones
      for (let i = 0; i < stations.length - 1; i++) {
        const s1 = stations[i];
        const s2 = stations[i+1];
        if (Math.abs(s2.x - s1.x) <= 0.01) continue;

        const pts1_geom = this.geom.getStationPerimeter3D(s1, s1.x, N);
        const pts2_geom = this.geom.getStationPerimeter3D(s2, s2.x, N);

        const positions = [];
        const indices = [];
        const v1 = pts1_geom.map(p => new window.THREE.Vector3(p.x - centerX, p.z - centerZ, p.y));
        const v2 = pts2_geom.map(p => new window.THREE.Vector3(p.x - centerX, p.z - centerZ, p.y));

        for (let j = 0; j < N; j++) {
          positions.push(v1[j].x, v1[j].y, v1[j].z);
          positions.push(v2[j].x, v2[j].y, v2[j].z);
        }

        for (let j = 0; j < N; j++) {
          const next = (j + 1) % N;
          const idxA = j * 2;
          const idxB = j * 2 + 1;
          const idxC = next * 2;
          const idxD = next * 2 + 1;

          // Triángulos en orden correcto de normales (hacia el exterior)
          indices.push(idxA, idxC, idxB);
          indices.push(idxB, idxC, idxD);
        }

        const geo = new window.THREE.BufferGeometry();
        geo.setAttribute('position', new window.THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mat = (i % 2 === 0) ? material : materialAlt;
        const segMesh = new window.THREE.Mesh(geo, mat);

        const edges = new window.THREE.EdgesGeometry(geo, 15);
        const wireMesh = new window.THREE.LineSegments(edges, lineMaterial);
        segMesh.add(wireMesh);

        this.mesh.add(segMesh);
      }
    } else {
      const d1 = parseFloat(params.d1) || 80;
      const d2 = type === 'cone' || type === 'pyramid' ? 0 : (parseFloat(params.d2) || 45);
      const h = parseFloat(params.height) || 90;
      const sides = parseInt(params.sides) || 6;

      const rBottom = d1 / 2;
      const rTop = d2 / 2;
      const radialSegments = (type === 'prism' || type === 'pyramid') ? sides : 64;

      let geometry;
      if (type === 'hemisphere') {
        const rings = Math.max(3, parseInt(params.rings) || 5);
        geometry = new window.THREE.SphereGeometry(rBottom, 32, rings, 0, Math.PI * 2, 0, Math.PI / 2);
      } else if (type === 'sphere') {
        const rings = Math.max(3, parseInt(params.rings) || 5);
        geometry = new window.THREE.SphereGeometry(rBottom, 32, rings * 2);
      } else {
        geometry = new window.THREE.CylinderGeometry(rTop, rBottom, h, radialSegments, 1, false);
      }

      const singleMesh = new window.THREE.Mesh(geometry, material);
      const edges = new window.THREE.EdgesGeometry(geometry, 15);
      this.wireframeMesh = new window.THREE.LineSegments(edges, lineMaterial);
      singleMesh.add(this.wireframeMesh);
      
      this.mesh.add(singleMesh);
    }

    this.scene.add(this.mesh);

    // Ajustar objetivo de cámara para que el modelo quede centrado y visible con elegancia
    const maxDim = Math.max(d1, d2, h);
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.8);
      this.controls.update();
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) {
      this.controls.update();
    } else if (this.mesh) {
      // Rotación suave si no se está usando el ratón
      this.mesh.rotation.y += 0.003;
    }
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
