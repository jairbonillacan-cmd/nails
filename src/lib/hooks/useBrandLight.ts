'use client';

import { useEffect, type RefObject } from 'react';

type Rgb = readonly [number, number, number];

interface LightPalette {
  base: Rgb;
  glow: Rgb;
  core: Rgb;
  spark: Rgb;
}

const LIGHT_PALETTES: Record<'laikona' | 'monochrome', LightPalette> = {
  laikona: {
    base: [0.043, 0.024, 0.027],
    glow: [0.49, 0.078, 0.125],
    core: [0.91, 0.565, 0.61],
    spark: [0.98, 0.92, 0.88],
  },
  monochrome: {
    base: [0.03, 0.03, 0.03],
    glow: [0.3, 0.3, 0.3],
    core: [0.86, 0.86, 0.86],
    spark: [1, 1, 1],
  },
};

const ACTIVATE_PROGRAM = 'useProgram' satisfies keyof WebGLRenderingContext;

const VERTEX_SHADER = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAGMENT_SHADER = `precision mediump float;
uniform vec2 r;uniform float t;uniform float k;
uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.02;a*=.5;}return v;}
void main(){
vec2 uv=gl_FragCoord.xy/r;
vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
float tt=t*.12;
vec2 q=vec2(fbm(p*1.3+tt),fbm(p*1.3-tt+3.1));
float y=.32*sin(p.x*1.5+tt*2.2+q.x*2.)+.22*(q.y-.5);
float d=p.y-y;
float glow=exp(-d*d*16.);
float core=exp(-d*d*150.);
float y2=-.48+.22*sin(p.x*2.2-tt*1.7+q.y*3.);
float d2=p.y-y2;
float second=exp(-d2*d2*34.)*.5;
float ramp=k*smoothstep(0.,1.1,t);
vec3 col=c0;
col=mix(col,c1,clamp((glow+second)*ramp,0.,1.));
col=mix(col,c2,clamp(core*.85*ramp,0.,1.));
col+=c3*core*.3*ramp;
col*=1.-.4*length(uv-.5);
col+=(h(gl_FragCoord.xy+fract(t))-.5)*.045;
gl_FragColor=vec4(col,1.);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function readPalette(): LightPalette {
  return document.documentElement.dataset.palette === 'monochrome'
    ? LIGHT_PALETTES.monochrome
    : LIGHT_PALETTES.laikona;
}

interface BrandLightOptions {
  intensity: number;
  speed: number;
}

export function useBrandLight(
  ref: RefObject<HTMLCanvasElement | null>,
  { intensity, speed }: BrandLightOptions,
): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl[ACTIVATE_PROGRAM](program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'r');
    const uTime = gl.getUniformLocation(program, 't');
    const uIntensity = gl.getUniformLocation(program, 'k');
    const palette = readPalette();
    gl.uniform3fv(gl.getUniformLocation(program, 'c0'), palette.base);
    gl.uniform3fv(gl.getUniformLocation(program, 'c1'), palette.glow);
    gl.uniform3fv(gl.getUniformLocation(program, 'c2'), palette.core);
    gl.uniform3fv(gl.getUniformLocation(program, 'c3'), palette.spark);
    gl.uniform1f(uIntensity, intensity);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
    const resize = () => {
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uResolution, width, height);
    };
    resize();

    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let frame = 0;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    const loop = (now: number) => {
      elapsed += ((now - last) / 1000) * speed;
      last = now;
      draw(elapsed);
      frame = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (frame || !visible || document.hidden) return;
      last = performance.now();
      frame = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (!frame) draw(reduceMotion ? 6 : elapsed);
    });
    resizeObserver.observe(canvas);

    if (reduceMotion) {
      draw(6);
      return () => {
        resizeObserver.disconnect();
      };
    }

    const intersection = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    intersection.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    canvas.dataset.live = 'true';
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ref, intensity, speed]);
}
