import { devices, MediaMock } from "../lib/main.ts";

async function startStream() {
  const videoElement = document.querySelector<HTMLVideoElement>(
    "#video",
  ) as HTMLVideoElement;
  // const assetURL = "/assets/ean8_12345670.png";
  // https://www.pexels.com/video/signing-the-parcel-4440957/
  const videoAssetURL = "/assets/hd_1280_720_25fps.mp4";
  MediaMock.setMockedVideoTracksHandler((tracks) => {
    const capabilities = tracks[0].getCapabilities();
    tracks[0].getCapabilities = function (
      this: MediaStreamTrack,
    ): MediaTrackCapabilities & { whatever: number } {
      return {
        ...capabilities,
        whatever: 1,
      };
    }.bind(tracks[0]);
    return tracks;
  }).mock(devices["iPhone 12"]);

  await MediaMock.setMediaURL(videoAssetURL);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 5 },
      },
    });

    stream.getVideoTracks().forEach((track) => {
      console.log("Track:", track.label, track.id);
    });

    videoElement.srcObject = stream;

    await videoElement.play();

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("Devices:", devices);

    const constraints = navigator.mediaDevices.getSupportedConstraints();
    console.log("constraints:", constraints);
    console.log(
      "mocked capabilities:",
      stream.getVideoTracks()[0].getCapabilities(),
    );
  } catch (error) {
    console.error("Error accessing media devices.", error);
  }
}

window.addEventListener("load", startStream);
