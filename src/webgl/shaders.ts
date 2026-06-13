// Background plane: navy gradient + animated film grain + a soft cream light-leak,
// parallax-shifted by the pointer. Reads as a film negative held to light, not a tech demo.
export const bgVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

export const bgFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uRes;

  // hash noise
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uRes.x / uRes.y;

    // base vertical gradient: deep navy at the floor, navy toward the top
    vec3 navyDeep = vec3(0.027, 0.110, 0.169);
    vec3 navy     = vec3(0.047, 0.165, 0.243);
    vec3 col = mix(navyDeep, navy, smoothstep(0.0, 1.0, uv.y));

    // soft cream light-leak near upper area, drifting with the pointer (parallax)
    vec2 c = vec2(0.5 + uMouse.x * 0.06, 0.78 + uMouse.y * 0.04);
    vec2 d = (uv - c); d.x *= aspect;
    float glow = smoothstep(0.55, 0.0, length(d));
    col += vec3(0.95, 0.92, 0.83) * glow * 0.06;

    // animated film grain
    float g = hash(uv * uRes.xy * 0.5 + uTime * 60.0);
    col += (g - 0.5) * 0.045;

    // vignette
    float vig = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(aspect, 1.0)));
    col *= mix(0.82, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;
