// Shared scene definition for live WebGL icons and the generated static posters.
export function createIconScene(T, model, kind) {
  const scene = new T.Scene();
  const turntable = new T.Group();
  scene.add(turntable);
  const phone = kind === 'goods';
  const radius = phone ? 1.16 : 1.87;
  // A continuous rounded profile catches broad highlights without a hard rim.
  const porcelain = new T.MeshStandardMaterial({color: '#f1eee8', roughness: .84, metalness: 0});
  const profile = [[0,.012],[radius-.065,.012],[radius-.028,.025],
    [radius-.006,.05],[radius,.082],[radius-.009,.113],
    [radius-.032,.137],[radius-.066,.145],[0,.145]];
  const base = new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),96),porcelain);
  base.name = 'rounded-clay-plinth';
  base.castShadow = true; base.receiveShadow = true;
  turntable.add(base);
  model.position.y = .15;
  turntable.add(model);
  const initialAngle = phone ? 3.35 : -.12;
  turntable.rotation.y = initialAngle;

  // A small transparent contact gradient anchors the plinth itself. Actual
  // light-space shadows above it ground the phone and car on the plinth.
  const size=64, pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const distance=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
    // Keep density until the plinth edge, then feather out beyond it. A radial
    // gradient fading from the centre would be hidden almost entirely by it.
    const edge=T.MathUtils.clamp((distance-.5)/.5,0,1);
    const falloff=1-edge*edge*(3-2*edge);
    const index=(y*size+x)*4;
    pixels.set([104,96,83,Math.round(falloff*90)],index);
  }
  const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);
  texture.colorSpace=T.SRGBColorSpace;
  texture.needsUpdate=true; texture.magFilter=T.LinearFilter; texture.minFilter=T.LinearFilter;
  const ground=new T.Mesh(new T.CircleGeometry(radius*1.14,64),
    new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
  ground.name='ground-contact-shadow';ground.userData.offlineSkip=true;
  ground.rotation.x=-Math.PI/2;ground.position.y=.001;scene.add(ground);

  scene.add(new T.HemisphereLight('#fffdf8','#c7c0b7',1.9));
  const key = new T.DirectionalLight('#fff9ee',3.1);
  key.name='studio-key';key.position.set(-3.5,6,5);
  key.target.position.set(0,1,0);scene.add(key.target);
  key.castShadow=true;key.shadow.mapSize.set(512,512);
  Object.assign(key.shadow.camera,{left:-3,right:3,top:3.5,bottom:-2.5,near:.1,far:18});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-.00015;key.shadow.normalBias=.025;
  key.shadow.radius=4;key.shadow.blurSamples=8;
  scene.add(key);
  const fill = new T.DirectionalLight('#ffffff',1.15);
  fill.position.set(4,4,-4);scene.add(fill);
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
    const mesh=new T.Mesh(geometry,material);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    geometries.forEach(item => item.dispose());
  }
  originalGeometries.forEach(geometry => geometry.dispose());
  return group;
}
