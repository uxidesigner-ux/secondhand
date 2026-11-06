// Small, self-contained product models. No remote textures or loaders are used.
// Y is up; each model rests on y=0. The Ray's nose points along +X.
function roundedShape(T, width, height, radius) {
  const x = -width / 2, y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new T.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function modelKit(T, group) {
  const geometryCache = new Map();
  const material = (color, options = {}) => new T.MeshStandardMaterial({color, roughness: .32, metalness: .05, ...options});
  const add = (geometry, surface, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (w, h, d, r, surface, x = 0, y = 0, z = 0) => {
    const key = `${w},${h},${d},${r}`;
    if (!geometryCache.has(key)) {
      const bevel = Math.min(.025, d * .24, r * .4);
      const geometry = new T.ExtrudeGeometry(roundedShape(T, w - 2 * bevel, h - 2 * bevel, Math.max(.001, r - bevel)), {
        depth: d - 2 * bevel, bevelEnabled: true, bevelSize: bevel,
        bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 5,
      });
      geometry.translate(0, 0, -d / 2 + bevel);
      geometryCache.set(key, geometry);
    }
    return add(geometryCache.get(key), surface, x, y, z);
  };
  const disk = (radius, depth, surface, x, y, z, segments = 24) => {
    const key = `disk:${radius},${depth},${segments}`;
    if (!geometryCache.has(key)) geometryCache.set(key, new T.CylinderGeometry(radius, radius, depth, segments));
    const mesh = add(geometryCache.get(key), surface, x, y, z);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const panel = (points, surface, z) => {
    const shape = new T.Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const mesh = add(new T.ShapeGeometry(shape), surface, 0, 0, z);
    return mesh;
  };
  return {material, add, box, disk, panel};
}

export function createPhone(T) {
  const group = new T.Group();
  group.name = 'iPhone turntable model';
  const {material, add, box, disk} = modelKit(T, group);
  const titanium = material('#a5bbd2', {metalness: .65, roughness: .25});
  const back = material('#bfd5ea', {metalness: .18, roughness: .28});
  const black = material('#0c1420', {roughness: .2});
  const bezel = material('#121a25', {metalness: .35, roughness: .19});
  const silver = material('#dae5f0', {metalness: .7, roughness: .18});
  const lens = material('#132e48', {metalness: .55, roughness: .12});
  const glint = material('#8cc8f4', {metalness: .35, roughness: .16});
  const flash = material('#fff7df', {roughness: .28});

  box(1.42, 2.82, .23, .22, titanium, 0, 1.41, 0);
  box(1.34, 2.74, .032, .20, back, 0, 1.41, -.116);
  box(1.34, 2.74, .024, .205, bezel, 0, 1.41, .12);

  // A vertex-colour wallpaper keeps the front recognizable without images.
  const display = new T.ShapeGeometry(roundedShape(T, 1.255, 2.65, .17), 12);
  const vertices = display.attributes.position;
  const colours = [];
  const bottom = new T.Color('#3368df'), top = new T.Color('#adf0ff');
  for (let i = 0; i < vertices.count; i++) {
    const t = T.MathUtils.clamp((vertices.getY(i) + 1.325) / 2.65, 0, 1);
    const color = bottom.clone().lerp(top, t * t);
    colours.push(color.r, color.g, color.b);
  }
  display.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
  add(display, new T.MeshBasicMaterial({vertexColors: true}), 0, 1.41, .135);
  box(.37, .10, .014, .05, black, 0, 2.61, .145);
  disk(.023, .014, lens, .115, 2.61, .155, 12);
  box(.38, .025, .008, .012, silver, 0, .185, .143);

  // Raised rear camera island with three separate optical stacks.
  box(.97, 1.03, .082, .22, titanium, -.145, 2.205, -.169);
  box(.90, .96, .014, .19, back, -.145, 2.205, -.215);
  for (const [x, y] of [[-.355, 2.47], [.065, 2.215], [-.355, 1.98]]) {
    disk(.179, .055, silver, x, y, -.24);
    disk(.147, .066, black, x, y, -.262);
    disk(.113, .009, lens, x, y, -.30);
    disk(.057, .009, black, x, y, -.307, 20);
    disk(.028, .01, glint, x - .032, y + .037, -.315, 12);
  }
  disk(.063, .022, flash, .12, 2.50, -.242, 20);
  disk(.041, .018, black, .12, 1.95, -.24, 16);

  // Side buttons and the bottom connector remain visible during the full turn.
  box(.038, .31, .095, .018, titanium, .719, 1.79, 0);
  box(.038, .21, .095, .018, titanium, -.719, 1.90, 0);
  box(.038, .21, .095, .018, titanium, -.719, 1.61, 0);
  box(.038, .09, .08, .016, titanium, -.719, 2.25, 0);
  const port = box(.22, .066, .012, .028, black, 0, .003, 0);
  port.rotation.x = Math.PI / 2;
  for (const x of [-.44, -.35, -.26, .26, .35, .44]) {
    const hole = disk(.018, .008, black, x, .002, 0, 10);
    hole.rotation.x = 0;
  }
  group.userData.turntable = {height: 2.82, radius: .79, front: '+Z'};
  return group;
}

export function createRay(T) {
  const group = new T.Group();
  group.name = 'Kia Ray turntable model';
  const {material, add, box, disk, panel} = modelKit(T, group);
  const paint = material('#90c6e8', {metalness: .12, roughness: .27});
  const roof = material('#b4ddf3', {metalness: .10, roughness: .28});
  const glass = material('#223e53', {metalness: .30, roughness: .17, side: T.DoubleSide});
  const glassHighlight = material('#7ba3bc', {metalness: .25, roughness: .23, side: T.DoubleSide});
  const dark = material('#1d2932', {roughness: .46});
  const rubber = material('#252c35', {roughness: .8});
  const seam = material('#608aa3', {roughness: .5});
  const chrome = material('#d8e4ee', {metalness: .65, roughness: .23});
  const rimDark = material('#526677', {metalness: .4, roughness: .3});
  const headlamp = material('#edfaff', {roughness: .18, emissive: '#bedfff', emissiveIntensity: .13});
  const tail = material('#ff6462', {roughness: .24, emissive: '#be2929', emissiveIntensity: .08});

  // The tall roof, upright tailgate, short bonnet, and long wheelbase are Ray's
  // defining silhouette. Actual wheel-arch cutouts avoid a toy block body.
  const profile = new T.Shape();
  profile.moveTo(-1.57, .38);
  profile.lineTo(-1.57, 1.58);
  profile.quadraticCurveTo(-1.57, 1.80, -1.37, 1.83);
  profile.lineTo(.58, 1.83);
  profile.quadraticCurveTo(.76, 1.83, .83, 1.68);
  profile.lineTo(1.04, 1.15);
  profile.lineTo(1.43, 1.10);
  profile.quadraticCurveTo(1.58, 1.07, 1.58, .91);
  profile.lineTo(1.58, .38);
  profile.lineTo(1.43, .38);
  profile.absarc(1.025, .38, .405, 0, Math.PI, false);
  profile.lineTo(-.62, .38);
  profile.absarc(-1.025, .38, .405, 0, Math.PI, false);
  profile.lineTo(-1.57, .38);
  const body = new T.ExtrudeGeometry(profile, {depth: 1.34, bevelEnabled: true, bevelSize: .045, bevelThickness: .045, bevelSegments: 3, steps: 1, curveSegments: 8});
  body.translate(0, 0, -.67);
  add(body, paint);

  // The roof is slightly lighter, like a broad softbox reflection.
  const roofCap = box(2.08, 1.30, .055, .16, roof, -.36, 1.88, 0);
  roofCap.rotation.x = Math.PI / 2;
  box(2.85, .13, 1.30, .06, dark, -.02, .405, 0);
  box(.10, .06, .22, .025, dark, -.98, 1.93, 0);

  // Side glass has individual panes and thick pillars, not a single band.
  for (const side of [-1, 1]) {
    const z = side * .717;
    panel([[-1.43,1.18],[-1.43,1.58],[-1.31,1.72],[-.94,1.72],[-.94,1.18]], glass, z);
    panel([[-.87,1.18],[-.87,1.72],[-.22,1.72],[-.22,1.18]], glass, z);
    panel([[-.13,1.18],[-.13,1.72],[.57,1.72],[.68,1.65],[.87,1.18]], glass, z);
    panel([[-1.35,1.60],[-1.26,1.68],[-.99,1.68],[-.99,1.63]], glassHighlight, z + side * .004);
    panel([[-.80,1.64],[-.80,1.68],[-.27,1.68],[-.27,1.64]], glassHighlight, z + side * .004);
    panel([[-.07,1.64],[-.07,1.68],[.55,1.68],[.59,1.64]], glassHighlight, z + side * .004);
    // Window sill, the sliding-door rail, and inset door handles.
    box(2.40, .035, .022, .01, dark, -.27, 1.145, z);
    box(.018, .65, .013, .006, seam, -.17, .78, z);
    box(.018, .54, .013, .006, seam, -.91, .85, z);
    box(.63, .018, .014, .006, seam, -.57, .98, z);
    box(.20, .055, .045, .026, chrome, -.34, 1.065, z + side * .02);
    box(.20, .055, .045, .026, chrome, .08, 1.065, z + side * .02);
    // Mirrors stay attached to the front-door corner during rotation.
    box(.12, .065, .12, .025, dark, .81, 1.26, side * .755);
    box(.24, .17, .15, .07, paint, .83, 1.30, side * .84);
    box(.18, .105, .016, .045, glass, .82, 1.30, side * .922);
  }

  const quad = (points, surface) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return add(geometry, surface);
  };
  quad([[1.077,1.19,-.60],[1.077,1.19,.60],[.862,1.71,.60],[.862,1.71,-.60]], glass);
  quad([[.890,1.65,-.55],[.890,1.65,.55],[.873,1.69,.55],[.873,1.69,-.55]], glassHighlight);
  quad([[-1.616,1.20,-.59],[-1.616,1.68,-.59],[-1.616,1.68,.59],[-1.616,1.20,.59]], glass);

  // XY rounded details are turned onto the front and rear YZ faces.
  const endDetail = (w, h, d, r, surface, x, y, z = 0) => {
    const mesh = box(w, h, d, r, surface, x, y, z);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  };
  endDetail(.79, .12, .035, .045, dark, 1.60, .88);
  endDetail(.89, .20, .03, .06, dark, 1.625, .58);
  endDetail(.41, .115, .045, .02, chrome, 1.65, .60);
  for (const side of [-1, 1]) {
    // Upright DRL / headlamp clusters are characteristic of the facelift Ray.
    endDetail(.205, .34, .045, .075, dark, 1.585, .94, side * .53);
    endDetail(.13, .265, .05, .05, headlamp, 1.616, .95, side * .53);
    endDetail(.22, .045, .05, .02, headlamp, 1.615, 1.07, side * .48);
    endDetail(.13, .43, .04, .045, tail, -1.615, 1.04, side * .57);
    endDetail(.12, .075, .045, .02, headlamp, -1.64, .98, side * .57);
  }
  endDetail(.47, .14, .035, .025, chrome, -1.63, .79);
  endDetail(.23, .035, .035, .016, dark, -1.63, 1.14);
  endDetail(.88, .07, .04, .025, dark, -1.63, .50);
  endDetail(.25, .025, .035, .012, chrome, 1.625, 1.065);

  // Four rubber tyres, inset rims, five spokes and a polished central cap.
  for (const x of [-1.025, 1.025]) for (const side of [-1, 1]) {
    const z = side * .68;
    disk(.365, .245, rubber, x, .365, z, 32);
    disk(.264, .25, rimDark, x, .365, z, 28);
    disk(.233, .014, chrome, x, .365, z + side * .131, 28);
    disk(.178, .018, rimDark, x, .365, z + side * .142, 24);
    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = spoke * Math.PI * 2 / 5;
      const radius = .115;
      const mesh = box(.055, .18, .025, .018, chrome,
        x + Math.sin(angle) * radius, .365 + Math.cos(angle) * radius, z + side * .156);
      mesh.rotation.z = -angle;
    }
    disk(.067, .03, chrome, x, .365, z + side * .17, 18);
  }
  group.userData.turntable = {height: 1.96, radius: 1.85, front: '+X'};
  return group;
}
