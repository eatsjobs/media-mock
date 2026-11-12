---
"@eatsjobs/media-mock": minor
---

New `configure({ frameOutput: FrameOutput.VideoFrameNV12 })` delivers NV12 frames, the format a real camera produces, instead of the BGRA frames of canvas capture (#87). Code reading frames through WebCodecs (`new VideoFrame(video)`, `copyTo()`) now takes the same path under the mock as with a real camera. The painted source is converted to NV12 (BT.601, limited range) and written to a `MediaStreamTrackGenerator`; a still image is converted once rather than every frame. Chrome and Edge only: Safari, Firefox, a canvas the consumer renders, and odd frame sizes keep canvas capture, which stays the default. Safari's `VideoTrackGenerator` is not used because in Safari 27.2 a `<video>` playing its track keeps presenting the first frame. Debug mode now also shows a thumbnail of the stream with the format and rate of the frames it delivers.
