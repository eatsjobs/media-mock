import * as THREE from "three";
import { devices, MediaMock, TimerMode } from "../lib/main.ts";

/**
 * Demo page for @eatsjobs/media-mock.
 *
 * Two sources, switchable at runtime:
 *
 * - `video` — a video file drawn onto a canvas MediaMock owns
 * - `three` — a live Three.js scene, whose canvas MediaMock captures directly
 *
 * Both end up behind `navigator.mediaDevices.getUserMedia()`, so the consuming
 * code is identical to what it would be with a real camera.
 */

// https://www.pexels.com/video/signing-the-parcel-4440957/
const VIDEO_ASSET_URL = "/assets/hd_1280_720_25fps.mp4";

const videoElement = document.querySelector<HTMLVideoElement>(
  "#video",
) as HTMLVideoElement;
const statusElement = document.querySelector<HTMLElement>(
  "#status",
) as HTMLElement;

/**
 * A rotating cube rendered by Three.js. Its canvas is what MediaMock captures,
 * so whatever this draws becomes the camera feed.
 */
function createThreeScene(width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.z = 4;

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x4f9dff, roughness: 0.35 }),
  );
  scene.add(cube);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  // The consumer drives their own render loop; MediaMock never schedules one for
  // a canvas it does not own.
  function animate() {
    requestAnimationFrame(animate);
    cube.rotation.x += 0.006;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  }
  animate();

  return renderer.domElement;
}

/**
 * Mocks the camera once, then swaps sources without re-mocking.
 */
async function start(source: "video" | "three") {
  MediaMock.unmock();

  MediaMock.setMockedVideoTracksHandler((tracks) => {
    const capabilities = tracks[0].getCapabilities();
    tracks[0].getCapabilities = function (
      this: MediaStreamTrack,
    ): MediaTrackCapabilities & { whatever: number } {
      return { ...capabilities, whatever: 1 };
    }.bind(tracks[0]);
    return tracks;
  })
    .configure({ timerMode: TimerMode.SetInterval })
    .mock(devices["iPhone 12"]);

  if (source === "three") {
    // A canvas MediaMock captures as-is: never resized, restyled or removed.
    await MediaMock.setSource(createThreeScene(1280, 720));
  } else {
    await MediaMock.setSource(VIDEO_ASSET_URL);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    statusElement.textContent = `${source} → ${track.label} · ${settings.width}x${settings.height} @ ${settings.frameRate}fps`;

    console.log("track:", track.label, track.id);
    console.log("settings:", settings);
    console.log("capabilities:", track.getCapabilities());
    console.log("devices:", await navigator.mediaDevices.enumerateDevices());
    console.log(
      "supported constraints:",
      navigator.mediaDevices.getSupportedConstraints(),
    );
  } catch (error) {
    statusElement.textContent = `error: ${(error as Error).message}`;
    console.error("Error accessing media devices.", error);
  }
}

/**
 * Shows the error-simulation API: getUserMedia rejects as a real browser would
 * when the user denies permission.
 */
async function simulateDenied() {
  MediaMock.unmock();
  MediaMock.mock(devices["iPhone 12"]).simulateGetUserMediaError(
    "NotAllowedError",
  );

  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    statusElement.textContent = "unexpected: getUserMedia resolved";
  } catch (error) {
    const denied = error as DOMException;
    statusElement.textContent = `${denied.name}: ${denied.message} — enumerateDevices is redacted`;
    console.log("devices:", await navigator.mediaDevices.enumerateDevices());
  }
}

document
  .querySelector("#source-video")
  ?.addEventListener("click", () => start("video"));
document
  .querySelector("#source-three")
  ?.addEventListener("click", () => start("three"));
document
  .querySelector("#simulate-denied")
  ?.addEventListener("click", () => simulateDenied());

window.addEventListener("load", () => start("video"));
