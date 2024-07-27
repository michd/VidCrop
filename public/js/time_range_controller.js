import { ObservableEmitter, getMouseEventRatioPointInElement, PREVIEW_SELECT } from "./core.js";
import { constrainNumber, shouldProcessBubbledKeyEvent } from "./util.js";

const DRAGGING_CLASS = "dragging";

const ADJUSTMENT_STEP = {
    FINEST: 1,
    FINER: 2,
    FINE: 3,
    COARSE: 4,
    COARSER: 5,
    COARSEST: 6
};

Object.freeze(ADJUSTMENT_STEP);

const ADJUSTMENT_DIRECTION = {
    EARLIER: -1,
    LATER: 1
};

Object.freeze(ADJUSTMENT_DIRECTION);


function pad(i, l) {
    const diff = l - i.toString(10).length,
          padding = diff > 0 ? Array(diff + 1).join("0") : "";
    return `${padding}${i}`;
}

function formatDuration(timeMs) {
    let remaining = timeMs;

    const HOUR_MS = 1000 * 60 * 60,
          MIN_MS = 1000 * 60,
          SEC_MS = 1000;

    const hours = (remaining >= HOUR_MS) ? Math.floor(remaining / HOUR_MS) : 0;
    if (hours > 0) remaining -= (hours * HOUR_MS);

    const mins = (remaining >= MIN_MS) ? Math.floor(remaining / MIN_MS) : 0;
    if (mins > 0) remaining -= (mins * MIN_MS);

    const secs = (remaining >= SEC_MS) ? Math.floor(remaining / SEC_MS) : 0;
    if (secs > 0) remaining -= (secs * SEC_MS);

    const ms = remaining;

    return `${pad(hours, 2)}:${pad(mins, 2)}:${pad(secs, 2)}<span>.${pad(ms, 3)}</span>`;
}

class Adjustment {
    #direction;
    #step;

    constructor(direction, step) {
        this.#direction = direction;
        this.#step = step;
    }

    get direction() { return this.#direction }
    get step() { return this.#step }
}

class LoopPointsView {
    #$timeline;
    #$timespan;
    #$startMarker;
    #$endMarker;

    #startRatio = 0;
    #endRatio = 1;

    #startEmitter;
    #startClickEmitter;
    #rangeStartEmitter;
    #rangeClickEmitter;
    #endEmitter;
    #endClickEmitter;

    constructor($container, $pointerMoveContainer) {
        this.#$timeline = $container.querySelector(".timeline");
        this.#$timespan = $container.querySelector(".timespan");
        this.#$startMarker = $container.querySelector(".marker.start");
        this.#$endMarker = $container.querySelector(".marker.end");

        this.#startEmitter = new ObservableEmitter();
        this.#startClickEmitter = new ObservableEmitter();
        this.#rangeStartEmitter = new ObservableEmitter();
        this.#rangeClickEmitter = new ObservableEmitter();
        this.#endEmitter = new ObservableEmitter();
        this.#endClickEmitter = new ObservableEmitter();

        this.#setupMarkerUIListeners(
            this.#$startMarker,
            $pointerMoveContainer,
            this.#startEmitter,
            this.#startClickEmitter,
        );

        this.#setupMarkerUIListeners(
            this.#$endMarker,
            $pointerMoveContainer,
            this.#endEmitter,
            this.#endClickEmitter,
        );

        this.#setupTimespanUIListeners($pointerMoveContainer);
    }

    #setupMarkerUIListeners($marker, $pointerMoveContainer, changeEmitter, clickEmitter) {
        let isDragging = false;

        $marker.addEventListener("pointerdown", () => {
            isDragging = true;
            $pointerMoveContainer.classList.add(DRAGGING_CLASS);
            $marker.classList.add(DRAGGING_CLASS);
            clickEmitter.emit();
        });

        $pointerMoveContainer.addEventListener("pointermove", e => {
            if (!isDragging) return;
            const ratioX = getMouseEventRatioPointInElement(e, this.#$timeline).x;
            changeEmitter.emit(ratioX);
        });

        document.addEventListener("pointerup", () => {
            isDragging = false;
            $marker.classList.remove(DRAGGING_CLASS);
            $pointerMoveContainer.classList.remove(DRAGGING_CLASS);
        });
    }

    #setupTimespanUIListeners($pointerMoveContainer) {
        let isDragging = false;
        let lastOffsetPx;

        this.#$timespan.addEventListener("click", () => this.#rangeClickEmitter.emit());

        this.#$timespan.addEventListener("pointerdown", e => {
            isDragging = true;
            lastOffsetPx = e.pageX - this.#$timeline.offsetLeft;
            $pointerMoveContainer.classList.add(DRAGGING_CLASS);
            this.#$timespan.classList.add(DRAGGING_CLASS);
        });

        $pointerMoveContainer.addEventListener("pointermove", e => {
            if (!isDragging) return;
            const offsetPx = e.pageX - this.#$timeline.offsetLeft;
            const rangeDeltaPx = offsetPx - lastOffsetPx;
            const ratioDiff = constrainNumber(rangeDeltaPx / this.#$timeline.scrollWidth, -1, 1);
            lastOffsetPx = offsetPx;
            this.#rangeStartEmitter.emit(this.#startRatio +  ratioDiff);
        });

        document.addEventListener("pointerup", () => {
            isDragging = false;
            $pointerMoveContainer.classList.remove(DRAGGING_CLASS);
            this.#$timespan.classList.remove(DRAGGING_CLASS);
        });
    }

    #updateTimespan() {
        this.#$timespan.style.left = `${this.#startRatio * 100}%`;
        this.#$timespan.style.width = `calc(${this.#endRatio * 100 - this.#startRatio * 100}% - 2px)`;
    }

    set start(startRatio) {
        this.#startRatio = startRatio;
        this.#$startMarker.style.left = `${startRatio * 100}%`;
        this.#updateTimespan();
    }

    set end(endRatio) {
        this.#endRatio = endRatio;
        this.#$endMarker.style.left = `${endRatio * 100}%`;
        this.#updateTimespan();
    }

    get startDragged() { return this.#startEmitter.asReadOnly(); }
    get startClick() { return this.#startClickEmitter.asReadOnly(); }
    get timeSpanDragged() { return this.#rangeStartEmitter.asReadOnly(); }
    get timeSpanClick() { return this.#rangeClickEmitter.asReadOnly(); }
    get endDragged() { return this.#endEmitter.asReadOnly(); }
    get endClick() { return this.#endClickEmitter.asReadOnly(); }
}

class TimeTweakView {
    static get #EARLIER_CLASS() { return "earlier"; }
    static get #COARSE_CLASS() { return "coarse"; }

    #$output;
    
    #adjustmentEmitter;
    #clickEmitter;

    constructor($container) {
        this.#$output = $container.querySelector("output");
        this.#adjustmentEmitter = new ObservableEmitter();
        this.#clickEmitter = new ObservableEmitter();
        $container.querySelector("label").addEventListener("click", () => this.#clickEmitter.emit());
        
        const $menu = $container.querySelector("menu");

        if ($menu) {
            $menu.querySelectorAll("button").forEach ($b => {
                this.#initButtonHandler($b);
            });
        }
    }

    #initButtonHandler($b) {
        const direction = $b.classList.contains(TimeTweakView.#EARLIER_CLASS) ?
            ADJUSTMENT_DIRECTION.EARLIER :
            ADJUSTMENT_DIRECTION.LATER;

        const baseStep = $b.classList.contains(TimeTweakView.#COARSE_CLASS) ?
            ADJUSTMENT_STEP.COARSER :
            ADJUSTMENT_STEP.FINER;

        $b.addEventListener("click", (e) => {
            const step = baseStep + (e.ctrlKey ? -1 : (e.shiftKey ? 1 : 0));
            this.#adjustmentEmitter.emit(new Adjustment(direction, step));
            this.#clickEmitter.emit();
        });
    }

    get adjustmentMade() { return this.#adjustmentEmitter.asReadOnly(); }
    get click() { return this.#clickEmitter.asReadOnly(); }

    set timeMs(newTimeMs) {
        this.#$output.innerHTML = formatDuration(newTimeMs);
    }
}

export default class TimeRangeController {
    #$mainTimeOutput;
    #$progress;
    #loopPointsView;
    #startTimeTweakView;
    #timespanTimeTweakView;
    #endTimeTweakView;

    #durationMs;
    #formattedDuration = "";
    #currentTimeMs;
    #formattedCurrentTime = "";

    #startTimeMs = 0;
    #endTimeMs = 0;

    #currentTimeMsPicked = new ObservableEmitter();
    #startTimeMsPicked;
    #endTimeMsPicked;
    #rangeStartMsPicked;
    #previewSelectEmitter = new ObservableEmitter();

    constructor($container) {
        this.#$mainTimeOutput = $container.querySelector(".current_time_and_duration");
        this.#$progress = $container.querySelector("progress");

        this.#loopPointsView = new LoopPointsView($container.querySelector(".loop_points_view"), $container);

        const ratioToTime = ((ratio) => Math.floor(this.#durationMs * ratio)).bind(this);

        this.#loopPointsView.startClick.subscribe(() => this.#previewSelectEmitter.emit(PREVIEW_SELECT.START));
        this.#loopPointsView.endClick.subscribe(() => this.#previewSelectEmitter.emit(PREVIEW_SELECT.END));

        this.#startTimeMsPicked = this.#loopPointsView.startDragged.mapWritable(ratioToTime);
        this.#endTimeMsPicked = this.#loopPointsView.endDragged.mapWritable(ratioToTime);
        this.#rangeStartMsPicked = this.#loopPointsView.timeSpanDragged.mapWritable(ratioToTime);

        this.#startTimeTweakView = new TimeTweakView($container.querySelector(".time_tweak_view.start"));
        this.#timespanTimeTweakView = new TimeTweakView($container.querySelector(".time_tweak_view.timespan"));
        this.#endTimeTweakView = new TimeTweakView($container.querySelector(".time_tweak_view.end"));

        this.#startTimeTweakView.click.subscribe(() => this.#previewSelectEmitter.emit(PREVIEW_SELECT.START));
        this.#endTimeTweakView.click.subscribe(() => this.#previewSelectEmitter.emit(PREVIEW_SELECT.END));
        this.#timespanTimeTweakView.click.subscribe(() => this.#previewSelectEmitter.emit(PREVIEW_SELECT.TOGGLE));

        this.#setupProgressUIListeners();
        this.#setupTimeTweakViewUIListeners();
        this.#setupKeyboardListeners();
    }

    #setupProgressUIListeners() {
        const $p = this.#$progress;

        let isDraggingProgress = false;

        function onManualProgressMove(e) {
            const timeMs = Math.floor(getMouseEventRatioPointInElement(e, $p).x * this.#durationMs);
            this.#previewSelectEmitter.emit(PREVIEW_SELECT.NONE);
            this.#currentTimeMsPicked.emit(timeMs);
        }

        $p.addEventListener("click", onManualProgressMove.bind(this));
        $p.addEventListener("pointerdown", () => { isDraggingProgress = true; });

        $p.addEventListener("pointermove", (e) => {
            if (isDraggingProgress) {
                onManualProgressMove.bind(this)(e);
            }
        });

        document.addEventListener("pointerup", () => { isDraggingProgress = false; });
    }

    #setupTimeTweakViewUIListeners() {
        this.#startTimeTweakView.adjustmentMade.subscribe(adjustment => {
            const msDiff = this.#adjustmentToMsDiff(adjustment);
            this.#startTimeMsPicked.emitDirect(this.#startTimeMs +  msDiff);
        });

        this.#endTimeTweakView.adjustmentMade.subscribe(adjustment => {
            const msDiff = this.#adjustmentToMsDiff(adjustment);
            this.#endTimeMsPicked.emitDirect(this.#endTimeMs + msDiff);
        });
    }

    #setupKeyboardListeners() {
        document.addEventListener("keydown", (e) => {
            if (!shouldProcessBubbledKeyEvent(e)) return;

            switch (e.key) {
                case "s":
                    this.#startTimeMsPicked.emitDirect(this.#currentTimeMs);
                    this.#previewSelectEmitter.emit(PREVIEW_SELECT.START);
                    break;

                case "e":
                    this.#endTimeMsPicked.emitDirect(this.#currentTimeMs);
                    this.#previewSelectEmitter.emit(PREVIEW_SELECT.END);
                    break;

                case "ArrowLeft":
                    this.#currentTimeMsPicked.emit(
                        this.#currentTimeMs + this.#adjustmentToMsDiff(
                            new Adjustment(ADJUSTMENT_DIRECTION.EARLIER, ADJUSTMENT_STEP.COARSE)
                        )
                    );
                    break;
                case "ArrowRight":
                    this.#currentTimeMsPicked.emit(
                        this.#currentTimeMs + this.#adjustmentToMsDiff(
                            new Adjustment(ADJUSTMENT_DIRECTION.LATER, ADJUSTMENT_STEP.COARSE)
                        )
                    );
                    break;
                case ",":
                    this.#currentTimeMsPicked.emit(
                        this.#currentTimeMs + this.#adjustmentToMsDiff(
                            new Adjustment(ADJUSTMENT_DIRECTION.EARLIER, ADJUSTMENT_STEP.FINER)
                        )
                    );
                    break;
                case ".":
                    this.#currentTimeMsPicked.emit(
                        this.#currentTimeMs + this.#adjustmentToMsDiff(
                            new Adjustment(ADJUSTMENT_DIRECTION.LATER, ADJUSTMENT_STEP.FINER)
                        )
                    );
                    break;
            }
        });
    }

    #adjustmentToMsDiff(adjustment) {
        let dir = (adjustment.direction === ADJUSTMENT_DIRECTION.EARLIER) ? -1 : 1;

        switch (adjustment.step) {
            case ADJUSTMENT_STEP.COARSEST: return dir * 5 * 60 * 1000;
            case ADJUSTMENT_STEP.COARSER:  return dir * 60 * 1000;
            case ADJUSTMENT_STEP.COARSE:   return dir * 10 * 1000;
            case ADJUSTMENT_STEP.FINE:     return dir * 1000;
            case ADJUSTMENT_STEP.FINER:    return dir * 50;
            case ADJUSTMENT_STEP.FINEST:   return dir * 5;
            default:                       return 0;
        }
    }

    #updateMainTimeOutput() {
        this.#$mainTimeOutput.innerHTML = `${this.#formattedCurrentTime} / ${this.#formattedDuration}`;
    }

    set durationMs(newDurationMs) {
        if (this.#durationMs === newDurationMs) return;
        this.#durationMs = newDurationMs;
        this.#$progress.max = newDurationMs;
        this.#formattedDuration = formatDuration(this.#durationMs);
        this.#updateMainTimeOutput();
    }

    set currentTimeMs(newTimeMs) {
        if (this.#currentTimeMs === newTimeMs) return;
        this.#currentTimeMs = newTimeMs;
        this.#$progress.value = newTimeMs;
        this.#formattedCurrentTime = formatDuration(this.#currentTimeMs);
        this.#updateMainTimeOutput();
    }

    set timespan(timespan) {
        this.#startTimeMs = timespan.startTimeMs ?? 0;
        this.#endTimeMs = timespan.endTimeMs ?? 0;
        this.#loopPointsView.start = (timespan.startTimeMs ?? 0) / (Math.max(1, this.#durationMs ?? 1));
        this.#loopPointsView.end = (timespan.endTimeMs ?? 0) / (Math.max(1, this.#durationMs ?? 1));
        this.#startTimeTweakView.timeMs = timespan.startTimeMs;
        this.#endTimeTweakView.timeMs = timespan.endTimeMs;
        this.#timespanTimeTweakView.timeMs = timespan.durationMs;
    }

    get currentTimeMsPicked() { return this.#currentTimeMsPicked.asReadOnly(); }
    get startTimeMsPicked() { return this.#startTimeMsPicked.asReadOnly(); }
    get endTimeMsPicked() { return this.#endTimeMsPicked.asReadOnly(); }
    get rangeStartMsPicked() { return this.#rangeStartMsPicked.asReadOnly(); }
    get previewSelect() { return this.#previewSelectEmitter.asReadOnly(); }
}