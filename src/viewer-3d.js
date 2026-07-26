/**
 * PAPER ALFA - 3D Three.js Interactive Viewer (v1.0)
 * Visualizador y verificador 3D en tiempo real con sombreado tipo papel Bristol y wireframe CAD
 */

export class PaperAlfaViewer3D {
  constructor(canvasElementId) {
    this.canvas = document.getElementById(canvasElementId);
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

    // Adaptar tamaño al cambiar ventana
    window.addEventListener('resize', () => this.onWindowResize());

    this.animate();
  }

  onWindowResize() {
    if (!this.canvas || !this.camera || !this.renderer) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
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
      
      // Mover el centro del loft al origen para rotación elegante
      const minX = stations[0].x;
      const maxX = stations[stations.length - 1].x;
      const centerX = (minX + maxX) / 2;

      const zs = stations.map(s => s.z || 0);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      const centerZ = (minZ + maxZ) / 2;

      for (let i = 0; i < stations.length - 1; i++) {
        const s1 = stations[i];
        const s2 = stations[i+1];
        const h = Math.abs(s2.x - s1.x);
        if (h <= 0.01) continue;
        
        // En THREE.CylinderGeometry el eje es Y, por lo que rotaremos 90 grados
        const rBot = s1.d / 2;
        const rTop = s2.d / 2;
        const z1 = s1.z || 0;
        const z2 = s2.z || 0;
        const dz = z2 - z1;
        
        const geo = new window.THREE.CylinderGeometry(rTop, rBot, h, 64, 1, false);

        // Si hay descentrado en Z, cizallar (shear) los vértices del cilindro
        if (Math.abs(dz) > 0.001) {
          const pos = geo.attributes.position;
          for (let j = 0; j < pos.count; j++) {
            const y = pos.getY(j);
            const t = (y / h) + 0.5; // 0 en s1 (base), 1 en s2 (tapa)
            pos.setX(j, pos.getX(j) - (t - 0.5) * dz);
          }
          geo.computeVertexNormals();
        }

        const mat = (i % 2 === 0) ? material : materialAlt;
        const segMesh = new window.THREE.Mesh(geo, mat);
        
        // Posicionar en el eje X y Z
        const midX = (s1.x + s2.x) / 2;
        const midZ = (z1 + z2) / 2;
        segMesh.position.set(midX - centerX, midZ - centerZ, 0);
        segMesh.rotation.z = -Math.PI / 2; // Acostar el cilindro sobre el eje X

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
