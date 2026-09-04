/**
 * Canvas mocks and polyfills for jsdom & Vitest test execution.
 * Provides realistic Blob / DataURL output and mock 2D/WebGL rendering contexts.
 */

// Minimal valid 1x1 PNG byte header
const DUMMY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// Minimal valid 1x1 JPEG byte header
const DUMMY_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03,
  0x03, 0x03, 0x03, 0x04, 0x03, 0x03, 0x04, 0x05, 0x08, 0x05, 0x05, 0x04, 0x04, 0x05, 0x0a, 0x07,
  0x07, 0x06, 0x08, 0x0c, 0x0a, 0x0c, 0x0c, 0x0b, 0x0a, 0x0b, 0x0b, 0x0d, 0x0e, 0x12, 0x10, 0x0d,
  0x0e, 0x11, 0x0e, 0x0b, 0x0b, 0x10, 0x16, 0x10, 0x11, 0x13, 0x14, 0x15, 0x15, 0x15, 0x0c, 0x0f,
  0x17, 0x18, 0x16, 0x14, 0x18, 0x12, 0x14, 0x15, 0x14, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

/**
 * Creates a mock 2D canvas rendering context.
 */
export const createMockCanvas2DContext = (canvas: HTMLCanvasElement): any => {
  const context = {
    canvas,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1.0,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    imageSmoothingEnabled: true,

    fillRect: () => undefined,
    clearRect: () => undefined,
    strokeRect: () => undefined,
    drawImage: () => undefined,

    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    quadraticCurveTo: () => undefined,
    bezierCurveTo: () => undefined,
    rect: () => undefined,
    ellipse: () => undefined,

    stroke: () => undefined,
    fill: () => undefined,
    clip: () => undefined,

    fillText: () => undefined,
    strokeText: () => undefined,
    measureText: (text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 8,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
    }),

    save: () => undefined,
    restore: () => undefined,
    scale: () => undefined,
    rotate: () => undefined,
    translate: () => undefined,
    transform: () => undefined,
    setTransform: () => undefined,
    resetTransform: () => undefined,

    createLinearGradient: () => ({
      addColorStop: () => undefined,
    }),
    createRadialGradient: () => ({
      addColorStop: () => undefined,
    }),
    createConicGradient: () => ({
      addColorStop: () => undefined,
    }),
    createPattern: () => ({
      setTransform: () => undefined,
    }),

    createImageData: (sw: number, sh: number) => ({
      width: sw,
      height: sh,
      data: new Uint8ClampedArray(sw * sh * 4),
      colorSpace: 'srgb',
    }),
    getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
      const data = new Uint8ClampedArray(sw * sh * 4);
      // Fill with solid white by default for predictable image test assertions
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
      return {
        width: sw,
        height: sh,
        data,
        colorSpace: 'srgb',
      };
    },
    putImageData: () => undefined,

    setLineDash: () => undefined,
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };

  return context;
};

/**
 * Creates a mock WebGL rendering context.
 */
export const createMockWebGLContext = (canvas: HTMLCanvasElement): any => {
  return {
    canvas,
    drawingBufferWidth: canvas.width || 300,
    drawingBufferHeight: canvas.height || 150,
    getExtension: () => null,
    getParameter: (param: number) => {
      // 0x1F00 = VENDOR, 0x1F01 = RENDERER, 0x1F02 = VERSION
      if (param === 0x1f00) return 'Mock WebGL Vendor';
      if (param === 0x1f01) return 'Mock WebGL Renderer';
      if (param === 0x1f02) return 'WebGL 1.0 (Mock)';
      return 0;
    },
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    useProgram: () => undefined,
    createBuffer: () => ({}),
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    enableVertexAttribArray: () => undefined,
    vertexAttribPointer: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
    drawArrays: () => undefined,
    drawElements: () => undefined,
  };
};

/**
 * Installs canvas polyfills on HTMLCanvasElement.
 */
export const installCanvasMocks = (): void => {
  if (typeof HTMLCanvasElement === 'undefined') {
    return;
  }

  // --- HTMLCanvasElement.prototype.toBlob with realistic Binary Blobs ---
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value(callback: (blob: Blob | null) => void, type = 'image/png', _quality = 0.92): void {
      const mime = type.toLowerCase();
      let bytes: Uint8Array;

      if (mime === 'image/jpeg' || mime === 'image/jpg') {
        bytes = DUMMY_JPEG_BYTES;
      } else {
        bytes = DUMMY_PNG_BYTES;
      }

      const blob = new Blob([bytes as unknown as BlobPart], { type: mime });

      // Match asynchronous browser specification behavior
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => callback(blob));
      } else {
        setTimeout(() => callback(blob), 0);
      }
    },
  });

  // --- HTMLCanvasElement.prototype.toDataURL ---
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    writable: true,
    value(type = 'image/png', _quality?: number): string {
      const mime = type.toLowerCase();
      if (mime === 'image/jpeg' || mime === 'image/jpg') {
        return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
      }
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
  });

  // --- HTMLCanvasElement.prototype.getContext (fallback for jsdom) ---
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function (contextId: string, options?: any): any {
      const existing = originalGetContext?.call(this, contextId, options);
      if (existing) {
        return existing;
      }

      if (contextId === '2d') {
        if (!(this as any)._mock2dContext) {
          (this as any)._mock2dContext = createMockCanvas2DContext(this);
        }
        return (this as any)._mock2dContext;
      }

      if (contextId === 'webgl' || contextId === 'experimental-webgl' || contextId === 'webgl2') {
        if (!(this as any)._mockWebGLContext) {
          (this as any)._mockWebGLContext = createMockWebGLContext(this);
        }
        return (this as any)._mockWebGLContext;
      }

      return null;
    },
  });
};
