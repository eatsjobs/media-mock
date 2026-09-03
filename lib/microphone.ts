/**
 * A silent microphone for the mocked stream.
 *
 * Web Audio is the only way to manufacture a live audio `MediaStreamTrack` in a
 * browser. A `MediaStreamAudioDestinationNode` with nothing connected to it
 * emits silence, which is exactly what a mocked microphone should deliver: the
 * track is live and readable, it simply carries no sound.
 *
 * The context stays suspended until a user gesture in most browsers. That does
 * not matter here — the destination hands out a live track either way, and no
 * audio is ever rendered.
 */
export class Microphone {
  private context: AudioContext | undefined;

  /** Whether the environment exposes Web Audio at all (node does not). */
  static isSupported(): boolean {
    return typeof AudioContext !== "undefined";
  }

  /**
   * A fresh, live, silent audio track, or undefined where Web Audio is missing.
   *
   * Each call builds its own destination node so two concurrent streams never
   * share a track.
   */
  open(): MediaStreamTrack | undefined {
    if (!Microphone.isSupported()) {
      return undefined;
    }

    this.context ??= new AudioContext();
    return this.context
      .createMediaStreamDestination()
      .stream.getAudioTracks()[0];
  }

  /**
   * Releases the audio context. Tracks already handed out are not ended by
   * this — the caller stops those with the rest of the stream.
   */
  close(): void {
    // Closing an already-closed context rejects; nothing here can act on it.
    this.context?.close().catch(() => undefined);
    this.context = undefined;
  }
}
