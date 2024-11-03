import { MediaMock, devices } from "../lib/main.ts";
MediaMock.setImageURL("/assets/ean8_12345670.png").mock(devices["iPhone 12"]);

const videoElement = document.querySelector<HTMLVideoElement>("video");
async function startStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });

    videoElement!.srcObject = stream;

    await videoElement!.play();

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("Devices:", devices);

    const constraints = await navigator.mediaDevices.getSupportedConstraints();
    console.log("constraints:", constraints);
  } catch (error) {
    console.error("Error accessing media devices.", error);
  }
}

window.addEventListener("load", startStream);
