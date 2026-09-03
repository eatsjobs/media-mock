import { afterEach, describe, expect, it } from "vitest";
import {
  createSyntheticStream,
  createSyntheticVideoTrack,
} from "../../lib/syntheticStream";

/**
 * The stand-ins have to pass for the real interfaces, because consumer code
 * routinely narrows with `instanceof MediaStream` before touching a stream.
 */
const globals = globalThis as unknown as Record<string, unknown>;

function withGlobal(name: string, value: unknown, body: () => void): void {
  const had = Object.getOwnPropertyDescriptor(globals, name) !== undefined;
  const previous = globals[name];
  globals[name] = value;
  try {
    body();
  } finally {
    if (had) {
      globals[name] = previous;
    } else {
      delete globals[name];
    }
  }
}

describe("synthetic media objects", () => {
  afterEach(() => {
    delete globals.MediaStream;
    delete globals.MediaStreamTrack;
  });

  it("should satisfy instanceof the environment's MediaStream", () => {
    class FakeMediaStream {}

    withGlobal("MediaStream", FakeMediaStream, () => {
      expect(createSyntheticStream([])).toBeInstanceOf(FakeMediaStream);
    });
  });

  it("should satisfy instanceof the environment's MediaStreamTrack", () => {
    class FakeMediaStreamTrack {}

    withGlobal("MediaStreamTrack", FakeMediaStreamTrack, () => {
      expect(createSyntheticVideoTrack()).toBeInstanceOf(FakeMediaStreamTrack);
    });
  });

  it("should keep its own methods when a native prototype is adopted", () => {
    // happy-dom's MediaStream.prototype carries a getTracks that would drop the
    // tracks; ours has to win.
    class FakeMediaStream {
      getTracks() {
        return ["from the native prototype"];
      }
    }

    withGlobal("MediaStream", FakeMediaStream, () => {
      const track = createSyntheticVideoTrack();

      expect(createSyntheticStream([track]).getTracks()).toEqual([track]);
    });
  });

  it("should not leak an adopted prototype into a later object", () => {
    // Adoption must be per object: a shared class prototype mutated once would
    // chain every later stream to whatever the first environment happened to
    // expose.
    class FirstMediaStream {}
    withGlobal("MediaStream", FirstMediaStream, () => {
      createSyntheticStream([]);
    });

    class SecondMediaStream {}
    withGlobal("MediaStream", SecondMediaStream, () => {
      const stream = createSyntheticStream([]);

      expect(stream).toBeInstanceOf(SecondMediaStream);
      expect(stream).not.toBeInstanceOf(FirstMediaStream);
    });
  });

  it("should own its properties even when the native prototype only has getters", () => {
    // happy-dom's MediaStreamTrack.prototype declares `kind` as a getter with
    // no setter, so plain assignment onto an object inheriting from it throws.
    class GetterOnlyTrack {
      get kind() {
        return "from the prototype";
      }
      get readyState() {
        return "from the prototype";
      }
    }

    withGlobal("MediaStreamTrack", GetterOnlyTrack, () => {
      const track = createSyntheticVideoTrack();

      expect(track.kind).toBe("video");

      track.stop();
      expect(track.readyState).toBe("ended");
    });
  });

  it("should work where the environment defines no such interface", () => {
    // jsdom has neither global at all.
    const stream = createSyntheticStream([createSyntheticVideoTrack()]);

    expect(stream.getTracks()).toHaveLength(1);
  });

  it("should still deliver events", () => {
    const track = createSyntheticVideoTrack();
    let ended = 0;
    track.addEventListener("ended", () => {
      ended++;
    });

    track.stop();

    expect(track.readyState).toBe("ended");
    expect(ended).toBe(1);
  });

  it("should report the tracks it holds, by kind", () => {
    const track = createSyntheticVideoTrack();

    const stream = createSyntheticStream([track]);

    expect(stream.getVideoTracks()).toEqual([track]);
    expect(stream.getAudioTracks()).toEqual([]);
    expect(stream.active).toBe(true);
  });
});
