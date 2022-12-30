/* MynthEnvelopeGraph.js
 * Canvas showing a mutable envelope; user can click and drag the control points.
 * We adhere to the model defined by MynthChannelHeadersModal.
 */
 
import { Dom } from "../util/Dom.js";

export class FakeInputEvent extends Event {
  constructor(element, key, value) {
    super("input", { bubbles: true });
    this.key = key;
    this.value = value;
    this._target = {
      name: key,
      value: value,
      parentNode: element.parentNode,
      getAttribute: () => null,
    };
  }
  get target() { return this._target; }
  set target(v) { this._target = v; }
}

export class MynthEnvelopeGraph extends EventTarget {
  static getDependencies() {
    return [HTMLCanvasElement, Dom, Window];
  }
  constructor(element, dom, window) {
    super();
    this.element = element;
    this.dom = dom;
    this.window = window;
    
    this.CANVAS_WIDTH = 320;
    this.LONGEST_ENVELOPE = 1280; // 128 attack + 128 decay + 128*8 release
    
    /* (points) are 3 of [time,level]. (time) in absolute ms, (level) in 0..127.
     * There's an implicit [0,0] at the start.
     * [3].level is immutable, always zero.
     * Times must be in order, and can't be more than 127 points apart.
     * [3].time is stored in 8-ms increments.
     * These initial values match mynth's defaults (and the 255 is a coincidence, doesn't mean anything).
     */
    this.lines = [{
      color: "#f00",
      handleColor: "#800",
      points: [[15, 0x50], [55, 0x30], [255, 0, "fixedLevel"]],
    }, {
      color: "#ff0",
      handleColor: "#880",
      points: [[15, 0x50], [55, 0x30], [255, 0, "fixedLevel"]],
    }];
    
    /* How many milliseconds of time do we show in the available width?
     * Ranges CANVAS_WIDTH..LONGEST_ENVELOPE.
     * Start small; the default envelope is 255 ms, and that's pretty normal.
     */
    this.timeScale = this.CANVAS_WIDTH;
    
    this.mouseUpListener = null;
    this.mouseMoveListener = null;
    this.element.addEventListener("mousedown", (event) => this.onMouseDown(event));
    this.element.addEventListener("contextmenu", (event) => event.preventDefault());
    
    this.anchorX = 0;
    this.anchorY = 0;
    this.anchorTime = 0;
    this.anchorLevel = 0;
    this.dragHandle = null;
    
    this.render();
  }
  
  onRemoveFromDom() {
    this.dropMouseListeners();
  }
  
  setup(model) {
    // First copy all "lo" verbatim to both lines. (relative and unscaled)
    if (model.hasOwnProperty("attackTimeLo")) this.lines[0].points[0][0] = this.lines[1].points[0][0] = model.attackTimeLo;
    else                                      this.lines[0].points[0][0] = this.lines[1].points[0][0] = 15;
    if (model.hasOwnProperty("attackLevelLo")) this.lines[0].points[0][1] = this.lines[1].points[0][1] = model.attackLevelLo;
    else                                       this.lines[0].points[0][1] = this.lines[1].points[0][1] = 0x50;
    if (model.hasOwnProperty("decayTimeLo")) this.lines[0].points[1][0] = this.lines[1].points[1][0] = model.decayTimeLo;
    else                                     this.lines[0].points[1][0] = this.lines[1].points[1][0] = 40;
    if (model.hasOwnProperty("sustainLevelLo")) this.lines[0].points[1][1] = this.lines[1].points[1][1] = model.sustainLevelLo;
    else                                        this.lines[0].points[1][1] = this.lines[1].points[1][1] = 0x30;
    if (model.hasOwnProperty("releaseTimeLo")) this.lines[0].points[2][0] = this.lines[1].points[2][0] = model.releaseTimeLo;
    else                                       this.lines[0].points[2][0] = this.lines[1].points[2][0] = 25;
    // Next if any "hi" exists, copy it to line 1 only.
    if (model.hasOwnProperty("attackTimeHi")) this.lines[1].points[0][0] = model.attackTimeHi;
    if (model.hasOwnProperty("attackLevelHi")) this.lines[1].points[0][1] = model.attackLevelHi;
    if (model.hasOwnProperty("decayTimeHi")) this.lines[1].points[1][0] = model.decayTimeHi;
    if (model.hasOwnProperty("sustainLevelHi")) this.lines[1].points[1][1] = model.sustainLevelHi;
    if (model.hasOwnProperty("releaseTimeHi")) this.lines[1].points[2][0] = model.releaseTimeHi;
    // Now adjust times to express as absolute ms.
    this.lines[0].points[1][0] += this.lines[0].points[0][0];
    this.lines[1].points[1][0] += this.lines[1].points[0][0];
    this.lines[0].points[2][0] *= 8;
    this.lines[1].points[2][0] *= 8;
    this.lines[0].points[2][0] += this.lines[0].points[1][0];
    this.lines[1].points[2][0] += this.lines[1].points[1][0];
    this.render();
  }
  
  generateAndDispatchUpdate(handle) {
    if (handle) {
      const [linep, pointp] = handle.split(":").map(v => +v);
      const line = this.lines[linep];
      if (line) {
        const point = line.points[pointp];
        if (point) {
          switch (linep) {
            case 0: switch (pointp) {
                case 0: {
                    this.update1("attackTimeLo", point[0]);
                    this.update1("attackLevelLo", point[1]);
                  } break;
                case 1: {
                    this.update1("decayTimeLo", point[0] - this.lines[0].points[0][0]);
                    this.update1("sustainLevelLo", point[1]);
                  } break;
                case 2: {
                    this.update1("releaseTimeLo", (point[0] - this.lines[0].points[1][0]) / 8);
                  } break;
              } break;
            case 1: switch (pointp) {
                case 0: {
                    this.update1("attackTimeHi", point[0]);
                    this.update1("attackLevelHi", point[1]);
                  } break;
                case 1: {
                    this.update1("decayTimeHi", point[0] - this.lines[1].points[0][0]);
                    this.update1("sustainLevelHi", point[1]);
                  } break;
                case 2: {
                    this.update1("releaseTimeHi", (point[0] - this.lines[1].points[1][0]) / 8);
                  } break;
              } break;
          }
        }
      }
    } else {
      // Any value in a full update? Could do that here.
    }
  }
  
  update1(key, value) {
    if (value < 0) value = 0;
    else if (value > 127) value = 127;
    else value = Math.floor(value);
    const event = new FakeInputEvent(this.element, key, value);
    this.element.dispatchEvent(event);
  }
  
  /* Render.
   *********************************************************************/
  
  render() {
    let fullw = this.element.width = this.CANVAS_WIDTH;
    let fullh = this.element.height = 128;
    const ctx = this.element.getContext("2d");
    const timeAdjust = fullw / this.timeScale;
    
    // Dark blue background.
    ctx.fillStyle = "#008";
    ctx.fillRect(0, 0, fullw, fullh);
    
    // Narrow bar at the top indicating time scale.
    const timeScaleNorm = (this.timeScale - this.CANVAS_WIDTH) / (this.LONGEST_ENVELOPE - this.CANVAS_WIDTH + 1);
    const timeScaleX = Math.floor(timeScaleNorm * fullw);
    ctx.fillStyle = "#080";
    ctx.fillRect(0, 0, timeScaleX, 8);
    ctx.fillStyle = "#444";
    ctx.fillRect(timeScaleX, 0, fullw - timeScaleX, 8);
    
    // Draw control handles on each point of both lines, under the lines.
    for (const line of this.lines) {
      ctx.fillStyle = line.handleColor;
      for (const [time, level] of line.points) {
        ctx.beginPath();
        ctx.ellipse(time * timeAdjust, fullh - 1 - level, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Trace both lines.
    for (const line of this.lines) {
      ctx.beginPath();
      ctx.moveTo(0, fullh - 1);
      for (const [time, level] of line.points) {
        ctx.lineTo(time * timeAdjust, fullh - 1 - level);
      }
      ctx.strokeStyle = line.color;
      ctx.stroke();
    }
  }
  
  /* Events.
   *****************************************************************/
   
  dropMouseListeners() {
    if (this.mouseUpListener) {
      this.window.removeEventListener("mouseup", this.mouseUpListener);
      this.mouseUpListener = null;
    }
    if (this.mouseMoveListener) {
      this.window.removeEventListener("mousemove", this.mouseMoveListener);
      this.mouseMoveListener = null;
    }
    this.dragHandle = null;
  }
  
  onMouseDown(event) {
    // Check lines in reverse order (because they render in forward order)
    for (let i=this.lines.length; i-->0; ) {
      const line = this.lines[i];
      const handle = this.findLineHandle(line, event.offsetX, event.offsetY);
      if (handle) return this.beginDrag(`${i}:${handle}`, event.offsetX, event.offsetY);
    }
    // Look for non-line things.
    const handle = this.findGlobalHandle(event.offsetX, event.offsetY);
    if (handle) return this.beginDrag(handle, event.offsetX, event.offsetY);
  }
  
  findLineHandle(line, x, y) {
    const time = (x * this.timeScale) / this.element.width;
    const level = 127 - y;
    const radius = 5;
    for (let p=0; p<line.points.length; p++) {
      const [ptime, plevel] = line.points[p];
      const dtime = (Math.abs(ptime - time) * this.element.width) / this.timeScale;
      if (dtime > radius) continue;
      const dlevel = Math.abs(plevel - level);
      if (dlevel > radius) continue;
      return p.toString();
    }
    return null;
  }
  
  findGlobalHandle(x, y) {
    if (y < 8) return "timeScale";
    return null;
  }
  
  pointForHandle(handle) {
    if (!handle) return null;
    const [linep, pointp] = handle.split(":").map(v => +v);
    const line = this.lines[linep];
    if (!line) return null;
    return line.points[pointp];
  }
  
  beginDrag(handle, x, y) {
    this.dropMouseListeners();
    this.anchorX = x;
    this.anchorY = y;
    const point = this.pointForHandle(handle);
    if (point) {
      this.anchorTime = point[0];
      this.anchorLevel = point[1];
    }
    this.dragHandle = handle;
    this.window.addEventListener("mouseup", this.mouseUpListener = e => this.onMouseUp(e));
    this.window.addEventListener("mousemove", this.mouseMoveListener = e => this.onMouseMove(e));
    this.onMouseMove(event);
  }
  
  onMouseUp(event) {
    this.dropMouseListeners();
  }
  
  onMouseMove(event) {
    const [x, y] = this.positionFromMouseEvent(event);
    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    switch (this.dragHandle) {
      case "timeScale": {
          const norm = Math.max(0, Math.min(1, x / this.element.width));
          this.timeScale = this.CANVAS_WIDTH + norm * (this.LONGEST_ENVELOPE - this.CANVAS_WIDTH + 1);
          this.render();
        } break;
      default: {
          const point = this.pointForHandle(this.dragHandle);
          if (point) {
            point[0] = Math.max(0, Math.min(this.LONGEST_ENVELOPE, (x * this.timeScale) / this.element.width));
            if (!point[2]) point[1] = Math.max(0, Math.min(127, 127 - y));
            this.render();
            this.generateAndDispatchUpdate(this.dragHandle);
          }
        }
    }
  }
  
  positionFromMouseEvent(event) {
    const bounds = this.element.getBoundingClientRect();
    return [event.clientX - bounds.x, event.clientY - bounds.y];
  }
}
