---
"@eatsjobs/media-mock": patch
---

Replace the branching between image and video media with a `FrameSource` abstraction. Internal restructuring with no public API change.

`MediaMockClass` held `currentImage` and `currentVideo` side by side and re-derived which one was live by re-parsing `settings.mediaURL`, giving 42 branches spread across `setMediaURL`, the drawing loops, debug mode and teardown. Media loading, DOM attachment, per-frame painting and cleanup now live in the source that owns them:

- `lib/sources/ImageSource.ts` — letterboxed drawing, and the attached-to-DOM workaround that keeps webkit from evicting decoded pixels
- `lib/sources/VideoSource.ts` — fill-the-canvas drawing of a looping video
- `lib/sources/mediaType.ts` — `isVideoURL`, now DOM-free and unit-tested in node
- `lib/sources/loadVideo.ts` — video element creation and first-frame wait

The two near-identical drawing loops collapse into one that asks the source to paint. Frame rate throttling and the first-frame-plus-readback priming (a webkit fix that previously applied only to images) now apply to every source, and `lib/main.ts` drops from 1129 to 854 lines.
