/**
 * The camera/microphone permission model behind the mocked prompt.
 *
 * Kept free of the DOM: it decides what a `getUserMedia` call's permission
 * step comes to, and leaves turning that into errors, events and tracks to
 * the caller. That is what lets the whole prompt flow be tested in node.
 */

/** The permission names a `getUserMedia` call can need. */
export type MediaPermissionName = "camera" | "microphone";

/** How the simulated user responds to an open prompt. */
export type PermissionPromptAnswer = "allow" | "deny" | "dismiss";

/**
 * Which permissions an open prompt asks for. Plain data, so it survives
 * Playwright's `page.evaluate` boundary.
 */
export interface PermissionPrompt {
  camera: boolean;
  microphone: boolean;
}

/**
 * What the permission step of a `getUserMedia` call came to. `"dismissed"`
 * means the user closed the prompt without choosing; `"aborted"` means the
 * mock was torn down while the call waited.
 */
export type PermissionOutcome = "granted" | "denied" | "dismissed" | "aborted";

export const MEDIA_PERMISSION_NAMES: readonly MediaPermissionName[] = [
  "camera",
  "microphone",
];

export const PERMISSION_STATES: readonly PermissionState[] = [
  "granted",
  "denied",
  "prompt",
];

const ANSWERS: readonly PermissionPromptAnswer[] = ["allow", "deny", "dismiss"];

interface PendingRequest {
  kinds: PermissionPrompt;
  resolve: (outcome: PermissionOutcome) => void;
}

interface PromptWaiter {
  resolve: (prompt: PermissionPrompt) => void;
  reject: (error: Error) => void;
}

/**
 * Permission states, the queue of calls waiting on a prompt, and the answers
 * that settle them.
 *
 * At most one prompt is open at a time. Further calls that need one wait in
 * line, and each is re-evaluated against the state the previous answer left
 * — so after "allow" on the camera, a queued camera-only call goes through
 * without a second prompt.
 */
export class PermissionController {
  private readonly states: Record<MediaPermissionName, PermissionState> = {
    camera: "granted",
    microphone: "granted",
  };

  private readonly queue: PendingRequest[] = [];
  private readonly waiters: PromptWaiter[] = [];
  private readonly listeners = new Set<(name: MediaPermissionName) => void>();
  private prompt: PermissionPrompt | null = null;

  /** The prompt the head of the queue is waiting on, or null. */
  get openPrompt(): PermissionPrompt | null {
    return this.prompt;
  }

  state(name: MediaPermissionName): PermissionState {
    return this.states[name];
  }

  /** Changes a state, notifying subscribers only if the value changed. */
  set(name: MediaPermissionName, state: PermissionState): void {
    if (this.states[name] === state) {
      return;
    }
    this.states[name] = state;
    for (const listener of this.listeners) {
      listener(name);
    }
  }

  /** Calls `listener` with the name of every permission whose state changes. */
  subscribe(listener: (name: MediaPermissionName) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * The permission step of a `getUserMedia` call requesting `kinds`. Settles
   * at once when no prompt is needed; otherwise once the test answers.
   */
  request(kinds: PermissionPrompt): Promise<PermissionOutcome> {
    return new Promise((resolve) => {
      this.queue.push({ kinds: { ...kinds }, resolve });
      this.advance();
    });
  }

  /** Resolves with the open prompt, or with the next one to open. */
  waitForPrompt(): Promise<PermissionPrompt> {
    if (this.prompt) {
      return Promise.resolve({ ...this.prompt });
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Answers the open prompt the way the user would. */
  answer(answer: PermissionPromptAnswer): void {
    if (!ANSWERS.includes(answer)) {
      throw new TypeError(
        `Unknown permission prompt answer "${String(answer)}". Expected one of: ${ANSWERS.join(", ")}.`,
      );
    }

    const prompt = this.prompt;
    const head = this.queue[0];
    if (!prompt || !head) {
      throw new Error("No permission prompt is open");
    }

    this.prompt = null;
    this.queue.shift();

    if (answer !== "dismiss") {
      const state = answer === "allow" ? "granted" : "denied";
      for (const name of MEDIA_PERMISSION_NAMES) {
        if (prompt[name]) {
          this.set(name, state);
        }
      }
    }

    head.resolve(
      answer === "allow"
        ? "granted"
        : answer === "deny"
          ? "denied"
          : "dismissed",
    );
    this.advance();
  }

  /**
   * Back to the initial state: pending calls settle as "aborted", waiters
   * reject, both permissions are granted again. Subscribers are not told —
   * this is teardown, not a state change anyone is still watching.
   */
  reset(): void {
    this.prompt = null;
    for (const pending of this.queue.splice(0)) {
      pending.resolve("aborted");
    }
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(
        new Error(
          "MediaMock was unmocked while waiting for a permission prompt",
        ),
      );
    }
    this.states.camera = "granted";
    this.states.microphone = "granted";
  }

  /**
   * Settles queued calls that need no prompt, until one does — whose prompt
   * then opens — or the queue is empty.
   */
  private advance(): void {
    while (!this.prompt && this.queue.length > 0) {
      const head = this.queue[0];
      const requested = MEDIA_PERMISSION_NAMES.filter(
        (name) => head.kinds[name],
      );

      if (requested.some((name) => this.states[name] === "denied")) {
        this.queue.shift();
        head.resolve("denied");
        continue;
      }
      if (requested.every((name) => this.states[name] === "granted")) {
        this.queue.shift();
        head.resolve("granted");
        continue;
      }

      this.prompt = {
        camera: head.kinds.camera && this.states.camera === "prompt",
        microphone:
          head.kinds.microphone && this.states.microphone === "prompt",
      };
      for (const waiter of this.waiters.splice(0)) {
        waiter.resolve({ ...this.prompt });
      }
    }
  }
}
