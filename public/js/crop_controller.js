(function(global) {

const Rect = global.core.Rect,
      Size = global.core.Size,
      Point = global.core.Point,
      PREVIEW_SELECT = global.core.PREVIEW_SELECT,
      ObservableEmitter = global.core.ObservableEmitter,
      getMouseEventPointInElement = global.core.getMouseEventPointInElement;

const ACTIVE_CLASS = "active",
      DRAGGING_CLASS = "dragging",
      PREVIEW_START_CLASS = "preview_start",
      PREVIEW_END_CLASS = "preview_end";

const POINT_GRAB_SIZE = 20,
      LINE_GRAB_SIZE = 10;

const ANCHOR_CLASS = "anchor";
const ANCHOR_TOP_LEFT = "top_left",
      ANCHOR_TOP_RIGHT = "top_right",
      ANCHOR_BOTTOM_LEFT = "bottom_left",
      ANCHOR_BOTTOM_RIGHT = "bottom_right",
      ANCHOR_TOP = "top",
      ANCHOR_BOTTOM = "bottom",
      ANCHOR_LEFT = "left",
      ANCHOR_RIGHT = "right",
      ANCHOR_RECT = "rect";

const ANCHORS = [
      ANCHOR_TOP_LEFT,
      ANCHOR_TOP_RIGHT,
      ANCHOR_BOTTOM_LEFT,
      ANCHOR_BOTTOM_RIGHT,
      ANCHOR_TOP,
      ANCHOR_BOTTOM,
      ANCHOR_LEFT,
      ANCHOR_RIGHT,
      ANCHOR_RECT
];


class RenderContextWrapper {
    ctx;
    #containerRect;

    constructor(ctx, containerRect) {
        this.ctx = ctx;
        this.#containerRect = containerRect;
    }

    fillRect(rect) {
        const pos = rect.position.plus(this.#containerRect.position);

        this.ctx.fillRect(
            pos.x,
            pos.y,
            rect.width,
            rect.height
        );
    }

    strokeRect(rect) {
        const pos = rect.position.plus(this.#containerRect.position);

        this.ctx.strokeRect(
            pos.x,
            pos.y,
            rect.width,
            rect.height
        );
    }

    circle(centerPoint, radius) {
        const pos = centerPoint.plus(this.#containerRect.position);
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    circles(points, radius) {
        points.forEach(p => this.circle(p, radius));
    }
}

class AnchorZone {
    key;
    rect;

    constructor(key, rect) {
        this.key = key;
        this.rect = rect;
    }
}

global.CropController = class {
    #$container;
    #$cropToggleButton;
    #$canvas;
    #$videoSizeDd;
    #$videoCropDd;
    #insetPx;
    #drawRegion = null;
    #cropRect = null;
    #cropResizeEmitter;
    #cropMoveEmitter;

    #editorActive = false;
    #activeAnchorKey = null;

    #anchorZones = null;
    #isDragging = false;
    #dragOrigin = null;
    #dragOriginOffset = null;

    #onPointerDownHandler = this.#onPointerDown.bind(this)
    #onPointerMoveHandler = this.#onPointerMove.bind(this)
    #onPointerUpHandler = this.#onPointerUp.bind(this)

    constructor($container) {
        this.#$container = $container;
        this.#$cropToggleButton = $container.querySelector("#crop_editor_toggle_button");
        this.#$canvas = $container.querySelector("canvas");
        this.#$videoSizeDd = $container.querySelector("dd.video_size");
        this.#$videoCropDd = $container.querySelector("dd.video_crop");

        this.#cropResizeEmitter = new ObservableEmitter();
        this.#cropMoveEmitter = new ObservableEmitter();

        const $video = $container.querySelector("video");
        const style = getComputedStyle($video);
        this.#insetPx = parseFloat(style.padding, 10) + parseFloat(style.borderWidth, 10);
        this.#recalculate();


        this.#$cropToggleButton.addEventListener("click", this.#toggleEditor.bind(this));

        $container.querySelector("#crop_reset_button").addEventListener(
            "click",
             this.#askToResetCrop.bind(this)
        );

        new ResizeObserver(this.#recalculate.bind(this)).observe(this.#$canvas);
    }

    #toggleEditor() {
        this.#editorActive = !this.#editorActive;
        this.#$cropToggleButton.classList.toggle(ACTIVE_CLASS, this.#editorActive);

        if (!this.#editorActive) this.#anchorKey = null;
        this.#togglePointerListeners(this.#editorActive);
        this.#drawCrop();
    }

    set #anchorKey(newAnchorKey) {
        if (this.#activeAnchorKey === newAnchorKey) return;
        this.#activeAnchorKey = newAnchorKey;
        this.#$canvas.classList.toggle(ANCHOR_CLASS, newAnchorKey !== null);
        ANCHORS.forEach(a => this.#$canvas.classList.toggle(a, newAnchorKey === a));
    }

    get #crop() {
        return this.#cropRect;
    }

    set #crop(newCrop) {
        if (this.#cropRect && this.#cropRect.equals(newCrop)) return;
        this.#cropRect = newCrop;
        this.#anchorZones = null;
        this.#drawCrop();
    }

    #askToResetCrop() {
        if (window.confirm("Reset crop to default?")) {
            this.#resetCrop();
        }
    }

    #calcDrawRegion() {
        this.#drawRegion = new Rect(
            new Point(),
            Rect.forElement(this.#$canvas).size
        ).inset(this.#insetPx);
    }

    #resetCrop() {
        this.#calcDrawRegion();
        this.#crop = new Rect(new Point(), this.#drawRegion.size);
        this.#emitCropResize(this.#crop);
    }

    #recalculate() {
        if (this.#drawRegion === null) {
            this.#resetCrop();
            return;
        }
        
        const ratioCrop = this.#crop.toRatioRect(this.#drawRegion.size);
        this.#calcDrawRegion();
        this.#crop = ratioCrop.toPixelRect(this.#drawRegion.size)
    }

    #getRegionPosition(e) {
        const canvasPosition = getMouseEventPointInElement(e, this.#$canvas);
        return canvasPosition.minus(this.#drawRegion.position);

    }

    #togglePointerListeners(enabled) {
        if (enabled) {
            this.#$canvas.addEventListener("pointermove", this.#onPointerMoveHandler);
            this.#$canvas.addEventListener("pointerdown", this.#onPointerDownHandler);
            document.addEventListener("pointerup", this.#onPointerUpHandler);
        } else {
            this.#$canvas.removeEventListener("pointermove", this.#onPointerMoveHandler);
            this.#$canvas.removeEventListener("pointerdown", this.#onPointerDownHandler);
            document.removeEventListener("pointerup", this.#onPointerUpHandler);
        }
    }

    #onPointerDown(e) {
        const pos = this.#getRegionPosition(e);
        const anchor = this.#getAnchorAt(pos);
        if (!anchor) return;

        this.#anchorKey = anchor?.key ?? null;

        this.#dragOrigin = anchor.rect.center;

        if (anchor.key === ANCHOR_RECT) {
            this.#dragOriginOffset = anchor.rect.center.minus(pos);
        }

        this.#isDragging = true;
        this.#$canvas.classList.add(DRAGGING_CLASS);
        this.#drawCrop();
    }

    #onPointerMove(e) {
        const pos = this.#getRegionPosition(e);
        e.preventDefault();

        if (!this.#isDragging) {
            const anchor = this.#getAnchorAt(pos);
            this.#anchorKey = anchor?.key ?? null;
        } else if (this.#activeAnchorKey) {
            this.#calculateAndEmitUpdatedCrop(pos.minus(this.#dragOrigin));
        }
    }

    #onPointerUp(e) {
        if (this.#isDragging) {
            this.#isDragging = false;
            this.#$canvas.classList.remove(DRAGGING_CLASS);
            this.#dragOrigin = null;
            this.#dragOriginOffset = null;
            this.#drawCrop();
        }
    }

    #buildAnchorZonesIfNeeded() {
        const cr = this.#crop;

        if (cr === null || this.#anchorZones !== null) return;

        this.#anchorZones = [
            new AnchorZone(ANCHOR_TOP_LEFT, Rect.squareAround(cr.topLeft, POINT_GRAB_SIZE)),
            new AnchorZone(ANCHOR_TOP_RIGHT, Rect.squareAround(cr.topRight, POINT_GRAB_SIZE)),
            new AnchorZone(ANCHOR_BOTTOM_RIGHT, Rect.squareAround(cr.bottomRight, POINT_GRAB_SIZE)),
            new AnchorZone(ANCHOR_BOTTOM_LEFT, Rect.squareAround(cr.bottomLeft, POINT_GRAB_SIZE)),
            new AnchorZone(ANCHOR_TOP, cr.topEdge.outset(LINE_GRAB_SIZE / 2)),
            new AnchorZone(ANCHOR_RIGHT, cr.rightEdge.outset(LINE_GRAB_SIZE / 2)),
            new AnchorZone(ANCHOR_BOTTOM, cr.bottomEdge.outset(LINE_GRAB_SIZE / 2)),
            new AnchorZone(ANCHOR_LEFT, cr.leftEdge.outset(LINE_GRAB_SIZE / 2)),
            new AnchorZone(ANCHOR_RECT, cr)
        ];
    }

    #getAnchorAt(regionPosition) {
        const pos = regionPosition;

        this.#buildAnchorZonesIfNeeded();

        return this.#anchorZones.
            filter(zone => zone.rect.containsPoint(pos)).
            sort((zoneA, zoneB) => {
                return pos.measureDistanceTo(zoneA.rect.center) - pos.measureDistanceTo(zoneB.rect.center)
            })[0];
    }

    #calculateAndEmitUpdatedCrop(pointDiff) {
        const pDiff = pointDiff,
              dragO = this.#dragOrigin,
              dragOriginOffset = this.#dragOriginOffset,
              curCrop = this.#crop;

        const newCrop = curCrop.clone();

        function modLeft() {
            newCrop.x = dragO.x + pDiff.x;
            newCrop.width += (curCrop.x - newCrop.x);
        }

        function modRight() {
            newCrop.width = dragO.x - curCrop.x + pDiff.x;
        }

        function modTop() {
            newCrop.y = dragO.y + pDiff.y;
            newCrop.height += (curCrop.y - newCrop.y);
        }

        function modBottom() {
            newCrop.height = dragO.y - curCrop.y + pDiff.y;
        }

        function modRect() {
            newCrop.x = dragO.x - curCrop.width / 2 + pDiff.x + dragOriginOffset.x;
            newCrop.y = dragO.y - curCrop.height / 2 + pDiff.y + dragOriginOffset.y;
        }

        switch(this.#activeAnchorKey) {
            case ANCHOR_TOP_LEFT:     modTop(); modLeft(); break;
            case ANCHOR_TOP:          modTop(); break;
            case ANCHOR_TOP_RIGHT:    modTop(); modRight(); break;
            case ANCHOR_RIGHT:        modRight(); break;
            case ANCHOR_BOTTOM_RIGHT: modBottom(); modRight(); break;
            case ANCHOR_BOTTOM:       modBottom(); break;
            case ANCHOR_BOTTOM_LEFT:  modBottom(); modLeft(); break;
            case ANCHOR_LEFT:         modLeft(); break;
            case ANCHOR_RECT:         modRect(); break; 
        }

        if (this.#activeAnchorKey === ANCHOR_RECT) {
            this.#emitCropMove(newCrop);
        } else {
            this.#emitCropResize(newCrop);
        }
    }

    #drawCrop() {
        this.#$canvas.width = this.#$canvas.scrollWidth;
        this.#$canvas.height = this.#$canvas.scrollHeight;
        const ctxWrap = new RenderContextWrapper(this.#$canvas.getContext("2d"), this.#drawRegion);

        if (this.#editorActive) {
            this.#drawInteractiveCrop(ctxWrap);
        } else {
            this.#drawStaticCrop(ctxWrap);
        }
    }

    #drawDarkBackground(ctxWrap, opacity) {
        const cr = this.#crop;
        const contSize = this.#drawRegion.size;
        const ctx = ctxWrap.ctx;

        ctx.fillStyle = "black";
        ctx.globalAlpha = opacity;

        if (cr.left > 0) {
            ctxWrap.fillRect(
                new Rect(
                    new Point(0, 0),
                    new Size(cr.left, contSize.height)
                )
            );
        }

        if (cr.right < contSize.width) {
            ctxWrap.fillRect(
                new Rect(
                    new Point(cr.right, 0),
                    new Size(contSize.width - cr.right, contSize.height)
                )
            );
        }

        if (cr.top > 0) {
            ctxWrap.fillRect(
                new Rect(
                    new Point(cr.left, 0),
                    new Size(cr.width, cr.top)
                )
            );
        }

        if (cr.bottom < contSize.height) {
            ctxWrap.fillRect(
                new Rect(
                    new Point(cr.left, cr.bottom),
                    new Size(cr.width, contSize.height - cr.bottom)
                )
            );
        }

        ctx.globalAlpha = 1;
    }

    #drawInteractiveCrop(ctxWrap) {
        this.#drawDarkBackground(ctxWrap, 0.6);

        const ctx = ctxWrap.ctx;
        const cr = this.#crop;

        if (this.#isDragging) {
            ctx.fillStyle = "white";
            ctx.globalAlpha = 0.2;
            ctxWrap.fillRect(cr);
            ctx.globalAlpha = 1;
        }

        ctx.lineWidth = 3;
        ctx.strokeStyle = "white";
        ctxWrap.strokeRect(cr);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "black";
        ctx.setLineDash([5, 5]);
        ctxWrap.strokeRect(cr);
        ctx.setLineDash([]);
        ctx.fillStyle ="white";
        ctx.strokeStyle = "black";

        ctxWrap.circles(
            [cr.topLeft, cr.topRight, cr.bottomRight, cr.bottomLeft],
            8
        );
    }

    #drawStaticCrop(ctxWrap) {
        this.#drawDarkBackground(ctxWrap, 0.85);
    }

    #emitCropResize(newCrop) {
        this.#cropResizeEmitter.emit(newCrop.toRatioRect(this.#drawRegion.size));
    }

    #emitCropMove(newCrop) {
        this.#cropMoveEmitter.emit(newCrop.toRatioRect(this.#drawRegion.size));
    }

    get cropResize() {
        return this.#cropResizeEmitter.asReadOnly();
    }

    get cropMove() {
        return this.#cropMoveEmitter.asReadOnly();
    }

    set crop(newRatioCrop) {
        this.#crop = newRatioCrop.toPixelRect(this.#drawRegion.size);
    }

    set preview(newPreview) {
        this.#$container.classList.toggle(PREVIEW_START_CLASS, newPreview == PREVIEW_SELECT.START);
        this.#$container.classList.toggle(PREVIEW_END_CLASS, newPreview == PREVIEW_SELECT.END);
    }

    updateDisplayCrop(displayCrop, videoSize) {
        const videoSizeStr = `${videoSize.width}x${videoSize.height}`,
              cropStr = `${displayCrop.x},${displayCrop.y} ` +
                `${displayCrop.width}x${displayCrop.height}`;
        this.#$videoSizeDd.innerText = videoSizeStr;
        this.#$videoCropDd.innerText = cropStr;
    }
};

}(window));