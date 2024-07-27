import { lazy } from "./util.js";

export class Logger {
    #tag

    constructor(tag) {
        this.#tag = tag;
    }

    log() {
        const args = [`[${this.#tag}]`];
        args.push(...arguments);
        console.log(...args);
    }

    toString() { return `core.Logger(tag: ${this.#tag})`; }
}

export class ObservableProperty {
    #value;
    #observers = [];
    #customGetter;
    #customSetter;
    #logger;

    constructor(initialValue, customGetter, customSetter, logger) {
        this.#value = initialValue;
        this.#customGetter = customGetter;
        this.#customSetter = customSetter;
        this.#logger = logger;
    }

    set value(newValue) {
        const oldValue = this.value;

        if (typeof this.#customSetter === "function") {
            this.#customSetter(newValue);    
        } else {
            this.#value = newValue;
        }

        const updatedValue = this.value;

        if (oldValue != updatedValue) {
            this.#logger?.log(
                `Updated from ${oldValue} to ${newValue}, `+
                `notifying ${this.#observers.length} observer(s)`
            );

            this.#observers.forEach(o => o(updatedValue));
        }
    }

    get value() {
        if (typeof this.#customGetter === "function") {
            return this.#customGetter();
        }

        return this.#value;
    }

    subscribe(observer) {
        if (typeof observer !== "function") {
            throw new Error(`ObservableProperty.subscribe: observer must be a function, ${typeof observer} given.`);
        }

        if (this.#observers.indexOf(observer) !== -1) return;

        this.#observers.push(observer);
    }

    unsubscribe(observer) {
        const index = this.#observers.indexOf(observer);
        if (index === -1) return;
        this.#observers.splice(index, 1);
    }

    asReadOnly = lazy(() => new ReadOnlyObservableProperty(this));

    toString() {
        return `core.ObservableProperty(value: ${this.#value}, numObservers: ${this.#observers.length})`;
    }

    logWith(tag) {
        this.#logger = new Logger(tag);
        return this;
    }
}

class ReadOnlyObservableProperty {
    #property;

    constructor(mutableProperty) {
        this.#property = mutableProperty;
    }

    get value() {
        return this.#property.value;
    }

    subscribe(observer) { return this.#property.subscribe(observer); }
    unsubscribe(observer) { return this.#property.unsubscribe(observer); }

    toString() {
        return `core.ReadOnlyObservableProperty(property: ${this.#property})`
    }
}

export class ObservableEmitter {
    #observers = [];
    #logger;

    subscribe(observer) {
        if (typeof observer !== "function") {
            throw new Error(`ObservableEmitter.subscribe: observer must be a function, ${typeof observer} given.`);
        }

        if (this.#observers.indexOf(observer) !== -1) return;

        this.#observers.push(observer);
    }

    unsubscribe(observer) {
        const index = this.#observers.indexOf(observer);
        if (index === -1) return;
        this.#observers.splice(index, 1);
    }

    emit(payload) {
        this.#logger?.log(
            `Emitting ${payload} `+
            `to ${this.#observers.length} observer(s)`
        );

        this.#observers.forEach(o => o(payload));
    }

    asReadOnly = lazy(() => new ReadOnlyObservableEmitter(this));


    logWith(tag) {
        this.#logger = new Logger(tag);
        return this;
    }

    toString() {
        return `core.ObservableEmitter(numObservers: ${observers.length})`
    }
}

class MappedObservableEmitter {
    #originalEmitter;
    #observerMappings = [];
    #adapter;

    constructor(originalEmitter, adapter) {
        this.#originalEmitter = originalEmitter;
        this.#adapter = adapter;
    }

    #findObserverMapping(observer) {
        return this.#observerMappings.find(m => m.originalObserver === observer);
    }

    subscribe(observer) {
        if (typeof observer !== "function") {
            throw new Error(
                `MappedObservableEmitter.subscribe: observer must be a function, ${typeof observer} given.`
            );
        }

        if (this.#findObserverMapping(observer)) return; // already subbed

        const adaptedObserver = inputValue => observer(this.#adapter(inputValue));

        this.#observerMappings.push({
            originalObserver: observer,
            adaptedObserver: adaptedObserver
        });

        this.#originalEmitter.subscribe(adaptedObserver);
    }

    unsubscribe(observer) {
        const mapping = this.#findObserverMapping(observer);

        if (!mapping) return;

        this.#originalEmitter.unsubscribe(mapping.adaptedObserver);
        const index = this.#observerMappings.indexOf(mapping);
        this.#observerMappings.splice(index, 1);
    }

    emitDirect(value) {
        this.#observerMappings.forEach(mapping => {
            mapping.originalObserver(value);
        });
    }

    emitMapped(value) {
        this.#observerMappings.forEach(mapping => {
            mapping.adaptedObserver(value);
        });
    }

    asReadOnly = lazy(() => new ReadOnlyObservableEmitter(this));
}

class ReadOnlyObservableEmitter {
    #emitter;

    constructor(mutableEmitter) {
        this.#emitter = mutableEmitter;
    }

    subscribe(observer) { return this.#emitter.subscribe(observer); }
    unsubscribe(observer) { return this.#emitter.unsubscribe(observer); }

    map(mapFunc) { return this.mapWritable(mapFunc).asReadOnly(); }
    mapWritable(mapFunc) { return new MappedObservableEmitter(this, mapFunc); }

    toString() {
        return `core.ReadOnlyObservableEmitter`
    }
}

export class Point {
    x;
    y;

    constructor(x, y) {
        this.x = x ?? 0;
        this.y = y ?? 0;
    }

    static forMouseEvent(e) {
        return new Point(e.pageX, e.pageY);
    }

    minus(other) {
        return new Point(this.x - other.x, this.y - other.y);
    }

    plus(other) {
        return new Point(this.x + other.x, this.y + other.y);
    }

    clone() {
        return new Point(this.x, this.y);
    }

    measureDistanceTo(other) {
        const xDist = Math.abs(this.x - other.x),
              yDist = Math.abs(this.y - other.y);
        return Math.sqrt(xDist * xDist + yDist * yDist);
    }

    equals(other) {
        return this.x === other.x && this.y === other.y;
    }

    toString() { return `core.Point(x: ${this.x}, y: ${this.y})`; }
}

export class Size {
    width;
    height;

    constructor(width, height) {
        this.width = width ?? 0;
        this.height = height ?? 0;
    }

    scaled(ratio) {
        return Size(this.width * ratio, this.height * ratio);
    }

    minus(other) {
        return new Size(this.width - other.width, this.height - other.height);
    }

    plus(other) {
        return new Size(this.width + other.width, this.height + other.height);
    }

    clone() {
        return new Size(this.width, this.height);
    }

    equals(other) {
        return this.width === other.width && this.height === other.height;
    }

    toString() { return `core.Size(width: ${this.width}, height: ${this.height})`; }
}

export class Rect {
    position;
    size;

    constructor(position, size) {
        this.position = position ?? new Point();
        this.size = size ?? new Size();
    }

    static squareAround(centerPoint, size) {
        return new Rect(
            new Point(centerPoint.x - size / 2, centerPoint.y - size / 2),
            new Size(size, size)
        );
    }

    static forElement($el) {
        let domRect = $el.getBoundingClientRect();

        return new Rect(
            new Point(Math.round(domRect.left + window.scrollX), Math.round(domRect.top + window.scrollY)),
            new Size(Math.floor($el.scrollWidth), Math.floor($el.scrollHeight))
        );
    }

    get x() { return this.position?.x ?? 0; }
    get left() { return this.x; }
    get right() { return this.x + this.width; }

    set x(newX) {
        if(this.position) {
            this.position.x = newX;       
        } else {
            this.position = new Point(newX, 0);
        }
    }

    get y() { return this.position?.y ?? 0; }
    get top() { return this.y; }
    get bottom() { return this.y + this.height; }

    get topLeft() { return this.position.clone(); }
    get topRight() { return new Point(this.right, this.y); }
    get bottomRight() { return new Point(this.right, this.bottom); }
    get bottomLeft() { return new Point(this.left, this.bottom); }

    get center() {
        return new Point(this.left + this.width / 2, this.top + this.height / 2);
    }

    get topEdge() {
        return new Rect(
            new Point(this.left, this.top),
            new Size(this.width, 0)
        );
    }

    get rightEdge() {
        return new Rect(
            new Point(this.right, this.top),
            new Size(0, this.height)
        );
    }

    get bottomEdge() {
        return new Rect(
            new Point(this.left, this.bottom),
            new Size(this.width, 0)
        );
    }

    get leftEdge() {
        return new Rect(
            new Point(this.left, this.top),
            new Size(0, this.height)
        );
    }

    set y(newY) {
        if (this.position) {
            this.position.y = newY;
        } else {
            this.position = new Point(0, newY);
        }
    }

    get width() { return this.size?.width ?? 0; }

    set width(newWidth) {
        if (this.size) {
            this.size.width = newWidth;
        } else {
            this.size = new Size(newWidth, 0);
        }
    }

    get height() { return this.size?.height ?? 0; }

    set height(newHeight) {
        if (this.size) {
            this.size.height = newHeight;
        } else {
            this.size = new Size(0, newHeight);
        }
    }

    containsPoint(point) {
        return point.x >= this.left &&
               point.x < this.right &&
               point.y >= this.top &&
               point.y < this.bottom;
    }

    getRatioPoint(point) {
        const xRatio = (point.x - this.left) / this.width;
        const yRatio = (point.y - this.top) / this.height;
        return new Point(xRatio, yRatio);
    }

    inset(distance) {
        return new Rect(
            this.position.plus(new Point(distance, distance)),
            this.size.minus(new Size(distance * 2, distance * 2))
        );
    }

    outset(distance) {
        return new Rect(
            this.position.minus(new Point(distance, distance)),
            this.size.plus(new Size(distance * 2, distance * 2))
        );
    }

    toRatioRect(containerSize) {
        const cW = containerSize.width,
              cH = containerSize.height;

        return new Rect(
            new Point(this.x / cW, this.y / cH),
            new Size(this.width / cW, this.height / cH)
        );
    }

    toPixelRect(containerSize) {
        const cW = containerSize.width,
              cH = containerSize.height;

        return new Rect(
            new Point(Math.round(this.x * cW), Math.round(this.y * cH)),
            new Size(Math.round(this.width * cW), Math.round(this.height * cH))
        );
    }

    equals(other) {
        return this.position.equals(other.position) && this.size.equals(other.size);
    }

    clone() {
        return new Rect(this.position.clone(), this.size.clone());
    }

    toString() {
        return `core.Rect(position: ${this.position}, size: ${this.size})`
    }
}

export class TimeRange {
    startTimeMs;
    endTimeMs;

    constructor(startTimeMs, endTimeMs) {
        this.startTimeMs = startTimeMs ?? 0;
        this.endTimeMs = endTimeMs ?? 0;
    }

    get durationMs() {
        return this.endTimeMs - this.startTimeMs;
    }

    plusTimeMs(timeMs) {
        return TimeRange(this.startTimeMs + timeMs, this.endTimeMs);
    }

    isInRange(otherRange) {
        return this.startTimeMs >= otherRange.startTimeMs && this.endTimeMs <= otherRange.endTimeMs;
    }

    toString() {
        return `core.TimeRange(startTimeMs: ${startTimeMs}, endTimeMs: ${endTimeMs})`;
    }
}

export class FFmpegCommand {
    inputFilename;
    outputFilename;
    trim;
    filterGraph;
    additionalArgs;

    get argsArray() {
        const arr = [
            "-i",
            this.inputFilename
        ];

        if (this.trim) {
            arr.push("-ss", `${this.trim.startTimeMs / 1000}`);
            arr.push("-t", `${this.trim.durationMs / 1000}`);
        }

        if (this.filterGraph) {
            arr.push("-vf", this.filterGraph);
        }

        if (this.additionalArgs) {
            arr.push(...(this.additionalArgs))
        }

        arr.push(this.outputFilename);
        return arr;
    }

    get commandStr() {
        const convertedArgs = this.argsArray.map(item => {
            if (typeof item === "string") {
                return `"${item}"`;
            } else {
                return item.toString();
            }
        });

        const arr = ["ffmpeg"];
        arr.push(...convertedArgs);
        return arr.join(" ");
    }
}

export class FileCommand {
    baseCommand;
    args;

    get argsArray() {
        return this.args;
    }

    get commandStr() {
        const convertedArgs = this.argsArray.map(item => {
            if (typeof item === "string") {
                return `"${item}"`
            } else {
                return item
            }
        });

        const arr = [this.baseCommand];
        arr.push(...convertedArgs);
        return arr.join(" ");
    }
}

export const PREVIEW_SELECT = {
    START: "PREVIEW_START",
    END: "PREVIEW_END",
    TOGGLE: "PREVIEW_TOGGLE",
    NONE: "PREVIEW_NONE"
};

Object.freeze(PREVIEW_SELECT);

export function getMouseEventRatioPointInElement(e, $el) {
    return Rect.forElement($el).getRatioPoint(Point.forMouseEvent(e));
}

export function getMouseEventPointInElement(e, $el) {
    return Point.forMouseEvent(e).minus(Rect.forElement($el).position);
}

export default {
    Logger,
    ObservableProperty,
    ObservableEmitter,
    Point,
    Size,
    Rect,
    TimeRange,
    FFmpegCommand,
    FileCommand,
    PREVIEW_SELECT,
    getMouseEventPointInElement,
    getMouseEventRatioPointInElement
};