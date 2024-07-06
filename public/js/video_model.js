(function (global) {

const ObservableProperty = global.core.ObservableProperty,
      Point = global.core.Point,
      Size = global.core.Size,
      Rect = global.core.Rect,
      TimeRange = global.core.TimeRange,
      constrainNumber = global.util.constrainNumber;

global.VideoModel = class {

    static VideoProperties = class {
        filename = null;
        size =  null;
        durationMs = null;

        constructor(filename, size, durationMs) {
            this.filename = filename ?? null;
            this.size = size ?? null;
            this.durationMs = durationMs ?? null;
        }

        toString() {
            return `VideoModel.VideoProperties(` +
                `filename: ${this.filename}, ` +
                `size: ${this.size}, ` +
                `durationMs: ${this.durationMs}` +
            `)`;
        }

        get [Symbol.toStringTag]() { return "VideoModel.VideoProperties"; }
    };

    static get MIN_TIMESPAN_MS() { return 100; }
    static get MIN_DIMENSION() { return 24; }

    #filename;
    #size;
    #durationMs;
    #crop;
    #trim;

    constructor() {
        this.#filename = new ObservableProperty(null);
        this.#size = new ObservableProperty(new Size());
        this.#durationMs = new ObservableProperty(0);
        this.#crop = new ObservableProperty(new Rect());
        this.#trim = new ObservableProperty(new TimeRange());
    }

    get filename() { return this.#filename.asReadOnly(); }
    get size() { return this.#size.asReadOnly(); }
    get durationMs() { return this.#durationMs.asReadOnly(); }
    get crop() { return this.#crop.asReadOnly(); }
    get trim() { return this.#trim.asReadOnly(); }

    set properties(props) {
        this.#filename.value = props.filename;
        this.#size.value = props.size;
        this.#durationMs.value = props.durationMs;
        this.#crop.value = new Rect(new Point(), this.#size.value.clone());
        this.#trim.value = new TimeRange(0, props.durationMs);
    }

    // Allows nudging endMs if it too close
    set startTimeMs(newStartTimeMs) {
        const durationMs = this.#durationMs.value;
        let endTimeMs = this.#trim.value.endTimeMs;
        newStartTimeMs = constrainNumber(newStartTimeMs, 0, durationMs);

        if (endTimeMs - newStartTimeMs < VideoModel.MIN_TIMESPAN_MS) {
            endTimeMs = constrainNumber(newStartTimeMs + VideoModel.MIN_TIMESPAN_MS, 0, durationMs);
            newStartTimeMs = constrainNumber(endTimeMs - VideoModel.MIN_TIMESPAN_MS, 0, durationMs);
        }

        this.#trim.value = new TimeRange(newStartTimeMs, endTimeMs);
    }

    set endTimeMs(newEndTimeMs) {
        const durationMs = this.#durationMs.value;
        let startTimeMs = this.#trim.value.startTimeMs;
        newEndTimeMs = constrainNumber(newEndTimeMs, 0, durationMs);

        if (newEndTimeMs - startTimeMs < VideoModel.MIN_TIMESPAN_MS) {
            startTimeMs = constrainNumber(newEndTimeMs - VideoModel.MIN_TIMESPAN_MS, 0, durationMs);
            newEndTimeMs = constrainNumber(startTimeMs + VideoModel.MIN_TIMESPAN_MS, 0, durationMs);
        }

        this.#trim.value = new TimeRange(startTimeMs, newEndTimeMs);
    }

    set spanStartMs(newStartTimeMs) {
        const durationMs = this.#durationMs.value;
        const spanDurationMs = this.#trim.value.durationMs;
    
        newStartTimeMs = constrainNumber(newStartTimeMs, 0, durationMs - spanDurationMs);

        this.#trim.value = new TimeRange(newStartTimeMs, newStartTimeMs + spanDurationMs);
    }

    get isModified() {
        if (this.#filename.value === null) return false;
        if (!this.#crop.value.position.equals(new Point())) return true;
        if (!this.#crop.value.size.equals(this.#size.value)) return true;
        if (this.#trim.value.startTimeMs !== 0) return true;
        if (this.#trim.value.endTimeMs !== this.#durationMs.value) return true;
        return false;
    }

    updateCrop(ratioCrop, preserveSize) {
        const MIN_DIM = VideoModel.MIN_DIMENSION,
              videoSize = this.#size.value.clone(),
              rawPixelCrop = ratioCrop.toPixelRect(videoSize);

        const limitedCrop = rawPixelCrop.clone();

        limitedCrop.position = new Point(
            constrainNumber(rawPixelCrop.x, 0, videoSize.width - MIN_DIM),
            constrainNumber(rawPixelCrop.y, 0, videoSize.height - MIN_DIM)
        );

        const posDiff = limitedCrop.position.minus(rawPixelCrop.position);

        limitedCrop.size = new Size(
            constrainNumber(rawPixelCrop.width - posDiff.x, MIN_DIM, videoSize.width - limitedCrop.x),
            constrainNumber(rawPixelCrop.height - posDiff.y, MIN_DIM, videoSize.height - limitedCrop.y)
        );

        if (preserveSize) {
            const absoluteConstrainedSize = new Size(
                constrainNumber(rawPixelCrop.width, MIN_DIM, videoSize.width),
                constrainNumber(rawPixelCrop.height, MIN_DIM, videoSize.height)
            );

            const sizeDiff = absoluteConstrainedSize.minus(limitedCrop.size);

            if (Math.abs(sizeDiff.width) > 0) {
                limitedCrop.x = constrainNumber(limitedCrop.x - sizeDiff.width, 0, videoSize.width - MIN_DIM);
                limitedCrop.width = constrainNumber(
                    absoluteConstrainedSize.width,
                    MIN_DIM,
                    videoSize.width - limitedCrop.x
                );
            }

            if (Math.abs(sizeDiff.height) > 0) {
                limitedCrop.y = constrainNumber(limitedCrop.y - sizeDiff.height, 0, videoSize.height - MIN_DIM);
                limitedCrop.height = constrainNumber(
                    absoluteConstrainedSize.height,
                    MIN_DIM,
                    videoSize.height - limitedCrop.y
                );
            }
        }

        this.#crop.value = limitedCrop;
    }

    clear() {
        this.#filename.value = null;
        this.#size.value = new Size();
        this.#durationMs.value = 0;
        this.#crop.value = new Rect();
        this.#trim.value = new TimeRange();
    }

    get [Symbol.toStringTag]() { return "VideoModel"; }
};

}(window));