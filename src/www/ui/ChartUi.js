/* ChartUi.js
 * Renders the notes and manages user events on them.
 * We are the size of one screenful, and that's what we render.
 * Owner must tell us our scroll position, and we tell it our total size.
 * Mostly we delegate to two prototype classes: ChartEditor, ChartRenderer.
 */
 
import { Dom } from "../util/Dom.js";
import { MidiSerial } from "../midi/MidiSerial.js";
import { ChartEditor } from "./ChartEditor.js";
import { ChartRenderer } from "./ChartRenderer.js";
import { PlayheadRibbon } from "./PlayheadRibbon.js";

class MouseTattleEvent extends Event {
  constructor(message) {
    super("mid.mouseTattle");
    this.message = message;
  }
}

/* Instantiator must provide a PlayheadRibbon.
 * If you forget, horrible injection errors could ensue.
 */
export class ChartUi extends EventTarget {
  static getDependencies() {
    return [HTMLCanvasElement, Dom, Window, ChartEditor, ChartRenderer, PlayheadRibbon];
  }
  constructor(element, dom, window, chartEditor, chartRenderer, playheadRibbon) {
    super();
    this.element = element;
    this.dom = dom;
    this.window = window;
    this.chartEditor = chartEditor;
    this.chartRenderer = chartRenderer;
    this.playheadRibbon = playheadRibbon;
    
    // Wire up the kids.
    // (ChartUi, ChartEditor, ChartRenderer) are separate classes just to avoid a ten-thousand-line file.
    this.chartEditor.chartUi = this;
    this.chartEditor.chartRenderer = this.chartRenderer;
    this.chartRenderer.chartUi = this;
    this.chartRenderer.chartEditor = this.chartEditor;
    
    this.song = null;
    this.renderPending = false;
    this.previousMouseTattleMessage = "";
    this.mouseState = false;
    this.noteHighlights = []; // {noteid,expiry}
    
    // I do this pro forma, but in reality we do not receive mousedown events from the browser.
    // There's a transparent scroller above us that gets them and calls our onMouseDown with an artificial event.
    this.element.addEventListener("mousedown", (event) => this.onMouseDown(event));
    
    this.mouseMoveListener = (event) => this.onMouseMove(event);
    this.mouseUpListener = (event) => this.onMouseUp(event);
    this.window.addEventListener("mousemove", this.mouseMoveListener);
    this.window.addEventListener("mouseup", this.mouseUpListener);
    
    this.setScale(500, 500);
  }
  
  onRemoveFromDom() {
    if (this.mouseMoveListener) {
      this.window.removeEventListener("mousemove", this.mouseMoveListener);
      this.mouseMoveListener = null;
    }
    if (this.mouseUpListener) {
      this.window.removeEventListener("mouseup", this.mouseUpListener);
      this.mouseUpListener = null;
    }
  }
  
  setSong(song) {
    this.song = song;
    this.chartEditor.reset();
    this.renderSoon();
  }
  
  getSizePixels() {
    return this.chartRenderer.getSizePixels();
  }
  
  setScale(x, y) {
    this.chartRenderer.setScale(x, y);
    this.renderSoon();
  }
  
  setScroll(x, y) {
    if (!this.chartRenderer.setScroll(x, y)) return;
    this.renderSoon();
  }
  
  // See VisibilityModel in VisibilityUi.js
  setVisibility(model) {
    this.chartRenderer.setVisibility(model);
    this.renderSoon();
  }
  
  highlightRowForMidiInput(noteid) {
    if (noteid < 0) return;
    if (noteid > 0x7f) return;
    const ttl = 500;
    this.noteHighlights.push({ noteid, expiry: Date.now() + ttl });
    this.window.setTimeout(() => this.reviewNoteHighlights(), ttl + 10);
    this.renderSoon();
  }
  
  reviewNoteHighlights() {
    const now = Date.now();
    for (let i=this.noteHighlights.length; i-->0; ) {
      const highlight = this.noteHighlights[i];
      if (highlight.expiry <= now) {
        this.noteHighlights.splice(i, 1);
        this.renderSoon();
      }
    }
  }
  
  renderSoon() {
    if (this.renderPending) return;
    this.renderPending = true;
    this.window.requestAnimationFrame(() => {
      this.renderPending = false;
      this.chartRenderer.render(this.element);
      this.playheadRibbon.render();
    });
  }
  
  /* UI events.
   ************************************************************************/
   
  onMouseDown(event) {
    if (event.button !== 0) return;
    this.mouseState = true;
    const location = this.locateEvent(event, true);
    if (event.detail === 2) this.chartEditor.mouseDouble(location);
    else this.chartEditor.mouseDown(location);
  }
  
  onMouseUp(event) {
    if (event.button !== 0) return;
    this.mouseState = false;
    const location = this.locateEvent(event, false);
    this.chartEditor.mouseUp(location);
  }
  
  onMouseMove(event) {
    const location = this.locateEvent(event, !this.mouseState);
    this.chartEditor.mouseMove(location);
    let message = "";
    for (const songEvent of location.events) {
      const emsg = this.tattleMessageForEvent(songEvent);
      if (message && emsg && (message !== emsg)) {
        message = "Multiple events";
        break;
      } else if (emsg) {
        message = emsg;
      }
    }
    if (!message) message = this.tattleMessageForGrid(location.time, location.noteid);
    if (message === this.previousMouseTattleMessage) return;
    this.previousMouseTattleMessage = message;
    this.dispatchEvent(new MouseTattleEvent(message));
  }
  
  locateEvent(event, search) {
    const bounds = this.element.getBoundingClientRect();
    const xView = event.x - bounds.x;
    const yView = event.y - bounds.y;
    const [xSong, ySong, time, noteid, events] = this.chartRenderer.locateEvent(xView, yView, search);
    return {
      xView, yView,
      xSong, ySong,
      time, noteid,
      events,
      shift: event.shiftKey,
      alt: event.altKey,
      control: event.ctrlKey,
    };
  }
  
  /* Tattle messages.
   **********************************************************************/
  
  tattleMessageForEvent(event) {
    switch (event.opcode) {
      case 0x90: return `NOTE ch=${event.chid} ${MidiSerial.reprNote(event.a)} v=${event.b}`;
      case 0xb0: return `CTL ch=${event.chid} ${event.a}=${event.b}`;
      case 0xc0: return `PRG ch=${event.chid} ${event.a}`;
      case 0xd0: return `PRESSURE ch=${event.chid} ${event.a}`;
      case 0xe0: return `WHEEL ch=${event.chid} ${event.a | (event.b << 7)}`;
      case 0xff: return `META 0x${event.a.toString(16).padStart(2, '0')} c=${event.serial?.length}`;
    }
    return ""; // Not interesting: Sysex, Adjust, Pressure, Unknown
  }
  
  tattleMessageForGrid(time, noteid) {
    if (noteid < 0) return "";
    if (noteid >= 0x80) return "";
    return MidiSerial.reprNote(noteid);
  }
}
