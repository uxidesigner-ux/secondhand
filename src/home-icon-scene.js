// Shared scene definition for live WebGL icons and the generated static posters.
export function createIconScene(T, model, kind) {
  const scene = new T.Scene();
  const turntable = new T.Group();
  scene.add(turntable);
  const phone = kind === 'goods';
  const radius = phone ? 1.16 : 1.87;
  const top = new T.MeshStandardMaterial({color: '#f8fbff', roughness: .43, metalness: .08});
  const edge = new T.MeshStandardMaterial({color: '#c9d9ec', roughness: .4, metalness: .15});
  const base = new T.Mesh(new T.CylinderGeometry(radius, radius, .10, 64), [edge, top, edge]);
  base.position.y = .055;
  turntable.add(base);
  const ring = new T.Mesh(new T.TorusGeometry(radius - .025, .015, 6, 64), edge);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .11;
  turntable.add(ring);
  // A small marker makes the platform's continuous rotation visible as well.
  const marker = new T.Mesh(new T.BoxGeometry(.17, .008, .055),
    new T.MeshStandardMaterial({color: '#3182f6', roughness: .4}));
  marker.position.set(0, .112, radius - .12);
  turntable.add(marker);
  model.position.y = .12;
  turntable.add(model);
  const initialAngle = phone ? 3.35 : -.12;
  turntable.rotation.y = initialAngle;
  scene.add(new T.HemisphereLight('#ffffff', '#8b9cb5', 2.6));
  const key = new T.DirectionalLight('#fff8ef', 3.2);
  key.position.set(-3, 7, 5); scene.add(key);
  const fill = new T.DirectionalLight('#d9edff', 1.7);
  fill.position.set(4, 3, -5); scene.add(fill);
  const camera = new T.OrthographicCamera(-2.4, 2.4, 1.8, -1.8, .1, 40);
  camera.position.set(5, 4.1, 7);
  camera.lookAt(0, phone ? 1.38 : .94, 0);
  const resizeCamera = aspect => {
    const height = phone ? 3.65 : 3.3;
    camera.left = -height * aspect / 2; camera.right = height * aspect / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
  };
  resizeCamera(140 / 104);
  return {scene, camera, turntable, initialAngle, resizeCamera};
}

// Models are static within the rotating group. Batch same-material triangles so
// small decorative models don't turn into hundreds of mobile draw calls.
export function batchModel(T, model) {
  model.updateMatrixWorld(true);
  const batches = new Map();
  const originalGeometries = new Set();
  model.traverse(node => {
    if (!node.isMesh || Array.isArray(node.material)) return;
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    const list = batches.get(node.material) || [];
    list.push(geometry); batches.set(node.material, list);
    originalGeometries.add(node.geometry);
  });
  const group = new T.Group();
  for (const [material, geometries] of batches) {
    const geometry = new T.BufferGeometry();
    for (const name of Object.keys(geometries[0].attributes)) {
      const attributes = geometries.map(item => item.getAttribute(name));
      if (attributes.some(attribute => !attribute)) continue;
      const values = new Float32Array(attributes.reduce((sum, attribute) => sum + attribute.array.length, 0));
      let offset = 0;
      for (const attribute of attributes) { values.set(attribute.array, offset); offset += attribute.array.length; }
      geometry.setAttribute(name, new T.BufferAttribute(values, attributes[0].itemSize));
    }
    group.add(new T.Mesh(geometry, material));
    geometries.forEach(item => item.dispose());
  }
  originalGeometries.forEach(geometry => geometry.dispose());
  return group;
}
