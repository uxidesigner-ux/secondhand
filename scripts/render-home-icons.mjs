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
const keyLight=new THREE.Vector3(-3,6,5).normalize();
const fillLight=new THREE.Vector3(5,3,-4).normalize();
const reflectLight=new THREE.Vector3(-5,2,-3).normalize();
const round=value=>Math.round(value*100)/100;
const colorByte=value=>Math.max(0,Math.min(255,Math.round(value*255)));

function renderModel(kind,angle){
 const model=kind==='phone'?createPhone(THREE):createRay(THREE);
 const {scene,camera,turntable,initialAngle,resizeCamera}=createIconScene(THREE,model,kind==='phone'?'goods':'car');
 turntable.rotation.y=initialAngle+angle;resizeCamera(width/height);
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const project=point=>{const p=point.clone().project(camera);return [round((p.x+1)*width/2),round((1-p.y)*height/2)];};
 const shadowCenter=project(new THREE.Vector3(0,.015,0));
 const triangles=[];let meshCount=0;
 scene.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.visible)return;meshCount++;
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
   if(!material||material.visible===false)continue;
   const facing=faceNormal.dot(view);
   if(material.side===THREE.FrontSide&&facing<=0||material.side===THREE.BackSide&&facing>=0)continue;
   const n=normal?ids.reduce((sum,id)=>sum.add(new THREE.Vector3().fromBufferAttribute(normal,id)),new THREE.Vector3()).normalize().applyMatrix3(normals).normalize():faceNormal;
   if(facing<0)n.negate();
   const light=.45+.60*Math.max(0,n.dot(keyLight))+.28*Math.max(0,n.dot(fillLight))+.12*Math.max(0,n.dot(reflectLight))+.1*Math.max(0,n.y);
   const roughness=material.roughness??.55,metalness=material.metalness??0;
   const half=new THREE.Vector3().addVectors(keyLight,view).normalize();
   const spec=Math.pow(Math.max(0,n.dot(half)),8+45*(1-roughness))*(.12+.25*metalness);
   const color=(material.color||new THREE.Color(0xffffff)).clone();
   if(!material.isMeshBasicMaterial){
    color.multiplyScalar(light);color.r+=spec;color.g+=spec;color.b+=spec;
    if(material.emissive)color.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity??1));
   }
   color.convertLinearToSRGB();
   const vertexColors=geometry.getAttribute('color');
   const colors=material.vertexColors&&vertexColors?ids.map(id=>{
    const c=new THREE.Color().fromBufferAttribute(vertexColors,id).multiply(material.color||new THREE.Color(0xffffff)).convertLinearToSRGB();
    return [colorByte(c.r),colorByte(c.g),colorByte(c.b)];
   }):null;
   const projected=points.map(project);
   const area=(projected[1][0]-projected[0][0])*(projected[2][1]-projected[0][1])-(projected[1][1]-projected[0][1])*(projected[2][0]-projected[0][0]);
   if(Math.abs(area)<.025)continue;
   triangles.push({p:projected,z:points.map(p=>p.clone().applyMatrix4(camera.matrixWorldInverse).z),colors,color:[colorByte(color.r),colorByte(color.g),colorByte(color.b)],opacity:material.opacity??1,depth:center.clone().applyMatrix4(camera.matrixWorldInverse).z});
  }
 });
 triangles.sort((a,b)=>a.depth-b.depth);
 const visiblePoints=triangles.flatMap(triangle=>triangle.p);
 const bounds={left:Math.min(...visiblePoints.map(p=>p[0])),right:Math.max(...visiblePoints.map(p=>p[0])),top:Math.min(...visiblePoints.map(p=>p[1])),bottom:Math.max(...visiblePoints.map(p=>p[1]))};
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><radialGradient id="shadow"><stop stop-color="#617a9c" stop-opacity=".2"/><stop offset="1" stop-color="#617a9c" stop-opacity="0"/></radialGradient></defs><ellipse cx="${shadowCenter[0]}" cy="${shadowCenter[1]+8}" rx="172" ry="37" fill="url(#shadow)"/>${triangles.map(t=>`<path d="M${t.p.map(p=>p.join(' ')).join('L')}Z" fill="rgb(${t.color.join(',')})"${t.opacity<1?` fill-opacity="${t.opacity}"`:''}/>`).join('')}</svg>`;
 scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();for(const material of [mesh.material].flat())material.dispose();}});
 return {kind,angle,width,height,triangles,bounds,shadowCenter,meshCount,svg};
}

// A per-pixel Z buffer resolves intersecting/coplanar body and window surfaces;
// painter's triangle sorting alone creates false triangular artifacts.
function rasterize(shot){
 const w=width*scale,h=height*scale,pixels=new Uint8ClampedArray(w*h*4);
 const depths=new Float32Array(w*h);depths.fill(-Infinity);
 for(const t of shot.triangles){
  const [[ax,ay],[bx,by],[cx,cy]]=t.p.map(p=>p.map(value=>value*scale));
  const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx)));
  const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
  const denom=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
  if(Math.abs(denom)<1e-7)continue;
  const ac=(by-cy)/denom,bc=(cx-bx)/denom,cc=(cy-ay)/denom,dc=(ax-cx)/denom;
  for(let y=minY;y<=maxY;y++){
   let a=ac*(minX+.5-cx)+bc*(y+.5-cy),b=cc*(minX+.5-cx)+dc*(y+.5-cy);
   for(let x=minX;x<=maxX;x++,a+=ac,b+=cc){
    const c=1-a-b;if(a<-.0001||b<-.0001||c<-.0001)continue;
    const z=a*t.z[0]+b*t.z[1]+c*t.z[2],index=y*w+x;
    if(z<depths[index])continue;
    depths[index]=z;const offset=index*4;
    for(let channel=0;channel<3;channel++)pixels[offset+channel]=t.colors?a*t.colors[0][channel]+b*t.colors[1][channel]+c*t.colors[2][channel]:t.color[channel];
    pixels[offset+3]=t.opacity*255;
   }
  }
 }
 return pixels;
}

const shots=[];
for(const kind of ['phone','ray']){
 for(const [index,offset] of [0,Math.PI/2,Math.PI,Math.PI*1.5].entries()){
  const shot=renderModel(kind,offset);shot.name=`${kind}-${index}`;
  writeFileSync(path.join(work,`${shot.name}.svg`),shot.svg);
  console.log(JSON.stringify({name:shot.name,meshes:shot.meshCount,triangles:shot.triangles.length,bounds:shot.bounds}));
  if(shot.bounds.left<0||shot.bounds.right>width||shot.bounds.top<0||shot.bounds.bottom>height)throw new Error(`Clipped model: ${shot.name}`);
  writeFileSync(path.join(work,`${shot.name}.rgba`),rasterize(shot));
  delete shot.svg;delete shot.triangles;shots.push(shot);
 }
}
const python=String.raw`
import sys,json,pathlib
from PIL import Image,ImageDraw,ImageFilter
data=json.load(sys.stdin)
assets=pathlib.Path(data['assets']); work=pathlib.Path(data['work'])
scale=3
sheet=Image.new('RGB',(1040,460),(245,248,252))
for shot in data['shots']:
    size=(shot['width']*scale,shot['height']*scale)
    result=Image.new('RGBA',size,(0,0,0,0))
    shadow=Image.new('RGBA',size,(0,0,0,0)); draw=ImageDraw.Draw(shadow)
    cx,cy=shot['shadowCenter']; cy+=8
    draw.ellipse(((cx-148)*scale,(cy-23)*scale,(cx+148)*scale,(cy+23)*scale),fill=(65,91,126,35))
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
    ImageDraw.Draw(sheet).text((col*260+12,row*230+203),shot['name'],fill=(70,85,106))
sheet.save(work/'contact-sheet.png')
print(str(work/'contact-sheet.png'))
`;
process.stdout.write(execFileSync('python3',['-c',python],{input:JSON.stringify({assets,work,shots}),encoding:'utf8',maxBuffer:2*1024*1024}));
