import {
    ObservableProperty, ObservableEmitter,
    Size, TimeRange,
    PREVIEW_SELECT
} from "./core.js";

import { constrainNumber } from "./util.js";

class InterpolatedTime {
    active;
    maxTimeMs;
    #lastTimeMs;
    #lastUpdateTimestamp;
    #animationFrameRequest;

    constructor() {
        this.active = false;
        this.#lastTimeMs = new ObservableProperty(null);
        this.#lastUpdateTimestamp = null;
    }

    #interpolateTime(timestamp) {
        if (!this.active) return;
        if (this.#lastTimeMs.value === null) return;

        if (this.#lastUpdateTimestamp === null) {
            this.#requestUpdate();
            return;
        }

        const diff = Math.floor(timestamp - this.#lastUpdateTimestamp);
        this.#lastUpdateTimestamp = timestamp;
        this.#lastTimeMs.value = constrainNumber(this.#lastTimeMs.value + diff, 0, this.maxTimeMs);
        this.#requestUpdate();
    }

    #requestUpdate() {
        this.#animationFrameRequest = requestAnimationFrame(
            (timestamp) => this.#interpolateTime(timestamp)
        );
    }

    #cancelUpdate() { cancelAnimationFrame(this.#animationFrameRequest); }

    set timeMs(newTimeMs) {
        this.#cancelUpdate();
        const now = document.timeline.currentTime;
        this.#lastTimeMs.value = constrainNumber(Math.floor(newTimeMs), 0, this.maxTimeMs);
        this.#lastUpdateTimestamp = now;
        this.#requestUpdate();
    }

    get timeMs() {
        return this.#lastTimeMs;
    }

    reset() {
        this.active = false;
        this.#lastTimeMs.value = 0;
        this.#lastUpdateTimestamp = null;
    }
}

export default class VideoView {
    #source;
    #$video;

    #videoDurationMs;
    #videoSize;
    #playing;
    #muted;
    #loadedMetadata;
    #loopTimeRange;

    #interpolatedTime;
    #restartPending;

    #preview = new ObservableProperty(PREVIEW_SELECT.NONE);
    #error = new ObservableEmitter();

    constructor($video) {
        this.#$video = $video;
        this.#videoDurationMs = new ObservableProperty(0);
        this.#videoSize = new ObservableProperty(new Size());
        this.#playing = new ObservableProperty(false);
        this.#muted = new ObservableProperty(true);
        this.#loadedMetadata = new ObservableEmitter();
        this.#loopTimeRange = new ObservableProperty(null);
        this.#interpolatedTime = new InterpolatedTime();
        this.#restartPending = false;

        const $v = this.#$video;

        $v.addEventListener("loadedmetadata", this.#videoOnLoadedMetaData.bind(this));
        $v.addEventListener("error", this.#videoOnError.bind(this));
        $v.addEventListener("timeupdate", this.#videoOnTimeUpdate.bind(this));
        $v.addEventListener("volumechange", this.#videoOnVolumeChange.bind(this));
        $v.addEventListener("play", this.#videoOnPlay.bind(this));
        $v.addEventListener("pause", this.#videoOnPause.bind(this));
        this.#interpolatedTime.timeMs.subscribe(this.#onTimeUpdate.bind(this));
    }

    #videoOnLoadedMetaData() {
        const $v = this.#$video;
        const wasPlaying = this.playing.value;
        $v.pause();

        this.#interpolatedTime.reset();
        this.#videoDurationMs.value = Math.floor($v.duration * 1000);
        this.#interpolatedTime.maxTimeMs = this.#videoDurationMs.value;
        this.#videoSize.value = new Size($v.videoWidth, $v.videoHeight);
        this.#loopTimeRange.value = null;
        this.#restartPending = false;
        this.#interpolatedTime.timeMs.value = 0;
        this.#loadedMetadata.emit();

        if (wasPlaying) {
            $v.play();
        }
    }

    #videoOnError(err) {
        let msg;

        // See https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code#media_error_code_constants
        switch (this.#$video.error?.code) {
            case 1:
                msg = "Loading was aborted."
                break;
            case 2:
                // Well since this doesn't do network ops, should be unlikely.
                msg = "Network error occurred."
                break;
            case 3:
                msg = "Unable to decode file."
                break;
            case 4:
                msg = "Media source not supported."
                break;
            default:
                msg = "Unknown error loading file."
                break;
        }

        this.#error.emit(msg);
    }

    #videoOnTimeUpdate() {
        this.#interpolatedTime.timeMs = Math.floor(this.#$video.currentTime * 1000);
    }

    #videoOnVolumeChange() { this.#muted.value = this.#$video.muted; }

    #videoOnPlay() {
        this.#playing.value = true;
        this.#interpolatedTime.active = true;
        this.#preview.value = PREVIEW_SELECT.NONE;
        this.#updatePreview();
    }

    #videoOnPause() {
        this.#playing.value = false;
        this.#interpolatedTime.active = false;
    }

    #onTimeUpdate(timeMs) {
        const loopTimeRange = this.#loopTimeRange.value;
        if (!loopTimeRange) return;

        if (this.#playing.value && !this.#restartPending && timeMs >= loopTimeRange.endTimeMs) {
            this.#restartPending = true;
            this.#$video.pause();
            this.#$video.currentTime = loopTimeRange.startTimeMs / 1000;
            this.#interpolatedTime.timeMs = loopTimeRange.startTimeMs;
            this.#$video.play();
        } else if (this.#restartPending) {
            this.#restartPending = false;
            this.#$video.play();
        }
    }

    #updatePreview() {
        const loopTimeRange = this.#loopTimeRange.value;
        if (!loopTimeRange) return;

        if (this.#preview.value === PREVIEW_SELECT.START) {
            this.currentTimeMs = loopTimeRange.startTimeMs;
        } else if (this.#preview.value === PREVIEW_SELECT.END) {
            this.currentTimeMs = loopTimeRange.endTimeMs;
        }
    }

    set source(newSource) {
        if (this.#source === newSource) return;

        this.#source = newSource;
        this.#$video.src = newSource;
    }

    get currentTimeMs() { return this.#interpolatedTime.timeMs.asReadOnly(); }

    set currentTimeMs(newTimeMs) {
        this.#$video.currentTime = constrainNumber(newTimeMs, 0, this.#videoDurationMs.value) / 1000;
    }

    get videoDurationMs() { return this.#videoDurationMs.asReadOnly(); }
    get videoSize() { return this.#videoSize.asReadOnly(); }
    get playing() { return this.#playing.asReadOnly(); }
    get loadedMetadata() { return this.#loadedMetadata.asReadOnly(); }

    get muted() { return this.#muted.asReadOnly(); }
    set muted(nowMuted) {
        this.#$video.muted = nowMuted;
    }

    get preview() { return this.#preview.asReadOnly(); }
    get error() { return this.#error.asReadOnly(); }

    toggleMute() {
        this.#$video.muted = !this.#$video.muted;
    }

    set loopTimeRange(timeRange) {
        this.#loopTimeRange.value = new TimeRange(
            constrainNumber(timeRange.startTimeMs, 0, this.#videoDurationMs.value),
            constrainNumber(timeRange.endTimeMs, 0, this.#videoDurationMs.value)
        );
        this.#updatePreview();
    }

    togglePlayPause() {
        if (this.#playing.value) {
            this.pause();
        } else {
            this.play();
        }
    }

    play() { this.#$video.play(); }
    pause() { this.#$video.pause(); }

    selectPreview(preview) {
        if (this.#playing.value) return;

        switch (preview) {
            case PREVIEW_SELECT.START:
            case PREVIEW_SELECT.END:
            case PREVIEW_SELECT.NONE:
                this.#preview.value = preview;
                break;

            case PREVIEW_SELECT.TOGGLE:
                if (this.#preview.value === PREVIEW_SELECT.END) {
                    this.#preview.value = PREVIEW_SELECT.START;
                } else {
                    this.#preview.value = PREVIEW_SELECT.END;
                }
                break;

            default:
                this.#preview.value = preview;
                break;
        }

        this.#updatePreview();
    }
}