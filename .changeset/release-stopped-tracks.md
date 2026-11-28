---
"@eatsjobs/media-mock": patch
---

Release a track once the app stops it. Since 2.6.0 the mock remembered every track it handed out until the track fired `ended`, but `stop()` fires no `ended` event, so each stopped track, its canvas and its `ended` listener stayed in memory until `unmock()`. A page that starts and stops the camera repeatedly grew by one canvas and one listener per cycle.
