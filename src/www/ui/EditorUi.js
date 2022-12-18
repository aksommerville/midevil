/* EditorUi.js
 * Everything below the toolbar.
 */
 
import { Dom } from "../util/Dom.js";
import { Song } from "../midi/Song.js";
import { ChartUi } from "./ChartUi.js";
import { MidiBus } from "../midi/MidiBus.js";

class SongDirtyEvent extends Event {
  constructor(cb) {
    super("mid.songDirty");
    this.cb = cb;
  }
}

class TrackCountChangedEvent extends Event {
  constructor(trackCount) {
    super("mid.trackCountChanged");
    this.trackCount = trackCount;
  }
}

export class EditorUi extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom, MidiBus, Window];
  }
  constructor(element, dom, midiBus, window) {
    super();
    this.element = element;
    this.dom = dom;
    this.midiBus = midiBus;
    this.window = window;
    
    this.song = null;
    this.chartUi = null;
    
    this.buildUi();
    
    this.midiMessageListener = (event) => this.onMidiMessage(event);
    this.midiBus.addEventListener("mid.midi", this.midiMessageListener);
    
    if (this.window.ResizeObserver) {
      const resizeObserver = new this.window.ResizeObserver(e => {
        this.resizeScroller();
        this.chartUi.renderSoon();
      });
      resizeObserver.observe(this.element);
    }
    
    this.element.setAttribute("tabindex", "-1");
    this.element.addEventListener("keydown", (event) => this.onKeyDown(event));
    
    this.resizeScroller();
  }
  
  onRemoveFromDom() {
    if (this.midiMessageListener) {
      this.midiBus.removeEventListener("mid.midi", this.midiMessageListener);
      this.midiMessageListener = null;
    }
  }
  
  loadFile(serial) {
    if (serial) {
      this.song = new Song(serial);
      this.song.combine();
      this.chartUi.setSong(this.song);
      this.dispatchEvent(new SongDirtyEvent(() => {
        const dst = this.song.encode();
        this.song.combine();
        return dst;
      }));
      this.dispatchEvent(new TrackCountChangedEvent(this.song.getTrackCount()));
    } else {
      this.song = null;
      this.chartUi.setSong(null);
      this.dispatchEvent(new SongDirtyEvent(null));
      this.dispatchEvent(new TrackCountChangedEvent(0));
    }
    this.resizeScroller();
  }
  
  // Owner may call for a full reset, eg after changing division, or other broad Song changes.
  reset() {
    this.chartUi.setSong(this.song);
  }
  
  /* (x,y) must be in 0..1000.
   * These are arbitrary numbers, we make up something reasonable for their exact meaning.
   * Higher value means zoom in.
   */
  setViewScale(x, y) {
    x = Math.min(1000, Math.max(0, +x || 0));
    y = Math.min(1000, Math.max(0, +y || 0));
    this.chartUi.setScale(x, y);
    this.resizeScroller();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    this.chartUi = this.dom.spawnController(this.element, ChartUi);
    this.chartUi.addEventListener("mid.timesChanged", () => this.resizeScroller());
    
    const scroller = this.dom.spawn(this.element, "DIV", ["scroller"]);
    const scrollSizer = this.dom.spawn(scroller, "DIV", ["scrollSizer"]);
    scroller.addEventListener("scroll", () => this.chartUi.setScroll(scroller.scrollLeft, scroller.scrollTop));
    scroller.addEventListener("mousedown", (e) => {
      this.chartUi.onMouseDown({
        x: e.x,
        y: e.y,
        button: e.button,
        detail: e.detail,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
      });
    });
  }
  
  resizeScroller() {
    const scroller = this.element.querySelector(".scroller");
    const scrollSizer = this.element.querySelector(".scrollSizer");
    const [w, h] = this.chartUi.getSizePixels();
    scrollSizer.style.width = `${w}px`;
    scrollSizer.style.height = `${h}px`;
  }
  
  onMidiMessage(event) {
    console.log(`TODO EditorUi.onMidiMessage ${event.device.id} ${JSON.stringify(Array.from(event.data))}`);
  }
  
  onKeyDown(event) {
    //console.log(`EditorUi.onKeyDown`, event);
    if ((event.code === "Backspace") || (event.code === "Delete")) {
      if (this.chartUi.chartEditor.onKeyDelete()) {
        event.stopPropagation();
        event.preventDefault();
      }
    }
  }
  
  getSelectedEvents() {
    return this.chartUi.chartEditor.selectedEvents;
  }
  
  applyEdits(events) {
    this.chartUi.chartEditor.applyEdits(events);
  }
}
