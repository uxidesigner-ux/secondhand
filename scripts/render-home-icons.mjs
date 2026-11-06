/** Offline geometry preview: no browser, GPU or remote service required.
 * Run `node scripts/render-home-icons.mjs`; CPU triangle rasterization with a
 * Z buffer produces RGBA data, then Python 3 + Pillow encodes transparent WebP
 * posters and a QA contact sheet.
 * This approximates studio lighting; the live renderer uses actual WebGL.
 */
import * as THREE from '../assets/vendor/three-0.170.0.min.js';
import {createPhone,createRay} from '../src/home-models.js';
import {createIconScene} from '../src/home-icon-scene.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const assets=path.join(root,'assets/home-icons');
const work=path.resolve(root,'../work/home-icons');
mkdirSync(assets,{recursive:true});mkdirSync(work,{recursive:true});
const width=560,height=416,scale=3;
const shadowSize=512;
const round=value=>Math.round(value*1000)/1000;
const colorByte=value=>Math.max(0,Math.min(255,Math.round(value*255)));

function renderModel(kind,angle){
 const model=kind==='phone'?createPhone(THREE):createRay(THREE);
 const {scene,camera,turntable,initialAngle,resizeCamera}=createIconScene(THREE,model,kind==='phone'?'goods':'car');
 turntable.rotation.y=initialAngle+angle;resizeCamera(width/height);
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const directional=[];scene.traverse(object=>{if(object.isDirectionalLight)directional.push(object);});
 const key=directional.find(light=>light.castShadow)||directional[0];
 const keyPosition=key.getWorldPosition(new THREE.Vector3());
 const keyTarget=key.target.getWorldPosition(new THREE.Vector3());
 const keyLight=keyPosition.clone().sub(keyTarget).normalize();
 const fillLight=(directional.find(light=>light!==key)?.position||new THREE.Vector3(4,4,-4)).clone().normalize();
 const lightCamera=new THREE.OrthographicCamera(-3.5,3.5,3.5,-3.5,.1,25);
 lightCamera.position.copy(keyPosition);lightCamera.lookAt(keyTarget);lightCamera.updateMatrixWorld(true);
 const project=(point,view,width,height)=>{const p=point.clone().project(view);return [(p.x+1)*width/2,(1-p.y)*height/2,point.clone().applyMatrix4(view.matrixWorldInverse).z];};
 const shadowCenter=project(new THREE.Vector3(0,.015,0),camera,width,height).slice(0,2);
 const triangles=[],shadowTriangles=[];let meshCount=0;
 scene.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.visible||mesh.userData.offlineSkip)return;meshCount++;
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  const index=geometry.getIndex(),count=index?index.count:position.count;
  const normals=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset);
   const points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld));
   const faceNormal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();
   const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(3);
   const view=new THREE.Vector3().subVectors(camera.position,center).normalize();
   let material=mesh.material;
   if(Array.isArray(material)){
    const group=geometry.groups.find(group=>i>=group.start&&i<group.start+group.count);
    material=material[group?.materialIndex||0];
   }
   if(!material||material.visible===false||material.isShaderMaterial)continue;
   const lightPoints=points.map(point=>project(point,lightCamera,shadowSize,shadowSize));
   if(mesh.castShadow&&material.opacity>.8)shadowTriangles.push({p:lightPoints.map(p=>p.slice(0,2)),z:lightPoints.map(p=>p[2])});
   const facing=faceNormal.dot(view);
   if(material.side===THREE.FrontSide&&facing<=0||material.side===THREE.BackSide&&facing>=0)continue;
   const vertexColors=geometry.getAttribute('color');
   const vertexLighting=ids.map(id=>{
    const n=normal?new THREE.Vector3().fromBufferAttribute(normal,id).applyMatrix3(normals).normalize():faceNormal.clone();
    if(facing<0)n.negate();
    const color=(material.color||new THREE.Color(0xffffff)).clone();
    if(material.vertexColors&&vertexColors)color.multiply(new THREE.Color().fromBufferAttribute(vertexColors,id));
    const ambient=material.isMeshBasicMaterial?1:.42+.14*Math.max(0,n.y)+.17*Math.max(0,n.dot(fillLight));
    const direct=material.isMeshBasicMaterial?0:.49*Math.max(0,n.dot(keyLight));
    const half=new THREE.Vector3().addVectors(keyLight,view).normalize();
    const spec=material.isMeshBasicMaterial?0:Math.pow(Math.max(0,n.dot(half)),5)*.025;
    const encode=value=>[colorByte(value.r),colorByte(value.g),colorByte(value.b)];
    const shade=strength=>{
     const c=color.clone().multiplyScalar(ambient+direct*strength);
     c.r+=spec*strength;c.g+=spec*.97*strength;c.b+=spec*.92*strength;
     if(material.emissive)c.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity??1));
     return encode(c.convertLinearToSRGB());
    };
    return {lit:shade(1),shadow:shade(.18)};
   });
   const projected=points.map(point=>project(point,camera,width,height));
   const area=(projected[1][0]-projected[0][0])*(projected[2][1]-projected[0][1])-(projected[1][1]-projected[0][1])*(projected[2][0]-projected[0][0]);
   if(Math.abs(area)<.025)continue;
   triangles.push({p:projected.map(p=>p.slice(0,2).map(round)),z:projected.map(p=>p[2]),
    colors:vertexLighting.map(c=>c.lit),shadowColors:vertexLighting.map(c=>c.shadow),
    lightPoints,receiveShadow:mesh.receiveShadow&&!material.isMeshBasicMaterial,
    opacity:material.opacity??1,depth:center.clone().applyMatrix4(camera.matrixWorldInverse).z});
  }
 });
 triangles.sort((a,b)=>a.depth-b.depth);
 const visiblePoints=triangles.flatMap(triangle=>triangle.p);
 const bounds={left:Math.min(...visiblePoints.map(p=>p[0])),right:Math.max(...visiblePoints.map(p=>p[0])),top:Math.min(...visiblePoints.map(p=>p[1])),bottom:Math.max(...visiblePoints.map(p=>p[1]))};
 scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const material of [mesh.material].flat())material.dispose();}});
 return {kind,angle,width,height,triangles,shadowTriangles,bounds,shadowCenter,meshCount};
}

// Shared triangle traversal, with interpolated vertex data and an orthographic
// depth buffer. Shadows are sampled in light space rather than painted as a
// dark triangle, so broad white panels still have soft contact shadows.
function eachPixel(triangle,w,h,pixelScale,visit){
 const [[ax,ay],[bx,by],[cx,cy]]=triangle.p.map(p=>p.map(value=>value*pixelScale));
 const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx)));
 const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
 const denom=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
 if(Math.abs(denom)<1e-7)return;
 const ac=(by-cy)/denom,bc=(cx-bx)/denom,cc=(cy-ay)/denom,dc=(ax-cx)/denom;
 for(let y=minY;y<=maxY;y++){
  let a=ac*(minX+.5-cx)+bc*(y+.5-cy),b=cc*(minX+.5-cx)+dc*(y+.5-cy);
  for(let x=minX;x<=maxX;x++,a+=ac,b+=cc){
   const c=1-a-b;if(a<-.0001||b<-.0001||c<-.0001)continue;
   visit(y*w+x,a,b,c);
  }
 }
}
function makeShadowMap(triangles){
 const depths=new Float32Array(shadowSize*shadowSize);depths.fill(-Infinity);
 for(const triangle of triangles)eachPixel(triangle,shadowSize,shadowSize,1,(index,a,b,c)=>{
  depths[index]=Math.max(depths[index],a*triangle.z[0]+b*triangle.z[1]+c*triangle.z[2]);
 });
 return depths;
}
const shadowOffsets=[[-2,-2],[0,-2],[2,-2],[-2,0],[0,0],[2,0],[-2,2],[0,2],[2,2]];
function rasterize(shot){
 const w=width*scale,h=height*scale,pixels=new Uint8ClampedArray(w*h*4);
 const depths=new Float32Array(w*h);depths.fill(-Infinity);
 const shadowDepth=makeShadowMap(shot.shadowTriangles);
 for(const t of shot.triangles){
  eachPixel(t,w,h,scale,(index,a,b,c)=>{
   const z=a*t.z[0]+b*t.z[1]+c*t.z[2];
   if(z<depths[index])return;
   depths[index]=z;const offset=index*4;
   let shadow=0;
   if(t.receiveShadow){
    const lx=a*t.lightPoints[0][0]+b*t.lightPoints[1][0]+c*t.lightPoints[2][0];
    const ly=a*t.lightPoints[0][1]+b*t.lightPoints[1][1]+c*t.lightPoints[2][1];
    const lz=a*t.lightPoints[0][2]+b*t.lightPoints[1][2]+c*t.lightPoints[2][2];
    // A modest world-space bias avoids self-shadow speckling on smooth clay.
    for(const [dx,dy] of shadowOffsets){
     const x=Math.floor(lx+dx),y=Math.floor(ly+dy);
     if(x>=0&&x<shadowSize&&y>=0&&y<shadowSize&&shadowDepth[y*shadowSize+x]>lz+.026)shadow++;
    }
    shadow/=shadowOffsets.length;
   }
   for(let channel=0;channel<3;channel++){
    const lit=a*t.colors[0][channel]+b*t.colors[1][channel]+c*t.colors[2][channel];
    const dark=a*t.shadowColors[0][channel]+b*t.shadowColors[1][channel]+c*t.shadowColors[2][channel];
    pixels[offset+channel]=lit+(dark-lit)*shadow;
   }
   pixels[offset+3]=t.opacity*255;
  });
 }
 return pixels;
}

const shots=[];
for(const kind of ['phone','ray']){
 for(const [index,offset] of [0,Math.PI/2,Math.PI,Math.PI*1.5].entries()){
  const shot=renderModel(kind,offset);shot.name=`${kind}-${index}`;
  console.log(JSON.stringify({name:shot.name,meshes:shot.meshCount,triangles:shot.triangles.length,bounds:shot.bounds}));
  if(shot.bounds.left<0||shot.bounds.right>width||shot.bounds.top<0||shot.bounds.bottom>height)throw new Error(`Clipped model: ${shot.name}`);
  writeFileSync(path.join(work,`${shot.name}.rgba`),rasterize(shot));
  delete shot.triangles;delete shot.shadowTriangles;shots.push(shot);
 }
}
const python=String.raw`
import sys,json,pathlib
from PIL import Image,ImageDraw,ImageFilter
data=json.load(sys.stdin)
assets=pathlib.Path(data['assets']); work=pathlib.Path(data['work'])
scale=3
sheet=Image.new('RGB',(1040,460),(246,245,242))
for shot in data['shots']:
    size=(shot['width']*scale,shot['height']*scale)
    result=Image.new('RGBA',size,(0,0,0,0))
    shadow=Image.new('RGBA',size,(0,0,0,0)); draw=ImageDraw.Draw(shadow)
    cx,cy=shot['shadowCenter']; cy+=8
    rx=112 if shot['kind']=='phone' else 192
    draw.ellipse(((cx-rx)*scale,(cy-20)*scale,(cx+rx)*scale,(cy+20)*scale),fill=(99,91,79,37))
    result.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10*scale)))
    rendered=Image.frombytes('RGBA',size,(work/(shot['name']+'.rgba')).read_bytes())
    result.alpha_composite(rendered)
    result=result.resize((shot['width'],shot['height']),Image.Resampling.LANCZOS)
    result.save(work/(shot['name']+'.png'))
    if shot['name'].endswith('-0'):
        result.save(assets/(shot['kind']+'.webp'),format='WEBP',quality=90,method=6)
    row=0 if shot['kind']=='phone' else 1; col=int(shot['name'].split('-')[1])
    thumb=result.resize((260,200),Image.Resampling.LANCZOS)
    sheet.paste(thumb,(col*260,row*230),thumb)
    ImageDraw.Draw(sheet).text((col*260+12,row*230+203),shot['name'],fill=(101,98,92))
sheet.save(work/'contact-sheet.png')
print(str(work/'contact-sheet.png'))
`;
process.stdout.write(execFileSync('python3',['-c',python],{input:JSON.stringify({assets,work,shots}),encoding:'utf8',maxBuffer:2*1024*1024}));
