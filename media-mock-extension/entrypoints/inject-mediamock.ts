// MediaMock injection script - runs in MAIN world
import { devices, MediaMock } from "@eatsjobs/media-mock";

interface MediaMockWindow extends Window {
  MediaMock: typeof MediaMock;
  MediaMockDevices: typeof devices;
  MediaMockPageContextReady: boolean;
  MediaMockActive: boolean;
}

export default defineUnlistedScript(() => {
  const mediaWindow = window as MediaMockWindow;

  // Initialize MediaMock in the main world
  try {
    // Make MediaMock available globally in main world
    mediaWindow.MediaMock = MediaMock;
    mediaWindow.MediaMockDevices = devices;
    mediaWindow.MediaMockPageContextReady = true;

    console.log("MediaMock loaded in main world");
    console.log("Available devices:", Object.keys(devices));

    // Listen for commands from content script
    window.addEventListener("mediamock:command", async (event) => {
      const customEvent = event as CustomEvent;
      const { messageId, command, config } = customEvent.detail;

      try {
        let result: { success: boolean; status?: string; } | 
                    { success: boolean; error: string } | 
                    { success: boolean; isActive: boolean };
        switch (command) {
          case "START_MOCK":
            result = await startMock(config);
            break;
          case "STOP_MOCK":
            result = await stopMock();
            break;
          case "TEST_CAMERA":
            result = await testCamera();
            break;
          case "GET_STATUS":
            result = {
              success: true,
              isActive: mediaWindow.MediaMockActive || false,
            };
            break;
          default:
            result = { success: false, error: "Unknown command: " + command };
        }

        // Send response back to content script
        window.dispatchEvent(
          new CustomEvent("mediamock:response", {
            detail: { messageId, result },
          }),
        );
      } catch (error) {
        // Send error response
        window.dispatchEvent(
          new CustomEvent("mediamock:response", {
            detail: {
              messageId,
              result: { success: false, error: (error as Error).message },
            },
          }),
        );
      }
    });

    interface StartMockConfig {
      device: string;
      mediaUrl: string;
      debugMode: boolean;
    }

    async function startMock(config: StartMockConfig) {
      const { device, mediaUrl, debugMode } = config;

      console.log("Starting MediaMock in main world with device:", device);

      if (!mediaWindow.MediaMockDevices[device as keyof typeof devices]) {
        throw new Error(`Unknown device: ${device}`);
      }

      let mockInstance = mediaWindow.MediaMock;

      if (debugMode) {
        mockInstance = mockInstance.enableDebugMode();
      }

      // Mock the device with configuration
      const deviceConfig =
        mediaWindow.MediaMockDevices[device as keyof typeof devices];
      mockInstance.mock(deviceConfig);
      console.log("MediaMock.mock() called with device:", device);
      console.log("Device config:", deviceConfig);

      // Set media URL if provided
      if (mediaUrl) {
        await mockInstance.setMediaURL(mediaUrl);
        console.log("MediaMock.setMediaURL() called with:", mediaUrl);
      }

      // Mark as active
      mediaWindow.MediaMockActive = true;

      // Test that mocking is working
      const testDevices = await navigator.mediaDevices.enumerateDevices();
      console.log("Mocked devices after mock():", testDevices);

      // Dispatch custom event to notify the page
      window.dispatchEvent(
        new CustomEvent("mediamock:started", {
          detail: { device, mediaUrl, debugMode },
        }),
      );

      console.log("MediaMock started with device:", device);
      return { success: true, status: "started" };
    }

    async function stopMock() {
      if (mediaWindow.MediaMock) {
        mediaWindow.MediaMock.unmock();
        mediaWindow.MediaMockActive = false;

        // Dispatch custom event to notify the page
        window.dispatchEvent(new CustomEvent("mediamock:stopped"));

        console.log("MediaMock stopped");
      }
      return { success: true, status: "stopped" };
    }

    async function testCamera() {
      console.log("Testing camera access in main world...");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        console.log("Camera access successful:", {
          tracks: stream.getTracks().length,
          active: stream.active,
          settings: stream.getVideoTracks()[0]?.getSettings(),
        });

        // Stop the stream after testing
        stream.getTracks().forEach((track) => track.stop());

        // Show a brief visual indicator
        showTestResult(true);

        return { success: true, status: "testing" };
      } catch (error) {
        console.error("Camera test failed:", error);
        showTestResult(false, (error as Error).message);
        return { success: false, error: (error as Error).message };
      }
    }

    function showTestResult(success: boolean, errorMessage = "") {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${success ? "#4caf50" : "#f44336"};
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
      `;
      overlay.textContent = success
        ? "✓ Camera test successful"
        : `✗ Camera test failed: ${errorMessage}`;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 3000);
    }
  } catch (error) {
    console.error("Failed to load MediaMock in main world:", error);
  }
});
