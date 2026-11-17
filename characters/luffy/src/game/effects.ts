import * as THREE from 'three';

/* ---------------------------------------------------------------- Shock rings & shells */
interface RingItem {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number; life: number; r0: number; r1: number; active: boolean; thick: number; sphere: boolean;
}

const ringMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uInner: { value: 0.8 } },
    vertexShader: `varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uInner; varying float vR;
      void main(){ float f=(vR-uInner)/(1.-uInner); if(f<0.) discard; f=clamp(f,0.,1.);
        float a = pow(f,2.2)*uAlpha; vec3 c = mix(uColor, vec3(1.), f*f*0.75); gl_FragColor = vec4(c*a*1.6, a); }`,
  });

const shellMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uInner: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.-abs(dot(normalize(vN), normalize(vV))); float a = pow(f,2.4)*uAlpha; gl_FragColor = vec4(mix(uColor, vec3(1.), f*f)*a*1.4, a); }`,
  });

export class Rings {
  group = new THREE.Group();
  items: RingItem[] = [];
  private ringGeo = new THREE.RingGeometry(0.5, 1, 72, 1);
  private sphGeo = new THREE.SphereGeometry(1, 40, 24);
  constructor(count = 20) {
    for (let i = 0; i < count; i++) {
      const sphere = i % 4 === 3;
      const mat = sphere ? shellMat() : ringMat();
      const mesh = new THREE.Mesh(sphere ? this.sphGeo : this.ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.items.push({ mesh, mat, t: 0, life: 1, r0: 0, r1: 1, active: false, thick: 0.4, sphere });
    }
  }
  spawn(pos: THREE.Vector3, axis: THREE.Vector3, r0: number, r1: number, life: number, color: THREE.ColorRepresentation, thick = 0.35, sphere = false) {
    const it = this.items.find((x) => !x.active && x.sphere === sphere);
    if (!it) return;
    it.active = true; it.t = 0; it.life = life; it.r0 = r0; it.r1 = r1; it.thick = thick;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    if (!sphere) it.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
    (it.mat.uniforms.uColor.value as THREE.Color).set(color);
  }
  update(dt: number) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) { it.active = false; it.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - u, 3);
      const r = it.r0 + (it.r1 - it.r0) * e;
      it.mesh.scale.setScalar(r);
      it.mat.uniforms.uAlpha.value = (1 - u) * (1 - u) * (it.sphere ? 0.7 : 1);
      it.mat.uniforms.uInner.value = Math.max(0.5, 1 - it.thick * (1 - u * 0.8) - 0.02);
      if (it.sphere) it.mesh.rotation.y += dt;
    }
  }
}

/* ---------------------------------------------------------------- Manga impact bursts */
interface BurstItem { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; life: number; size: number; active: boolean; }

export class Bursts {
  group = new THREE.Group();
  items: BurstItem[] = [];
  constructor(count = 12) {
    const geo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uT: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `
          uniform float uT, uSeed; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            vec2 p = (vUv-.5)*2.;
            float c = cos(uSeed*6.28+uT*0.7), s = sin(uSeed*6.28+uT*0.7);
            p = mat2(c,-s,s,c)*p;
            float r = length(p), a = atan(p.y,p.x);
            float sp = pow(0.5+0.5*cos(a*7.), 2.5);
            float sp2 = pow(abs(sin(a*13.+uSeed*20.)), 7.);
            float shape = 0.26 + 0.74*clamp(sp*0.85+sp2*0.55, 0., 1.);
            float g = 1.-pow(1.-min(1., uT*4.5), 3.);
            float rad = shape*(0.2+0.8*g);
            float inside = 1.-smoothstep(rad-0.012, rad, r);
            float fill = 1.-smoothstep(rad-0.085, rad-0.07, r);
            vec3 col = mix(vec3(0.02,0.0,0.0), uColor, fill);
            col = mix(col, vec3(1.), 1.-smoothstep(rad*0.45-0.015, rad*0.45, r));
            float alpha = inside*(1.-smoothstep(0.55,1.,uT));
            if(alpha<0.01) discard;
            gl_FragColor = vec4(col, alpha);
          }`,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 40;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.items.push({ mesh, mat, t: 0, life: 0.5, size: 1, active: false });
    }
  }
  spawn(pos: THREE.Vector3, size: number, color: THREE.ColorRepresentation, life = 0.5) {
    const it = this.items.find((x) => !x.active);
    if (!it) return;
    it.active = true; it.t = 0; it.life = life; it.size = size;
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    (it.mat.uniforms.uColor.value as THREE.Color).set(color);
    it.mat.uniforms.uSeed.value = Math.random();
  }
  update(dt: number, cam: THREE.Camera) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) { it.active = false; it.mesh.visible = false; continue; }
      it.mat.uniforms.uT.value = u;
      it.mesh.quaternion.copy(cam.quaternion);
      it.mesh.scale.setScalar(it.size * (1 + u * 0.35));
    }
  }
}

/* ---------------------------------------------------------------- Debris */
export class Debris {
  mesh: THREE.InstancedMesh;
  max: number;
  n = 0;
  pos: THREE.Vector3[] = [];
  vel: THREE.Vector3[] = [];
  rot: THREE.Euler[] = [];
  av: THREE.Vector3[] = [];
  sc: THREE.Vector3[] = [];
  life: number[] = [];
  maxLife: number[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  constructor(max = 600, gradient?: THREE.Texture) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.col.set(0xffffff));
    for (let i = 0; i < max; i++) {
      this.pos.push(new THREE.Vector3()); this.vel.push(new THREE.Vector3());
      this.rot.push(new THREE.Euler()); this.av.push(new THREE.Vector3()); this.sc.push(new THREE.Vector3());
      this.life.push(0); this.maxLife.push(1);
    }
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, size: number, color: THREE.ColorRepresentation, life = 3, stretch = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i].copy(p);
    this.vel[i].copy(v);
    this.rot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.av[i].set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
    this.sc[i].set(size, size * (0.5 + Math.random() * 0.5), size * stretch * (0.6 + Math.random() * 0.8));
    this.life[i] = 0; this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
    this.mesh.setColorAt(i, this.col.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number, deckR: number) {
    for (let i = 0; i < this.n; ) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.n--;
        const l = this.n;
        if (i !== l) {
          this.pos[i].copy(this.pos[l]); this.vel[i].copy(this.vel[l]); this.rot[i].copy(this.rot[l]);
          this.av[i].copy(this.av[l]); this.sc[i].copy(this.sc[l]); this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
          if (this.mesh.instanceColor) {
            const a = this.mesh.instanceColor.array as Float32Array;
            a[i * 3] = a[l * 3]; a[i * 3 + 1] = a[l * 3 + 1]; a[i * 3 + 2] = a[l * 3 + 2];
            this.mesh.instanceColor.needsUpdate = true;
          }
        }
        continue;
      }
      const v = this.vel[i], p = this.pos[i];
      v.y -= 16 * dt;
      p.addScaledVector(v, dt);
      const onDeck = p.x * p.x + p.z * p.z < deckR * deckR;
      if (onDeck && p.y < 0.05 && v.y < 0) {
        p.y = 0.05; v.y *= -0.38; v.x *= 0.7; v.z *= 0.7; this.av[i].multiplyScalar(0.6);
      }
      this.rot[i].x += this.av[i].x * dt; this.rot[i].y += this.av[i].y * dt; this.rot[i].z += this.av[i].z * dt;
      i++;
    }
    for (let i = 0; i < this.n; i++) {
      const u = this.life[i] / this.maxLife[i];
      const k = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      this.dummy.position.copy(this.pos[i]);
      this.dummy.rotation.copy(this.rot[i]);
      this.dummy.scale.copy(this.sc[i]).multiplyScalar(k);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- Ground cracks */
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(256, 256, 10, 256, 256, 256);
  grd.addColorStop(0, 'rgba(10,5,5,0.85)');
  grd.addColorStop(0.45, 'rgba(10,5,5,0.35)');
  grd.addColorStop(1, 'rgba(10,5,5,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(5,2,2,0.95)';
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    let x = 256, y = 256;
    let w = 5 + Math.random() * 3;
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let s = 0; s < steps; s++) {
      const l = 14 + Math.random() * 28;
      a += (Math.random() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * l, ny = y + Math.sin(a) * l;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      if (Math.random() < 0.25) {
        g.lineWidth = w * 0.5;
        g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(a + 0.9) * l, ny + Math.sin(a + 0.9) * l); g.stroke();
      }
      x = nx; y = ny; w *= 0.84;
      if (Math.hypot(x - 256, y - 256) > 250) break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Decals {
  group = new THREE.Group();
  items: { mesh: THREE.Mesh; t: number; active: boolean }[] = [];
  constructor(count = 6) {
    const tex = crackTexture();
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.position.y = 0.02;
      this.group.add(mesh);
      this.items.push({ mesh, t: 0, active: false });
    }
  }
  spawn(x: number, z: number, size: number) {
    const it = this.items.find((d) => !d.active) ?? this.items.reduce((a, b) => (a.t > b.t ? a : b));
    it.active = true; it.t = 0;
    it.mesh.visible = true;
    it.mesh.position.set(x, 0.03 + Math.random() * 0.01, z);
    it.mesh.scale.setScalar(size);
    it.mesh.rotation.y = Math.random() * 6.28;
    (it.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const u = it.t / 9;
      if (u >= 1) { it.active = false; it.mesh.visible = false; continue; }
      (it.mesh.material as THREE.MeshBasicMaterial).opacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
    }
  }
}
