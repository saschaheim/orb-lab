import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const canvas = document.getElementById("orb");
const status = document.getElementById("status");
const variant = document.documentElement.dataset.model || "engineering";
const models = {
  engineering: ["engineering-orb.glb", "engineering-orb-gaps.glb"],
  "engineering-gaps": ["engineering-orb-gaps.glb"],
  computing: ["computing.glb"],
  eye: ["eye.glb"],
  crypto: ["crypto-inner-sphere-points.glb", "crypto-outer-sphere-points.glb"],
  team: ["team-ball.glb"],
  "team-cube": ["team-cube.glb"]
};
const files = models[variant] || models.engineering;
const staticBase = new URL("./webgl/models/", import.meta.url);
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 200);
const root = new THREE.Group();
scene.add(root);
const ambient = new THREE.HemisphereLight(0xc6d9ff, 0x17111e, 2.25);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xe7f5ff, 4);
key.position.set(-2,4,5);scene.add(key);
const rim = new THREE.DirectionalLight(0x8a83ff, 3.1);
rim.position.set(4,-1,-3);scene.add(rim);
const loader = new GLTFLoader();
const draco = new DRACOLoader();
// Only the 3D rendering library/decoder are external; all GLBs are served by orb-lab.
draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
loader.setDRACOLoader(draco);
const mainMaterial = new THREE.MeshPhysicalMaterial({
  color:0x9dbee2, metalness:0.73, roughness:0.2,
  clearcoat:1, clearcoatRoughness:0.13, side:THREE.DoubleSide
});
const gapMaterial = new THREE.MeshPhysicalMaterial({
  color:0x293967, metalness:0.7, roughness:0.3, side:THREE.DoubleSide,
  transparent:true, opacity:0.73, depthWrite:false
});
const eyeMaterial = new THREE.MeshPhysicalMaterial({
  color:0xa1adff, metalness:0.38, roughness:0.19, clearcoat:1,
  clearcoatRoughness:0.1, side:THREE.DoubleSide
});
const dotMaterial = new THREE.PointsMaterial({
  color:0xaabfff, size:0.018, sizeAttenuation:true, transparent:true,
  opacity:0.86, depthWrite:false
});
let isReady=false, frameId=0, start=performance.now();
function normalize() {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if(bounds.isEmpty())throw new Error("Das Modell enthält keine darstellbare Geometrie");
  const center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  root.position.sub(center);
  const radius=Math.max(size.x,size.y,size.z);
  if(!Number.isFinite(radius) || radius<=0)throw new Error("Ungültige Modellabmessungen");
  root.scale.setScalar(2.15/radius);
  camera.position.set(0,0,4.6);
  camera.lookAt(0,0,0);
}
function adaptObject(object,file) {
  const isGaps=file.includes("gaps"), isEye=file.includes("eye");
  object.traverse(child=>{
    if(!child.isMesh && !child.isPoints && !child.isLineSegments && !child.isLine)return;
    if(child.isMesh) {
      if(child.geometry?.getAttribute("position")?.count===0)return;
      child.material=isGaps?gapMaterial:isEye?eyeMaterial:mainMaterial;
    } else if(child.isPoints) {
      child.material=dotMaterial;
    } else {
      child.material=new THREE.LineBasicMaterial({color:0xb9ccfa, transparent:true, opacity:0.84});
    }
  });
}
function fit() {
  const w=canvas.clientWidth || 320, h=canvas.clientHeight || 320;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.updateProjectionMatrix();
}
const observer=new ResizeObserver(fit);
observer.observe(canvas);
fit();
async function load() {
  try {
    for(const file of files) {
      const url=new URL(file,staticBase).href;
      const gltf=await loader.loadAsync(url);
      adaptObject(gltf.scene,file);
      root.add(gltf.scene);
    }
    normalize();
    isReady=true;
    status.textContent="";
    draw();
  } catch(err) {
    console.error("Orb Lab model load failed:",err);
    status.textContent="GLB konnte nicht geladen werden: "+(err?.message||String(err));
    status.classList.add("error");
  }
}
function draw(time=performance.now()){
  if(!isReady)return;
  frameId=requestAnimationFrame(draw);
  const t=(time-start)/1000;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.rotation.y=reduce?0.28:t*0.16+0.28;
  root.rotation.x=reduce?0.16:Math.sin(t*0.22)*0.12+0.16;
  root.rotation.z=reduce?0:Math.sin(t*0.12)*0.045;
  renderer.render(scene,camera);
}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){cancelAnimationFrame(frameId);frameId=0;}
  else if(isReady && !frameId)draw();
});
window.addEventListener("pagehide",()=>{cancelAnimationFrame(frameId);observer.disconnect();draco.dispose();renderer.dispose();},{once:true});
load();
