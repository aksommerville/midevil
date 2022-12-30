/* PlayheadRibbon.js
 * UI element that sits just above the chart, for playhead and loop indicators.
 */
 
import { Dom } from "../util/Dom.js";
import { SongPlayService } from "../midi/SongPlayService.js";
import { ChartRenderer } from "./ChartRenderer.js";

export class PlayheadRibbon extends EventTarget {
  static getDependencies() {
    return [HTMLCanvasElement, Dom, SongPlayService, Window];
  }
  constructor(element, dom, songPlayService, window) {
    super();
    this.element = element;
    this.dom = dom;
    this.songPlayService = songPlayService;
    this.window = window;
    
    this.chartRenderer = null; // owner must provide
    
    this.element.classList.add("empty");
    this.element.addEventListener("mousedown", (event) => this.onMouseDown(event));
    
    this.loopChangeListener = (event) => this.onLoopChange(event);
    this.playheadChangeListener = (event) => this.onPlayheadChange(event);
    this.playStateChangeListener = (event) => this.onPlayStateChange(event);
    this.metronomeListener = () => this.onMetronome();
    this.songPlayService.addEventListener("mid.loopChange", this.loopChangeListener);
    this.songPlayService.addEventListener("mid.playheadChange", this.playheadChangeListener);
    this.songPlayService.addEventListener("mid.playStateChange", this.playStateChangeListener);
    this.songPlayService.addEventListener("mid.metronome", this.metronomeListener);
    
    this.mouseMoveListener = null;
    this.mouseUpListener = null;
    this.loopAnchor = 0; // view pixels; valid only while dragging
    this.loopInProgressEdge = 0; // '' other edge, for rendering only.
    this.metronomeHighlightEndTime = 0;
  }
  
  onRemoveFromDom() {
    if (this.loopChangeListener) {
      this.songPlayService.removeEventListener("mid.loopChange", this.loopChangeListener);
      this.loopChangeListener = null;
    }
    if (this.playheadChangeListener) {
      this.songPlayService.removeEventListener("mid.playheadChange", this.playheadChangeListener);
      this.playheadChangeListener = null;
    }
    if (this.playStateChangeListener) {
      this.songPlayService.removeEventListener("mid.playStateChange", this.playStateChangeListener);
      this.playStateChangeListener = null;
    }
    if (this.metronomeListener) {
      this.songPlayService.removeEventListener("mid.metronome", this.metronomeListener);
      this.metronomeListener = null;
    }
    if (this.mouseMoveListener) {
      this.window.removeEventListener("mousemove", this.mouseMoveListener);
      this.mouseMoveListener = null;
    }
    if (this.mouseUpListener) {
      this.window.removeEventListener("mouseup", this.mouseUpListener);
      this.mouseUpListener = null;
    }
  }
  
  onLoopChange(event) {
    this.render();
  }
  
  onPlayheadChange(event) {
    this.render();
  }
  
  onPlayStateChange(event) {
    this.element.classList.remove("empty");
    this.element.classList.remove("ready");
    this.element.classList.remove("play");
    this.element.classList.remove("record");
    this.element.classList.add(event.state);
  }
  
  onMetronome() {
    const duration = 200;
    this.metronomeHighlightEndTime = Date.now() + duration;
    this.render();
    this.window.setTimeout(() => this.render(), duration + 10);
  }
  
  onMouseDown(event) {
    
    // Hold Shift to establish or delete the loop region.
    if (event.shiftKey) {
      if (!this.mouseMoveListener && !this.mouseUpListener) {
        this.loopAnchor = event.x;
        this.mouseMoveListener = event => this.onMouseMove(event);
        this.mouseUpListener = event => this.onMouseUp(event);
        this.window.addEventListener("mousemove", this.mouseMoveListener);
        this.window.addEventListener("mouseup", this.mouseUpListener);
      }
    
    // Anything else, set the playhead.
    } else {
      const time = this.chartRenderer.songTimeForViewX(event.x);
      this.songPlayService.setPlayhead(time);
    }
  }
  
  onMouseUp(event) {
    this.window.removeEventListener("mousemove", this.mouseMoveListener);
    this.window.removeEventListener("mouseup", this.mouseUpListener);
    this.mouseMoveListener = null;
    this.mouseUpListener = null;
    const rangePixels = Math.abs(this.loopAnchor - event.x);
    if (rangePixels < this.element.height) { // arbitrary threshold: narrower than bar height to delete range
      this.songPlayService.setLoop(0, 0);
    } else {
      const anchorTime = Math.max(0, Math.round(this.chartRenderer.songTimeForViewX(this.loopAnchor)));
      const mouseTime = Math.max(0, Math.round(this.chartRenderer.songTimeForViewX(event.x)));
      this.songPlayService.setLoop(Math.min(anchorTime, mouseTime), Math.max(anchorTime, mouseTime));
    }
    this.loopAnchor = this.loopInProgressEdge = 0;
    this.render();
  }
  
  onMouseMove(event) {
    this.loopInProgressEdge = event.x;
    this.render();
  }
  
  render() {
    const fullw = this.element.width = this.element.clientWidth;
    const fullh = this.element.height = this.element.clientHeight;
    const context = this.element.getContext("2d");
    context.clearRect(0, 0, fullw, fullh);
    
    // Drawing a new loop range?
    if (this.loopAnchor || this.loopInProgressEdge) {
      let x, w;
      if (this.loopAnchor < this.loopInProgressEdge) {
        x = this.loopAnchor;
        w = this.loopInProgressEdge - x;
      } else {
        x = this.loopInProgressEdge;
        w = this.loopAnchor - x;
      }
      // Narrower than wide means we are going to unset the player's loop. Indicate this with a darker color.
      if (w < fullh) context.fillStyle = "#840";
      else context.fillStyle = "#f80";
      context.fillRect(x, 0, w, fullh);
    
    // Have a committed loop?
    } else if (this.songPlayService.loopEndTime > this.songPlayService.loopStartTime) {
      const loopx = this.chartRenderer.viewXForSongTime(this.songPlayService.loopStartTime);
      const endx = this.chartRenderer.viewXForSongTime(this.songPlayService.loopEndTime);
      context.fillStyle = "#ff0";
      context.fillRect(loopx, 0, endx - loopx, fullh);
    }
    
    // If the metronome just sounded, fade everything a little white.
    // Or if its display TTL has expired, unset it.
    if (this.metronomeHighlightEndTime) {
      const now = Date.now();
      if (now >= this.metronomeHighlightEndTime) {
        this.metronomeHighlightEndTime = 0;
      } else {
        context.globalAlpha = 0.25;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, fullw, fullh);
        context.globalAlpha = 1;
      }
    }
    
    // Playhead with fuzz around it, to make more visible.
    const phx = this.chartRenderer.viewXForSongTime(this.songPlayService.playheadTime);
    context.beginPath();
    context.moveTo(phx, 0);
    context.lineTo(phx, fullh);
    context.strokeStyle = "#fff";
    context.globalAlpha = 0.4;
    context.lineWidth = 5;
    context.stroke();
    context.globalAlpha = 1.0;
    context.lineWidth = 1;
    context.strokeStyle = "#000";
    context.stroke();
  }
}
