/* Full-frame photo/VFX composite. All optics use the photograph's pixel coordinates. */
(() => {
  'use strict';
  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_screen;
    void main() {
      v_screen = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
      gl_Position = vec4(a_position, 0., 1.);
    }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 v_screen;
    uniform sampler2D u_room;
    uniform sampler2D u_moon;
    uniform sampler2D u_night;
    uniform vec2 u_resolution;
    uniform vec2 u_image_size;
    uniform vec2 u_object_position;
    uniform float u_progress;
    uniform vec4 u_lunar;
    uniform vec4 u_hydrology;

    float sat(float x) { return clamp(x, 0., 1.); }
    float ease(float x) { x = sat(x); return x*x*(3.-2.*x); }

    // A sphere silhouette and diffuse lighting replace the flat cutout's edge and glow.
    vec4 lunarSurface(vec2 p, vec2 center, vec2 radius) {
      vec2 q = (p - center) / radius;
      float d = dot(q, q);
      float alpha = 1. - smoothstep(.94, 1.025, d);
      float z = sqrt(max(0., 1. - min(d, 1.)));
      vec3 normal = normalize(vec3(q.x, -q.y, max(z, .001)));
      float turn = u_hydrology.w;
      vec2 terrainQ = mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q;
      vec2 face = vec2(asin(clamp(terrainQ.x, -.999, .999)), asin(clamp(terrainQ.y, -.999, .999))) / 3.14159265 + .5;
      vec3 map = texture2D(u_moon, .09 + face * .82).rgb;
      float terrain = clamp((dot(map, vec3(.299,.587,.114))-.38)*1.85,0.,1.);
      float diffuse = max(0., dot(normal, normalize(vec3(-.55,.7,.95))));
      vec3 light = vec3(1.,.91,.76) * (.48 + .52 * diffuse);
      vec3 bounce = vec3(.19,.034,.022) * pow(sat(-normal.y), 2.);
      vec3 albedo = light * mix(.52, 1.16, terrain) + bounce;
      return vec4(albedo, alpha);
    }

    vec3 photograph(vec2 uv, float night) {
      return mix(texture2D(u_room,uv).rgb,texture2D(u_night,uv).rgb,night);
    }

    void main() {
      float progress = u_progress;
      float night = ease((progress-.12)/.47);
      vec2 center = u_lunar.xy;
      float radius = u_lunar.z;
      float presence = u_lunar.w;
      float waterY = u_hydrology.x;
      float wetTime = u_hydrology.y;
      float submersion = u_hydrology.z;

      float cover = max(u_resolution.x/u_image_size.x, u_resolution.y/u_image_size.y);
      vec2 drawn = u_image_size * cover;
      vec2 uv = (v_screen*u_resolution + (drawn-u_resolution)*u_object_position)/drawn;
      vec2 p = uv*vec2(1672.,941.);
      vec3 photo = photograph(uv,night);
      vec3 color = photo;
      if(p.x<1090. || p.x>1365. || p.y<248. || p.y>690.) {
        gl_FragColor=vec4(photo,1.);
        return;
      }

      vec2 liquid = (p-vec2(1230.5,waterY))/vec2(121.5,11.);
      float liquidMask = 1.-smoothstep(.88,1.,dot(liquid,liquid));
      vec2 bowl = (p-vec2(1230.5,579.))/vec2(123.,95.);
      float bowlMask = 1.-smoothstep(.95,1.025,dot(bowl,bowl));

      // The disturbance only bends existing reflections. No painted white rings.
      vec2 plane = vec2(p.x-1230.5,(p.y-waterY)*121.5/11.);
      float rho = length(plane);
      float wave = 0.;
      float slope = 0.;
      for(int i=0;i<2;i++) {
        float age = wetTime-float(i)*.17;
        if(age>0.) {
          float front = 18.+119.*age;
          float offset = rho-front;
          float packet = exp(-pow(offset/18.,2.));
          float strength = ease(age/.04)*exp(-age*4.8)*(1.-float(i)*.48);
          wave += sin(offset*.19)*packet*strength;
          slope += cos(offset*.19)*packet*strength;
        }
      }
      float contactAge = max(0.,wetTime);
      float impulse = step(0.,wetTime)*(1.-exp(-contactAge/.035))*exp(-contactAge/.16);
      float contactSlope = exp(-pow(rho/36.,2.))*impulse;
      vec2 direction = plane/max(rho,1.);
      vec2 waterBend = direction*vec2(2.8,1.)*(slope+contactSlope*1.8);
      float waterBand = (1.-smoothstep(110.,124.,abs(p.x-1230.5)))
        *smoothstep(565.,572.,p.y)*(1.-smoothstep(596.,610.,p.y));
      vec2 levelShift = vec2(0.,(578.-waterY)*waterBand);
      vec2 refractedUV = uv+(levelShift+waterBend*liquidMask*.85)/vec2(1672.,941.);
      photo = photograph(refractedUV,night);
      color = photo;
      float surface = waterY+wave*.32-contactSlope*.85;
      float approach = ease((center.y+radius-450.)/128.);
      float contact = exp(-pow((p.x-center.x)/30.,2.)-pow((p.y-waterY)/5.,2.));
      color *= 1.-contact*liquidMask*approach*(1.-submersion)*.055;

      // A restrained reflection borrows the warm light already present in the room.
      float reflectionY = waterY+3.+min(10.,max(0.,waterY-center.y-radius)*.035);
      vec4 reflection = lunarSurface(vec2(p.x,center.y-(p.y-reflectionY)*7.),center,vec2(radius));
      float reflectionAmount = reflection.a*liquidMask*approach*.09*(1.-submersion)*presence;
      color = mix(color,photo*.72+reflection.rgb*vec3(.29,.28,.26),reflectionAmount);

      vec4 moon = lunarSurface(p,center,vec2(radius));
      // Daylight haze lifts the disc just above the sky, with soft crater contrast.
      // The same moon gains definition as the room and sky turn to night.
      float lunarTone = dot(moon.rgb,vec3(.299,.587,.114));
      vec3 daytimeMoon = photo+vec3(.049,.054,.059)+(lunarTone-.67)*.15;
      vec3 moonColor = mix(daytimeMoon,moon.rgb*vec3(1.04,1.06,1.10),night);

      // Inverse apparent-depth mapping is continuous at the air/water boundary.
      // The surface cross-section stays fixed while underwater depth is compressed.
      float below = max(0.,p.y-surface);
      float depth = max(0.,center.y-waterY);
      float lens = 1.+.035*ease(below/68.);
      vec2 throughWater = vec2(1230.5+(p.x-1230.5)/lens,surface+below/.78);
      throughWater.x += wave*.38*ease(below/4.)*exp(-below/12.);
      vec4 submerged = lunarSurface(throughWater,center,vec2(radius));
      float wet = smoothstep(surface-.7,surface+.7,p.y);
      float attenuation = exp(-below*.003-depth*.002);

      // Keep the photographed glass highlights and reflected window bars in front.
      vec2 texel = vec2(1./1672.,1./941.);
      vec3 localPhoto = (photograph(refractedUV+vec2(3.,0.)*texel,night)
        +photograph(refractedUV-vec2(3.,0.)*texel,night)
        +photograph(refractedUV+vec2(0.,3.)*texel,night)
        +photograph(refractedUV-vec2(0.,3.)*texel,night))*.25;
      float glassDetail = dot(photo-localPhoto,vec3(.299,.587,.114));
      float glassReflection = smoothstep(.025,.13,glassDetail)*.8;
      vec3 submergedColor = submerged.rgb*vec3(.72,.70,.67)*attenuation+localPhoto*.13;
      vec4 object = mix(vec4(moonColor,moon.a),vec4(submergedColor,submerged.a*bowlMask),wet);
      color = mix(color,object.rgb,object.a*presence);
      color = mix(color,photo,glassReflection*wet*object.a*presence);

      // Restore the photographed front lip in front of both moon and water.
      float dx = (p.x-1230.5)/118.;
      float frontLipY = 548.5+8.5*sqrt(max(0.,1.-dx*dx));
      float lip = (1.-smoothstep(1.,2.8,abs(p.y-frontLipY)))*(1.-step(1.,abs(dx)));
      color = mix(color,photo,lip*(.25+.5*glassReflection));
      gl_FragColor=vec4(clamp(color,0.,1.),1.);
    }

  `;

  function create(canvas, photo, moon, night) {
    const gl = canvas.getContext('webgl', {alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if (!gl) return null;
    const resources = [];
    try {
      function shader(type, source) {
        const item = gl.createShader(type);
        gl.shaderSource(item,source); gl.compileShader(item);
        if (!gl.getShaderParameter(item,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
        resources.push(['Shader',item]); return item;
      }
      const program = gl.createProgram(); resources.push(['Program',program]);
      gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer(); resources.push(['Buffer',buffer]);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program,'a_position');
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      function texture(image, unit, name) {
        const tex = gl.createTexture(); resources.push(['Texture',tex]);
        gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.uniform1i(gl.getUniformLocation(program,name),unit);
      }
      texture(photo,0,'u_room'); texture(moon,1,'u_moon'); texture(night,2,'u_night');
      const resolution = gl.getUniformLocation(program,'u_resolution');
      const objectPosition = gl.getUniformLocation(program,'u_object_position');
      const progress = gl.getUniformLocation(program,'u_progress');
      const lunar = gl.getUniformLocation(program,'u_lunar');
      const hydrology = gl.getUniformLocation(program,'u_hydrology');
      const motion = window.MaisonMoonMotion;
      if(!motion) throw new Error('Moon motion model did not load');
      gl.uniform2f(gl.getUniformLocation(program,'u_image_size'),photo.naturalWidth,photo.naturalHeight);
      let width=1,height=1;
      return {
        resize(w,h,dpr=1) {
          width=w; height=h;
          const scale=Math.min(dpr,1.5);
          canvas.width=Math.round(w*scale); canvas.height=Math.round(h*scale);
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform2f(resolution,w,h);
        },
        render(value,position=[.5,.5]) {
          if (gl.isContextLost()) return;
          const state = motion.sample(value);
          gl.uniform4f(lunar,state.x,state.y,state.radius,state.alpha);
          gl.uniform4f(hydrology,state.waterY,state.wetTime,state.submerged,state.rotation);
          gl.uniform1f(progress,value); gl.uniform2f(objectPosition,position[0],position[1]);
          gl.drawArrays(gl.TRIANGLES,0,6);
          canvas.dataset.progress=value.toFixed(4);
        },
        destroy() { for (const [type,item] of resources) gl['delete'+type](item); }
      };
    } catch (error) {
      canvas.dataset.renderError=String(error.message||error);
      for (const [type,item] of resources) gl['delete'+type](item);
      return null;
    }
  }
  window.MaisonHeroScene = {create};
})();
