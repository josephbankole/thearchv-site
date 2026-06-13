import * as THREE from 'three';
import { bgVertex, bgFragment } from './shaders';

// Atmosphere-only hero: a full-screen grain/light shader plane + sparse drifting gold dust.
// No spinning objects, no neon. Desktop-only; mobile and reduced-motion never call this.
export function initHero(mount: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const res = new THREE.Vector2(window.innerWidth, window.innerHeight);
  const mouse = new THREE.Vector2(0, 0);
  const mouseTarget = new THREE.Vector2(0, 0);

  // background plane
  const bgUniforms = {
    uTime: { value: 0 },
    uMouse: { value: mouse },
    uRes: { value: res },
  };
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: bgVertex, fragmentShader: bgFragment, uniforms: bgUniforms, depthTest: false }),
  );
  scene.add(bg);

  // gold dust — sparse instanced points drifting upward, concentrated in the upper third
  const COUNT = 90;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.sin(i * 12.9898) * 0.5) * 2.0; // deterministic spread, no Math.random
    positions[i * 3 + 1] = (Math.cos(i * 78.233) * 0.5) * 2.0;
    positions[i * 3 + 2] = 0;
    speeds[i] = 0.02 + (Math.abs(Math.sin(i * 3.17)) * 0.05);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xc9a14a,
    size: 0.006,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  const onMouse = (e: MouseEvent) => {
    mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener('mousemove', onMouse, { passive: true });

  const onResize = () => {
    res.set(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  let raf = 0;
  let running = true;
  const clock = new THREE.Clock();

  // pause when hero scrolled out of view to save battery
  const heroEl = document.querySelector('.hero');
  const io = new IntersectionObserver((entries) => {
    running = entries[0].isIntersecting;
    if (running && !raf) loop();
  }, { threshold: 0 });
  if (heroEl) io.observe(heroEl);

  function loop() {
    if (!running) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    bgUniforms.uTime.value = t;

    mouse.lerp(mouseTarget, 0.04);

    const pos = dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + speeds[i] * 0.01;
      if (y > 1.1) y = -1.1;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    dust.position.x = mouse.x * 0.05;
    dust.position.y = mouse.y * 0.03;

    renderer.render(scene, camera);
  }
  loop();

  // teardown
  return () => {
    running = false;
    cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener('mousemove', onMouse);
    window.removeEventListener('resize', onResize);
    dustGeo.dispose();
    dustMat.dispose();
    (bg.material as THREE.Material).dispose();
    bg.geometry.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
