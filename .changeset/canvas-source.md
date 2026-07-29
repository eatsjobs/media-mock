---
"@eatsjobs/media-mock": minor
---

Stream a canvas you render into, so a WebGL/Three.js 3D scene can act as the mock camera feed.

```typescript
const renderer = new THREE.WebGLRenderer();
renderer.setSize(1280, 720);

MediaMock.mock(devices["Mac Desktop"]);
await MediaMock.setSource(renderer.domElement);

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
// every frame is the live 3D scene
```

The canvas is captured as-is: MediaMock creates no canvas, acquires no rendering context (a WebGL canvas has none to give), and runs no drawing loop — your render loop drives the frames. It is never resized (that would clear the WebGL drawing buffer and desynchronise a renderer's size bookkeeping), never restyled or moved in the DOM, and never removed by `unmock()`. The track reports the canvas's real pixel size; `frameRate` constraints still apply.

New `setSource()` accepts a media URL, an `HTMLCanvasElement`, or your own `FrameSource` — now an exported type, so procedural sources such as synthetic test patterns are possible:

```typescript
import { MediaMock, type FrameSource } from "@eatsjobs/media-mock";

const pattern: FrameSource = {
  size: { width: 640, height: 480 },
  drawInto(ctx, width, height) {
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(0, 0, width, height);
  },
};
await MediaMock.setSource(pattern);
```

`setMediaURL()` keeps working unchanged; it now delegates to `setSource()`.
