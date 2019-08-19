import { ImageEditorTool } from "./store/imageReducer";
import { Coord, Bitmap, Bitmask, ImageState } from "./store/bitmap";

export enum ToolCursor {
    None = 0,
    Pointer,
    Crosshairs,
    OpenHand,
    ClosedHand,
    EyeDropper
}

export interface ToolInfo {
    tool: ImageEditorTool;
    iconClass: string;
    title: string;

    hiddenTool?: boolean;
    altTool?: ImageEditorTool;
    shiftTool?: ImageEditorTool;

    hoverCursor?: ToolCursor;
    downCursor?: ToolCursor;
}

export const tools: ToolInfo[] = [
    {
        tool: ImageEditorTool.Paint,
        iconClass: "fas fa-paint-brush",
        title: "Paint Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Erase,
        iconClass: "fas fa-eraser",
        title: "Erase Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Rect,
        iconClass: "far fa-square",
        title: "Rectangle Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Fill,
        iconClass: "fas fa-fill",
        title: "Fill Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Circle,
        hiddenTool: true,
        iconClass: "far fa-circle",
        title: "Circle Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Line,
        hiddenTool: true,
        iconClass: "fas fa-slash",
        title: "Line Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.Marquee,
        iconClass: "fas fa-vector-square",
        title: "Marquee Tool",
        hoverCursor: ToolCursor.Crosshairs,
    },
    {
        tool: ImageEditorTool.ColorSelect,
        hiddenTool: true,
        iconClass: "fas fa-eye-dropper",
        title: "Color Select Tool",
        hoverCursor: ToolCursor.Crosshairs,
    }
];


export function getEdit(tool: ImageEditorTool, state: EditState, color: number, width: number) {
    switch (tool) {
        case ImageEditorTool.Paint:
            return new PaintEdit(state.width, state.height, color, width);
        case ImageEditorTool.Rect:
            return new OutlineEdit(state.width, state.height, color, width);
        case ImageEditorTool.Fill:
            return new FillEdit(state.width, state.height, color, width);
        case ImageEditorTool.Line:
            return new LineEdit(state.width, state.height, color, width);
        case ImageEditorTool.Marquee:
            return new MarqueeEdit(state.width, state.height, color, width);
        case ImageEditorTool.Circle:
            return new CircleEdit(state.width, state.height, color, width);
        case ImageEditorTool.Erase:
            return new PaintEdit(state.width, state.height, 0, width);
        case ImageEditorTool.ColorSelect:
            // FIXME
            return undefined;
    }
}

export function getEditState(state: ImageState): EditState {
    const res = new EditState(Bitmap.fromData(state.bitmap).copy());
    res.layerOffsetX = state.layerOffsetX;
    res.layerOffsetY = state.layerOffsetY;

    if (state.floatingLayer) res.floatingLayer = Bitmap.fromData(state.floatingLayer).copy();

    return res;
}

export class EditState {
    image: Bitmap;
    floatingLayer: Bitmap;
    layerOffsetX: number;
    layerOffsetY: number;

    constructor(bitmap?: Bitmap) {
        this.image = bitmap;
        this.layerOffsetX = 0;
        this.layerOffsetY = 0;
    }

    get width() {
        return this.image.width;
    }

    get height() {
        return this.image.height;
    }

    copy() {
        const res = new EditState();
        res.image = this.image.copy();

        if (this.floatingLayer) {
            res.floatingLayer = this.floatingLayer.copy();
            res.floatingLayer.x0 = this.layerOffsetX;
            res.floatingLayer.y0 = this.layerOffsetY;
        }
        res.layerOffsetX = this.layerOffsetX;
        res.layerOffsetY = this.layerOffsetY;

        return res;
    }

    equals(other: EditState) {
        if (!this.image.equals(other.image) || (this.floatingLayer && !other.floatingLayer) || (!this.floatingLayer && other.floatingLayer)) return false;

        if (this.floatingLayer) return this.floatingLayer.equals(other.floatingLayer) && this.layerOffsetX === other.layerOffsetX && this.layerOffsetY === other.layerOffsetY;

        return true;
    }

    mergeFloatingLayer() {
        if (!this.floatingLayer) return;

        this.floatingLayer.x0 = this.layerOffsetX;
        this.floatingLayer.y0 = this.layerOffsetY;

        this.image.apply(this.floatingLayer, true);
        this.floatingLayer = undefined;
    }

    copyToLayer(left: number, top: number, width: number, height: number, cut = false) {
        if (width === 0 || height === 0) return;

        if (width < 0) {
            left += width;
            width = -width;
        }

        if (height < 0) {
            top += height;
            height = -height;
        }

        this.floatingLayer = this.image.copy(left, top, width, height);
        this.layerOffsetX = this.floatingLayer.x0;
        this.layerOffsetY = this.floatingLayer.y0;

        if (cut) {
            for (let c = 0; c < width; c++) {
                for (let r = 0; r < height; r++) {
                    this.image.set(left + c, top + r, 0);
                }
            }
        }
    }

    inFloatingLayer(col: number, row: number) {
        if (!this.floatingLayer) return false;

        col = col - this.layerOffsetX;
        row = row - this.layerOffsetY;

        return col >= 0 && col < this.floatingLayer.width && row >= 0 && row < this.floatingLayer.height;
    }
}

export abstract class Edit {
    protected startCol: number;
    protected startRow: number;
    isStarted: boolean;
    showPreview: boolean;

    constructor (protected canvasWidth: number, protected canvasHeight: number, public color: number, protected toolWidth: number) {
    }

    public abstract update(col: number, row: number): void;
    protected abstract doEditCore(state: EditState): void;

    public doEdit(state: EditState): void {
        if (this.isStarted) {
            this.doEditCore(state);
        }
    }


    start(cursorCol: number, cursorRow: number, state: EditState) {
        this.isStarted = true;
        this.startCol = cursorCol;
        this.startRow = cursorRow;

        state.mergeFloatingLayer();
    }


    end(col: number, row: number, state: EditState): void {

    }

    drawCursor(col: number, row: number, draw: (c: number, r: number) => void) {
        draw(col, row);
    }
}

export abstract class SelectionEdit extends Edit {
    protected endCol: number;
    protected endRow: number;
    protected isDragged: boolean;

    update(col: number, row: number) {
        this.endCol = col;
        this.endRow = row;

        if (!this.isDragged && !(col == this.startCol && row == this.startRow)) {
            this.isDragged = true;
        }
    }

    protected topLeft(): Coord {
        return {
            x: Math.min(this.startCol, this.endCol),
            y: Math.min(this.startRow, this.endRow)
        };
    }

    protected bottomRight(): Coord {
        return {
            x: Math.max(this.startCol, this.endCol),
            y: Math.max(this.startRow, this.endRow)
    };
    }
}

/**
 * Regular old drawing tool
 */
export class PaintEdit extends Edit {
    protected mask: Bitmask;
    showPreview = true;

    constructor (canvasWidth: number, canvasHeight: number, color: number, toolWidth: number) {
        super(canvasWidth, canvasHeight, color, toolWidth);
        this.mask = new Bitmask(canvasWidth, canvasHeight);
    }

    update(col: number, row: number) {
        // Interpolate (Draw a line) from startCol, startRow to col, row
        this.interpolate(this.startCol, this.startRow, col, row);

        this.startCol = col;
        this.startRow = row;
    }

    // https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
    protected interpolate(x0: number, y0: number, x1: number, y1: number) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const draw = (c: number, r: number) => this.mask.set(c, r);
        if (dx === 0) {
            const startY = dy >= 0 ? y0 : y1;
            const endY = dy >= 0 ? y1 : y0;
            for (let y = startY; y <= endY; y++) {
                this.drawCore(x0, y, draw);
            }
            return;
        }

        const xStep = dx > 0 ? 1 : -1;
        const yStep = dy > 0 ? 1 : -1;
        const dErr = Math.abs(dy / dx);

        let err = 0;
        let y = y0;
        for (let x = x0; xStep > 0 ? x <= x1 : x >= x1; x += xStep) {
            this.drawCore(x, y, draw);
            err += dErr;
            while (err >= 0.5) {
                if (yStep > 0 ? y <= y1 : y >= y1) {
                    this.drawCore(x, y, draw);
                }
                y += yStep;
                err -= 1;
            }
        }
    }

    protected doEditCore(state: EditState) {
        for (let c = 0; c < state.width; c++) {
            for (let r = 0; r < state.height; r++) {
                if (this.mask.get(c, r)) {
                    state.image.set(c, r, this.color);
                }
            }
        }
    }

    drawCursor(col: number, row: number, draw: (c: number, r: number) => void) {
        this.drawCore(col, row, draw);
    }

    protected drawCore(col: number, row: number, setPixel: (col: number, row: number) => void) {
        col = col - Math.floor(this.toolWidth / 2);
        row = row - Math.floor(this.toolWidth / 2);
        for (let i = 0; i < this.toolWidth; i++) {
            for (let j = 0; j < this.toolWidth; j++) {
                const c = col + i;
                const r = row + j;

                if (c >= 0 && c < this.canvasWidth && r >= 0 && r < this.canvasHeight) {
                    setPixel(col + i, row + j);
                }
            }
        }
    }
}

/**
 * Tool for drawing filled rectangles
 */
export class RectangleEdit extends SelectionEdit {
    showPreview = true;

    protected doEditCore(state: EditState) {
        const tl = this.topLeft();
        const br = this.bottomRight();
        for (let c = tl.x; c <= br.x; c++) {
            for (let r = tl.y; r <= br.y; r++) {
                state.image.set(c, r, this.color);
            }
        }
    }
}

/**
 * Tool for drawing empty rectangles
 */
export class OutlineEdit extends SelectionEdit {
    showPreview = true;

    protected doEditCore(state: EditState) {
        let tl = this.topLeft();
        tl.x -= this.toolWidth >> 1;
        tl.y -= this.toolWidth >> 1;

        let br = this.bottomRight();
        br.x += this.toolWidth >> 1;
        br.y += this.toolWidth >> 1;

        for (let i = 0; i < this.toolWidth; i++) {
            this.drawRectangle(state,
                {x: tl.x + i, y: tl.y + i},
                {x: br.x - i, y: br.y - i}
            );
        }
    }

    protected drawRectangle(state: EditState, tl: Coord, br: Coord) {
        if (tl.x > br.x || tl.y > br.y) return;

        for (let c = tl.x; c <= br.x; c++) {
            state.image.set(c, tl.y, this.color);
            state.image.set(c, br.y, this.color);
        }
        for (let r = tl.y; r <= br.y; r++) {
            state.image.set(tl.x, r, this.color);
            state.image.set(br.x, r, this.color);
        }
    }

    drawCursor(col: number, row: number, draw: (c: number, r: number) => void) {
        this.drawCore(col, row, draw);
    }

    protected drawCore(col: number, row: number, setPixel: (col: number, row: number) => void) {
        col = col - Math.floor(this.toolWidth / 2);
        row = row - Math.floor(this.toolWidth / 2);
        for (let i = 0; i < this.toolWidth; i++) {
            for (let j = 0; j < this.toolWidth; j++) {
                const c = col + i;
                const r = row + j;

                if (c >= 0 && c < this.canvasWidth && r >= 0 && r < this.canvasHeight) {
                    setPixel(col + i, row + j);
                }
            }
        }
    }

}

/**
 * Tool for drawing straight lines
 */
export class LineEdit extends SelectionEdit {
    showPreview = true;

    protected doEditCore(state: EditState) {
        this.bresenham(this.startCol, this.startRow, this.endCol, this.endRow, state);
    }

    // https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
    protected bresenham(x0: number, y0: number, x1: number, y1: number, state: EditState) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const draw = (c: number, r: number) => state.image.set(c, r, this.color);
        if (dx === 0) {
            const startY = dy >= 0 ? y0 : y1;
            const endY = dy >= 0 ? y1 : y0;
            for (let y = startY; y <= endY; y++) {
                this.drawCore(x0, y, draw);
            }
            return;
        }

        const xStep = dx > 0 ? 1 : -1;
        const yStep = dy > 0 ? 1 : -1;
        const dErr = Math.abs(dy / dx);

        let err = 0;
        let y = y0;
        for (let x = x0; xStep > 0 ? x <= x1 : x >= x1; x += xStep) {
            this.drawCore(x, y, draw);
            err += dErr;
            while (err >= 0.5) {
                if (yStep > 0 ? y <= y1 : y >= y1) {
                    this.drawCore(x, y, draw);
                }
                y += yStep;
                err -= 1;
            }
        }
    }

    drawCursor(col: number, row: number, draw: (c: number, r: number) => void) {
        this.drawCore(col, row, draw);
    }

    // This is surely not the most efficient approach for drawing thick lines...
    protected drawCore(col: number, row: number, draw: (c: number, r: number) => void) {
        col = col - Math.floor(this.toolWidth / 2);
        row = row - Math.floor(this.toolWidth / 2);
        for (let i = 0; i < this.toolWidth; i++) {
            for (let j = 0; j < this.toolWidth; j++) {
                const c = col + i;
                const r = row + j;

                draw(c, r);
            }
        }
    }
}

/**
 * Tool for circular outlines
 */
export class CircleEdit extends SelectionEdit {
    showPreview = true;

    protected doEditCore(state: EditState) {
        const tl = this.topLeft();
        const br = this.bottomRight();
        const dx = br.x - tl.x;
        const dy = br.y - tl.y;

        const radius = Math.floor(Math.hypot(dx, dy));
        const cx = this.startCol;
        const cy = this.startRow;

        this.midpoint(cx, cy, radius, state);
    }

    // https://en.wikipedia.org/wiki/Midpoint_circle_algorithm
    midpoint(cx: number, cy: number, radius: number, state: EditState) {
        let x = radius - 1;
        let y = 0;
        let dx = 1;
        let dy = 1;
        let err = dx - (radius * 2);
        while (x >= y) {
            state.image.set(cx + x, cy + y, this.color);
            state.image.set(cx + x, cy - y, this.color);
            state.image.set(cx + y, cy + x, this.color);
            state.image.set(cx + y, cy - x, this.color);
            state.image.set(cx - y, cy + x, this.color);
            state.image.set(cx - y, cy - x, this.color);
            state.image.set(cx - x, cy + y, this.color);
            state.image.set(cx - x, cy - y, this.color);
            if (err <= 0) {
                y++;
                err += dy;
                dy += 2;
            }
            if (err > 0) {
                x--;
                dx += 2;
                err += dx - (radius * 2);
            }
        }
    }
}


export class FillEdit extends Edit {
    protected col: number;
    protected row: number;
    showPreview = true;

    start(col: number, row: number, state: EditState) {
        this.isStarted = true;
        this.col = col;
        this.row = row;

        state.mergeFloatingLayer();
    }

    update(col: number, row: number) {
        this.col = col;
        this.row = row;
    }

    protected doEditCore(state: EditState) {
        const replColor = state.image.get(this.col, this.row);
        if (replColor === this.color) {
            return;
        }

        const mask = new Bitmask(state.width, state.height);
        mask.set(this.col, this.row);
        const q: Coord[] = [{x: this.col, y: this.row}];
        while (q.length) {
            const curr = q.pop();
            if (state.image.get(curr.x, curr.y) === replColor) {
                state.image.set(curr.x, curr.y, this.color);
                tryPush(curr.x + 1, curr.y);
                tryPush(curr.x - 1, curr.y);
                tryPush(curr.x, curr.y + 1);
                tryPush(curr.x, curr.y - 1);
            }
        }

        function tryPush(x: number, y: number) {
            if (x >= 0 && x < mask.width && y >= 0 && y < mask.height && !mask.get(x, y)) {
                mask.set(x, y);
                q.push({x: x, y: y});
            }
        }
    }
}


export class MarqueeEdit extends SelectionEdit {
    protected isMove = false;
    showPreview = false;

    start(cursorCol: number, cursorRow: number, state: EditState) {
        this.isStarted = true;
        this.startCol = cursorCol;
        this.startRow = cursorRow;
        if (state.floatingLayer) {
            if (state.inFloatingLayer(cursorCol, cursorRow)) {
                this.isMove = true;
            } else {
                state.mergeFloatingLayer();
            }
        }
    }

    end(cursorCol: number, cursorRow: number, state: EditState) {
        if (!this.isDragged && state.floatingLayer) {
            state.mergeFloatingLayer();
        }
    }

    protected doEditCore(state: EditState): void {
        const tl = this.topLeft();
        const br = this.bottomRight();

        if (this.isDragged) {
            if (this.isMove) {
                state.layerOffsetX = state.floatingLayer.x0 + this.endCol - this.startCol;
                state.layerOffsetY = state.floatingLayer.y0 + this.endRow - this.startRow;
            }
            else {
                state.copyToLayer(tl.x, tl.y, br.x - tl.x + 1, br.y - tl.y + 1, true);
            }
        }
    }
}