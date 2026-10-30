---
"@eatsjobs/media-mock": patch
---

The canvas MediaMock paints no longer requests `willReadFrequently`, which kept it on the CPU. At 4K in Chrome on a Galaxy M53, a WebGL consumer reading every frame received 12–18% more frames without it, and waited about a third as long for each one (#81). The mock only reads the canvas back once per start, which does not need the hint.
