// Original clay maquettes: neutral matte surfaces, rounded tooling and quiet detail.
// Y is up and the floor is y=0. Phone front is +Z; Ray front is +X.
function roundedShape(T, width, height, radius) {
  const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
  const shape = new T.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

// ExtrudeGeometry duplicates vertices along every bevel segment. Averaging the
// normals at coincident vertices gives the rounded tool a continuous highlight.
function smoothBevels(geometry) {
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const groups = new Map(), keys = [];
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].map(n => Math.round(n * 100000)).join(',');
    keys.push(key);
    const sum = groups.get(key) || [0, 0, 0];
    sum[0] += normals.getX(i); sum[1] += normals.getY(i); sum[2] += normals.getZ(i);
    groups.set(key, sum);
  }
  for (let i = 0; i < positions.count; i++) {
    const n = groups.get(keys[i]), length = Math.hypot(...n) || 1;
    normals.setXYZ(i, n[0] / length, n[1] / length, n[2] / length);
  }
  normals.needsUpdate = true;
  return geometry;
}

function modelKit(T, group) {
  const geometryCache = new Map();
  const material = (color, options = {}) => new T.MeshStandardMaterial({color, roughness: .82, metalness: 0, ...options});
  const add = (geometry, surface, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, surface);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  const box = (w, h, d, r, surface, x = 0, y = 0, z = 0) => {
    const key = `${w},${h},${d},${r}`;
    if (!geometryCache.has(key)) {
      const bevel = Math.min(.065, d * .43, r * .55);
      const geometry = new T.ExtrudeGeometry(roundedShape(T, w - 2 * bevel, h - 2 * bevel, Math.max(.002, r - bevel)), {
        depth: d - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
        bevelThickness: bevel, bevelSegments: r > .12 ? 5 : 3, steps: 1, curveSegments: r > .12 ? 9 : 5,
      });
      geometry.translate(0, 0, -d / 2 + bevel);
      geometryCache.set(key, smoothBevels(geometry));
    }
    return add(geometryCache.get(key), surface, x, y, z);
  };
  // Lathed rounded pucks replace the old sharp cylinder stacks (camera/wheels).
  const disk = (radius, depth, surface, x, y, z, edge = .025) => {
    const r = Math.min(edge, depth * .45, radius * .3);
    const key = `puck:${radius},${depth},${r}`;
    if (!geometryCache.has(key)) {
      const segments = radius > .3 ? 5 : 3;
      const points = [new T.Vector2(0, -depth / 2), new T.Vector2(radius-r, -depth/2)];
      for(let i=1;i<=segments;i++) {const a=-Math.PI/2+i*Math.PI/(2*segments);points.push(new T.Vector2(radius-r+Math.cos(a)*r,-depth/2+r+Math.sin(a)*r));}
      points.push(new T.Vector2(radius,depth/2-r));
      for(let i=1;i<=segments;i++) {const a=i*Math.PI/(2*segments);points.push(new T.Vector2(radius-r+Math.cos(a)*r,depth/2-r+Math.sin(a)*r));}
      points.push(new T.Vector2(0,depth/2));
      geometryCache.set(key, new T.LatheGeometry(points, radius > .3 ? 40 : 28));
    }
    const mesh = add(geometryCache.get(key), surface, x, y, z);
    mesh.rotation.x = Math.PI / 2; return mesh;
  };
  const panel = (points, surface, z, radius = .055) => {
    const shape = new T.Shape();
    const corners = points.map(([x,y],i) => {
      const previous=points[(i+points.length-1)%points.length], next=points[(i+1)%points.length];
      const before=Math.hypot(previous[0]-x,previous[1]-y),after=Math.hypot(next[0]-x,next[1]-y);
      const distance=Math.min(radius,before*.3,after*.3);
      return {x,y,before:[x+(previous[0]-x)*distance/before,y+(previous[1]-y)*distance/before],after:[x+(next[0]-x)*distance/after,y+(next[1]-y)*distance/after]};
    });
    shape.moveTo(...corners[0].before);
    for(const p of corners){shape.lineTo(...p.before);shape.quadraticCurveTo(p.x,p.y,...p.after);}
    shape.closePath();
    return add(new T.ShapeGeometry(shape,8),surface,0,0,z);
  };
  const flat = (w,h,r,surface,x,y,z) => add(new T.ShapeGeometry(roundedShape(T,w,h,r),10),surface,x,y,z);
  return {material, add, box, disk, panel, flat};
}

export function createPhone(T) {
  const group = new T.Group(); group.name = 'White clay iPhone';
  const {material, box, disk, flat} = modelKit(T, group);
  const clay = material('#f4f1eb');
  const inset = material('#e3dfd7', {roughness:.88});
  const edge = material('#eeebe4');
  const graphite = material('#aaa69e', {roughness:.9});
  const lens = material('#bcb8b0', {roughness:.78});
  const light = material('#faf8f3', {roughness:.76});

  // A single softly tooled slab, with just a shallow front/rear inset.
  box(1.42,2.82,.255,.255,clay,0,1.41,0);
  box(1.32,2.72,.026,.22,light,0,1.41,-.126);
  box(1.30,2.70,.022,.22,inset,0,1.41,.126);
  flat(1.20,2.59,.185,edge,0,1.41,.142);
  box(.34,.085,.014,.042,graphite,0,2.60,.151);
  box(.34,.024,.008,.012,light,0,.194,.148);

  // White camera rims sit above neutral lens wells, so recess depth does the
  // work previously done by black circles and artificial blue glints.
  box(.96,1.02,.095,.24,clay,-.145,2.205,-.174);
  for(const [x,y] of [[-.355,2.465],[.065,2.21],[-.355,1.975]]) {
    disk(.182,.068,edge,x,y,-.239,.025);
    disk(.143,.028,graphite,x,y,-.272,.012);
    disk(.113,.018,lens,x,y,-.287,.008);
    const ring = new T.Mesh(new T.TorusGeometry(.151,.020,10,40),light);
    ring.position.set(x,y,-.280);ring.castShadow=true;ring.receiveShadow=true;group.add(ring);
  }
  disk(.057,.019,light,.12,2.50,-.23,.008);
  disk(.034,.014,inset,.12,1.95,-.231,.006);

  box(.034,.29,.10,.017,edge,.715,1.79,0);
  box(.034,.20,.10,.017,edge,-.715,1.90,0);
  box(.034,.20,.10,.017,edge,-.715,1.61,0);
  box(.034,.085,.085,.016,edge,-.715,2.25,0);
  group.userData.turntable={height:2.82,radius:.79,front:'+Z'};
  return group;
}

export function createRay(T) {
  const group = new T.Group(); group.name = 'White clay Kia Ray';
  const {material, add, box, disk, panel, flat} = modelKit(T, group);
  const clay = material('#f4f1eb');
  const softEdge = material('#eeebe5');
  const glass = material('#b9b5ad', {roughness:.88,side:T.DoubleSide});
  const tyre = material('#c1bdb5', {roughness:.94});
  const recess = material('#a8a49d', {roughness:.9});
  const seam = material('#d8d3ca', {roughness:.9});
  const light = material('#fbf9f4', {roughness:.78});

  // One continuous body/roof surface. A deeper, smoothly normalled bevel gives
  // a real moulded edge rather than separate roof plates and painted highlights.
  const profile=new T.Shape();
  profile.moveTo(-1.54,.39); profile.lineTo(-1.54,1.55);
  profile.quadraticCurveTo(-1.54,1.78,-1.33,1.82);
  profile.lineTo(.55,1.82);
  profile.quadraticCurveTo(.75,1.82,.83,1.65);
  profile.lineTo(1.045,1.17); profile.lineTo(1.39,1.105);
  profile.quadraticCurveTo(1.55,1.075,1.55,.92);
  profile.lineTo(1.55,.39);profile.lineTo(1.43,.39);
  profile.absarc(1.015,.39,.415,0,Math.PI,false);
  profile.lineTo(-.60,.39); profile.absarc(-1.015,.39,.415,0,Math.PI,false);
  profile.lineTo(-1.54,.39);
  const body=new T.ExtrudeGeometry(profile,{depth:1.30,bevelEnabled:true,bevelSize:.075,bevelThickness:.075,bevelSegments:6,steps:1,curveSegments:12});
  body.translate(0,0,-.65); add(smoothBevels(body),clay);
  box(2.78,.11,1.29,.055,softEdge,-.02,.405,0);

  for(const side of [-1,1]) {
    const z=side*.729;
    panel([[-1.37,1.185],[-1.37,1.56],[-1.26,1.68],[-.95,1.68],[-.95,1.185]],glass,z);
    panel([[-.87,1.185],[-.87,1.68],[-.23,1.68],[-.23,1.185]],glass,z);
    panel([[-.13,1.185],[-.13,1.68],[.53,1.68],[.64,1.60],[.82,1.185]],glass,z);
    // Quiet indent lines and broad ceramic handles remain legible at icon size.
    box(.013,.58,.010,.006,seam,-.18,.84,z);
    box(.013,.48,.010,.006,seam,-.92,.89,z);
    box(.18,.050,.040,.024,light,-.35,1.066,z+side*.018);
    box(.18,.050,.040,.024,light,.07,1.066,z+side*.018);
    box(.11,.060,.11,.027,softEdge,.81,1.26,side*.75);
    box(.23,.17,.16,.078,clay,.83,1.30,side*.82);
    box(.16,.10,.014,.045,glass,.83,1.30,side*.902);
  }
  // Follow the outside of the new .075 bevel; the lower edge clears the bonnet.
  const windshield=flat(1.16,.49,.075,glass,1.01,1.49,0);
  windshield.rotation.y=Math.PI/2;windshield.rotateX(-.42);
  const rearWindow=flat(1.14,.47,.065,glass,-1.618,1.43,0);
  rearWindow.rotation.y=-Math.PI/2;

  const endDetail=(w,h,d,r,surface,x,y,z=0)=>{
    const mesh=box(w,h,d,r,surface,x,y,z);mesh.rotation.y=Math.PI/2;return mesh;
  };
  // Facelift Ray's upright lamps and compact grille are kept as relief shapes.
  endDetail(.76,.10,.026,.046,seam,1.605,.89);
  endDetail(.82,.17,.024,.070,recess,1.624,.60);
  endDetail(.40,.11,.030,.025,softEdge,1.644,.60);
  for(const side of [-1,1]) {
    endDetail(.19,.32,.036,.082,seam,1.586,.95,side*.52);
    endDetail(.12,.25,.041,.058,light,1.609,.95,side*.52);
    endDetail(.19,.04,.041,.020,light,1.608,1.065,side*.48);
    endDetail(.12,.39,.032,.055,softEdge,-1.617,1.025,side*.56);
    endDetail(.075,.28,.035,.035,seam,-1.637,1.04,side*.56);
  }
  endDetail(.43,.13,.027,.030,softEdge,-1.626,.79);
  endDetail(.21,.027,.025,.013,seam,-1.625,1.13);
  endDetail(.80,.052,.032,.025,seam,-1.625,.51);

  // Rounded sidewalls and simple relief hubs feel moulded in clay, not chrome.
  for(const x of [-1.015,1.015])for(const side of [-1,1]) {
    const z=side*.68;
    disk(.365,.245,tyre,x,.365,z,.058);
    disk(.249,.035,softEdge,x,.365,z+side*.124,.016);
    disk(.182,.020,seam,x,.365,z+side*.143,.009);
    for(let spoke=0;spoke<5;spoke++) {
      const angle=spoke*Math.PI*2/5, radius=.107;
      const mesh=box(.066,.17,.026,.030,clay,x+Math.sin(angle)*radius,.365+Math.cos(angle)*radius,z+side*.157);
      mesh.rotation.z=-angle;
    }
    disk(.065,.036,light,x,.365,z+side*.167,.016);
  }
  group.userData.turntable={height:1.90,radius:1.85,front:'+X'};
  return group;
}
