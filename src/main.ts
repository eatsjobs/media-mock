import { MediaMock, devices } from "../lib/main.ts";

async function startStream() {
  const videoElement = document.querySelector<HTMLVideoElement>("video");
  const videoAssetURL = "/assets/hd_1280_720_25fps.mp4"; // https://www.pexels.com/video/signing-the-parcel-4440957/
  MediaMock.setMediaURL(videoAssetURL).mock(devices["iPhone 12"]);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 5 },
      },
    });

    videoElement!.srcObject = stream;

    await videoElement!.play();

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("Devices:", devices);

    const constraints = navigator.mediaDevices.getSupportedConstraints();
    console.log("constraints:", constraints);
  } catch (error) {
    console.error("Error accessing media devices.", error);
  }
}

window.addEventListener("load", startStream);
