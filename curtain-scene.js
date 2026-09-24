/*
 * Photographic velvet, carried by two continuous cloth meshes.
 *
 * const curtain = MaisonCurtain.create(canvas, loadedImage);
 * curtain.resize(cssWidth, cssHeight, devicePixelRatio);
 * curtain.render(openingProgress, elapsedSeconds);
 * curtain.destroy();
 *
 * openingProgress is linear: 0 = closed, 1 = gathered into the wings.
 * The caller owns the clock. This module never schedules frames or loads media.
 */
(() => {
  'use strict';

  const VERTEX_SHADER = `
    precision highp float;
    attribute vec2 a_grid;
    uniform float u_side;
    uniform float u_progress;
    uniform float u_seconds;
    uniform vec2 u_cover;
    varying vec2 v_uv;
    varying float v_light;
    varying float v_hem;

    float smoother(float x) {
      x = clamp(x, 0.0, 1.0);
      return x*x*x*(x*(x*6.0-15.0)+10.0);
    }

    void main() {
      float across = a_grid.x; // 0 at the rail end, 1 at the opening edge
      float down = a_grid.y;
      float p = clamp(u_progress, 0.0, 1.0);

      // The rail draws the upper fabric first; weight makes the hem follow.
      // Both reach their final position together, without a discontinuity.
      float delay = 0.135 * pow(down, 1.45);
      delay += step(0.0, u_side) * 0.013 * sin(3.14159265*p);
      float local = clamp((p-delay)/(1.0-delay), 0.0, 1.0);
      float gather = smoother(local);
      float moving = sin(3.14159265*local);
      moving *= moving;

      // A broad, irregular fold profile deforms the photo as a sheet. The
      // source's real highlights and nap stay attached to its material UVs.
      float phase = across*49.0 + 0.48*sin(across*14.3);
      phase += down*0.38 + 0.32*moving*sin(u_seconds*1.3-down*1.7);
      float fold = sin(phase) + 0.22*sin(phase*1.91+0.8);
      float foldSlope = cos(phase) + 0.42*cos(phase*1.91+0.8);
      // Keep the material's apparent width above 42% of its closed width.
      // Once its folds have gathered, the remaining cloth travels into the
      // off-screen wings. Compressing the entire photograph to a thin strip
      // would turn its rich folds into a grille of one-pixel lines.
      float naturalSpan = 1.008 - 0.957*gather;
      float spanBlend = clamp(0.5 + 0.5*(naturalSpan-0.42)/0.07,0.0,1.0);
      float span = mix(0.42,naturalSpan,spanBlend) + 0.07*spanBlend*(1.0-spanBlend);
      float wingTravel = 0.455*pow(max(0.0,(gather-0.52)/0.48),1.8);
      float curtainX = 1.006 + wingTravel - span*across;

      // Gathering is distributed across the cloth. It changes the spacing
      // of the folds instead of translating a rectangular panel off screen.
      float edgeWeight = sin(3.14159265*across);
      curtainX += span*0.0105*fold*edgeWeight*moving;
      curtainX += 0.010*moving*down*down*across*across;

      // A small, damped settling bend at the end of the pull (under 3 px at
      // common desktop sizes). No perpetual or travelling sine-wave motion.
      float settling = sin(clamp((local-0.73)/0.27,0.0,1.0)*6.2831853);
      settling *= smoother((local-0.70)/0.10)*(1.0-smoother((local-0.91)/0.09));
      curtainX += 0.0032*settling*down*down*across;

      float curtainY = down;
      curtainY += 0.0075*moving*down*down*(0.35+0.65*across);
      curtainY += 0.0015*fold*moving*down*down*edgeWeight;

      // Surface relief affects both perspective and the changing grazing
      // light. Its amplitude is deliberately weaker than the photo's folds.
      float relief = fold*0.012*moving*edgeWeight;
      float perspective = 1.0 + relief*0.11;
      gl_Position = vec4(u_side*curtainX, 1.02-2.04*curtainY, 0.0, perspective);

      float photoX = 0.5 + u_side*(1.0-across)*0.5;
      v_uv = (vec2(photoX,down)-0.5)*u_cover+0.5;
      v_light = 1.0 + 0.045*foldSlope*moving - 0.055*gather;
      v_hem = smoothstep(0.976,1.0,across)*smoother(p/0.14);
    }
  `;

  const FRAGMENT_SHADER = `
    precision mediump float;
    uniform sampler2D u_fabric;
    varying vec2 v_uv;
    varying float v_light;
    varying float v_hem;

    void main() {
      vec3 fabric = texture2D(u_fabric,v_uv).rgb;
      // A deep wine grade retains the photographed velvet grain and avoids
      // synthetic stripe gradients or a visible procedural noise overlay.
      fabric *= vec3(0.78,0.76,0.85);
      float stageLight = 0.91 + 0.09*(1.0-pow(abs(v_uv.x-0.5)*2.0,1.4));
      fabric *= stageLight*v_light*(1.0-v_hem*0.18);
      gl_FragColor = vec4(fabric,1.0);
    }
  `;

  function create(canvas, textureImage) {
    if (!canvas || !textureImage || !textureImage.naturalWidth || !textureImage.naturalHeight) return null;
    let gl;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'low-power'
      });
    } catch (_) {
      return null;
    }
    if (!gl) return null;

    const resources = { shaders: [], program: null, vertexBuffer: null, indexBuffer: null, texture: null };
    let destroyed = false;
    let contextLost = false;
    let indexCount = 0;
    let uniforms;
    let gridAttribute;
    let cssWidth = 1;
    let cssHeight = 1;

    function release() {
      if (resources.texture) gl.deleteTexture(resources.texture);
      if (resources.vertexBuffer) gl.deleteBuffer(resources.vertexBuffer);
      if (resources.indexBuffer) gl.deleteBuffer(resources.indexBuffer);
      if (resources.program) gl.deleteProgram(resources.program);
      resources.shaders.forEach((shader) => gl.deleteShader(shader));
    }

    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to allocate a curtain shader.');
      resources.shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Curtain shader compilation failed.');
      }
      return shader;
    }

    try {
      const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!program) throw new Error('Unable to allocate a curtain program.');
      resources.program = program;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Curtain program linking failed.');
      }
      gl.useProgram(program);

      uniforms = {};
      ['side', 'progress', 'seconds', 'cover', 'fabric'].forEach((name) => {
        uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      });
      gridAttribute = gl.getAttribLocation(program, 'a_grid');
      if (gridAttribute < 0) throw new Error('Curtain mesh attribute is unavailable.');

      // The mesh has enough horizontal samples for the original folds to
      // gather smoothly, and enough vertical samples for the delayed hem.
      const columns = 144;
      const rows = 48;
      const vertices = new Float32Array((columns+1)*(rows+1)*2);
      const indices = new Uint16Array(columns*rows*6);
      let vertexOffset = 0;
      let indexOffset = 0;
      for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
          vertices[vertexOffset++] = column/columns;
          vertices[vertexOffset++] = row/rows;
        }
      }
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const corner = row*(columns+1)+column;
          indices[indexOffset++] = corner;
          indices[indexOffset++] = corner+1;
          indices[indexOffset++] = corner+columns+1;
          indices[indexOffset++] = corner+1;
          indices[indexOffset++] = corner+columns+2;
          indices[indexOffset++] = corner+columns+1;
        }
      }
      indexCount = indices.length;
      resources.vertexBuffer = gl.createBuffer();
      resources.indexBuffer = gl.createBuffer();
      if (!resources.vertexBuffer || !resources.indexBuffer) throw new Error('Unable to allocate curtain mesh buffers.');
      gl.bindBuffer(gl.ARRAY_BUFFER, resources.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(gridAttribute);
      gl.vertexAttribPointer(gridAttribute, 2, gl.FLOAT, false, 0, 0);

      if (Math.max(textureImage.naturalWidth,textureImage.naturalHeight) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
        throw new Error('The curtain photograph exceeds this device’s texture limit.');
      }
      resources.texture = gl.createTexture();
      if (!resources.texture) throw new Error('Unable to allocate the curtain photograph.');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureImage);
      gl.uniform1i(uniforms.fabric,0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0,0,0,0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('The curtain photograph could not be uploaded.');
    } catch (error) {
      release();
      console.warn('[Maison Rouge] Using the photographic curtain fallback.', error.message);
      return null;
    }

    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
      // The owner can immediately reveal its CSS fallback on this event.
      canvas.dispatchEvent(new CustomEvent('maisoncurtainerror'));
    }
    canvas.addEventListener('webglcontextlost',onContextLost,false);

    function resize(width, height, dpr) {
      if (destroyed || contextLost) return false;
      cssWidth = Math.max(1, Number(width) || 1);
      cssHeight = Math.max(1, Number(height) || 1);
      const pixelRatio = Math.min(1.5,Math.max(1,Number(dpr) || 1));
      const pixelWidth = Math.max(1,Math.round(cssWidth*pixelRatio));
      const pixelHeight = Math.max(1,Math.round(cssHeight*pixelRatio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      gl.viewport(0,0,pixelWidth,pixelHeight);
      return true;
    }

    function render(progress, seconds) {
      if (destroyed || contextLost || gl.isContextLost()) return false;
      const p = Math.max(0,Math.min(1,Number(progress) || 0));
      const elapsed = Math.max(0,Number(seconds) || 0);
      const imageAspect = textureImage.naturalWidth/textureImage.naturalHeight;
      const screenAspect = cssWidth/cssHeight;
      const coverX = Math.min(1,screenAspect/imageAspect);
      const coverY = Math.min(1,imageAspect/screenAspect);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(resources.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,resources.vertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,resources.indexBuffer);
      gl.enableVertexAttribArray(gridAttribute);
      gl.vertexAttribPointer(gridAttribute,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,resources.texture);
      gl.uniform2f(uniforms.cover,coverX,coverY);
      gl.uniform1f(uniforms.progress,p);
      gl.uniform1f(uniforms.seconds,elapsed);
      gl.uniform1f(uniforms.side,-1);
      gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
      gl.uniform1f(uniforms.side,1);
      gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
      return true;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('webglcontextlost',onContextLost,false);
      if (!contextLost) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        release();
      }
    }

    resize(canvas.clientWidth || 1,canvas.clientHeight || 1,window.devicePixelRatio || 1);
    return { render, resize, destroy };
  }

  window.MaisonCurtain = Object.freeze({ create });
})();
