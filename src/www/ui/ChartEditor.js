/* ChartEditor.js
 * Manages input for one ChartUi.
 * (this is a somewhat unusual case of "prototype" scope for a class that isn't a UI controller directly).
 * The idea of this class is we are responsible for the whole input side of things, without dealing with rendering or the DOM.
 *
 * Rules for the user:
 *  - Multiple events may be selected at once.
 *  - Clicking in free space drops the selection.
 *  - Clicking on an event replaces the current selection with that event.
 *  - If events overlap visually, clicking in the overlap effectively selects all of them.
 *  - Shift-click event to add or remove from the selection.
 *  - Shift-click in free space to drag a rectangle that xors the previous selection.
 *  - Plain drag to adjust time and noteid (noteid for Note On and Note Adjust events only).
 *  - Plain drag from the right edge of a note to adjust duration, rowHeight wide.
 *  - Control-drag to adjust noteid (or the "a" value for any event).
 *  - Shift-Control-drag to adjust velocity (or "b").
 *  - Backspace or Delete to delete selected events.
 *  - Double-click event to edit manually.
 *  - Double-click free space to add an event. Added events are initially Note On; one is expected to double-click again and edit.
 */

import { Dom } from "../util/Dom.js"; 
import { EventsModal } from "./EventsModal.js";
import { UndoService } from "../midi/UndoService.js";

class TimesChangedEvent extends Event {
  constructor() {
    super("mid.timesChanged");
  }
}
 
export class ChartEditor {
  static getDependencies() {
    // Dom is for spawning modals only; generally ChartUi is our Dom liaison.
    return [Dom, UndoService];
  }
  constructor(dom, undoService) {
    this.dom = dom;
    this.undoService = undoService;
  
    // Owner must set upon construction.
    this.chartUi = null;
    this.chartRenderer = null;
  
    // References to Events owned by the Song.
    // ChartRenderer will read this directly.
    this.selectedEvents = [];
    
    /* State is one of:
     *   "idle": Not interacting.
     *   "selectRect": Dragging a multi-event selection rectangle.
     *   "adjustTime": Dragging an event on time axis only.
     *   "adjustA": '' A
     *   "adjustB": '' B
     *   "adjustTimeNote": Dragging an event in time and noteid, the typical drag note case.
     *   "adjustDuration": Dragging the right edge of a note, changing duration only.
     */
    this.state = "idle";
    
    this.anchor = null; // null or location
    this.anchorEvents = []; // Copies of everything in (selectedEvents), at the start of the interaction.
    this.pendingSelection = null; // null or {x,y,w,h} in view space
    this.pendingSelectionXorIds = null; // array of event id for the initial state if dragging a selection with Shift key.
    this.timesChanged = false; // Goes true during interaction if any timestamp changed, ie need to re-sort at the end.
  }
  
  reset() {
    this.selectedEvents = [];
    this.state = "idle";
    this.anchor = null;
    this.pendingSelection = null;
  }
  
  /* Keyboard events, triggered from EditorUi.
   * We must return true to acknowledge, then the caller should prevent the event from propagating.
   ***************************************************************/
   
  onKeyDelete() {
    if (!this.selectedEvents.length) return false;
    if (this.state !== "idle") return false;
    this.undoService.push(this.chartUi.song);
    for (const event of this.selectedEvents) {
      this.chartUi.song.deleteEventById(event.id);
    }
    this.selectedEvents = [];
    this.chartUi.renderSoon();
    return true;
  }
  
  /* Events from ChartUi.
   * location: { xView, yView, xSong, ySong, time, noteid, events, shift, alt, control }
   **************************************************************/
   
  mouseDown(location) {
    this.timesChanged = false;
    
    // Click in free space to begin selection.
    if (!location.events || !location.events.length) {
      this.beginSelectRect(location);
      
    // Plain click near the right edge of an event to adjust durations.
    } else if (!location.control && !location.shift && this.clickedInDurationZone(location)) {
      if (!this.anyEventIsSelected(location.events)) {
        this.dropSelection();
        this.selectEvents(location.events);
      }
      this.beginDrag(location, "adjustDuration");
      
    // Plain click or shift-control-click to drop selection (if unselected) and begin drag.
    } else if (location.control || !location.shift) {
      if (!this.anyEventIsSelected(location.events)) {
        this.dropSelection();
        this.selectEvents(location.events);
      }
      this.beginDrag(location);
        
    // Shift-click (without Control) on an event to add or remove from selection.
    } else {
      this.toggleEventsSelected(location.events);
    }
  }
  
  mouseDouble(location) {
    // Ignore (location.events), trust that this.selectedEvents got updated on the first click.
    if (this.selectedEvents.length) {
      this.editEventsManually(this.selectedEvents);
    } else {
      this.addEvent(location);
    }
  }
  
  mouseUp(location) {
    if (this.timesChanged) {
      this.chartUi.song.sortEvents();
      this.chartUi.dispatchEvent(new TimesChangedEvent());
    }
    this.state = "idle";
    this.timesChanged = false;
    this.anchor = null;
    this.anchorEvents = [];
    this.pendingSelection = null;
    this.chartUi.renderSoon();
  }
  
  mouseMove(location) {
    if (this.state === "idle") return;
    if (!this.anchor) return; // all motion events require an anchor
    const delta = {
      xView: location.xView - this.anchor.xView,
      yView: location.yView - this.anchor.yView,
      xSong: location.xSong - this.anchor.xSong,
      ySong: location.ySong - this.anchor.ySong,
      time: location.time - this.anchor.time,
      noteid: location.noteid - this.anchor.noteid,
    };
    switch (this.state) {
      case "selectRect": this.continueSelectRect(location, delta); break;
      case "adjustTime": this.continueAdjustTime(location, delta); break;
      case "adjustA": this.continueAdjustA(location, delta); break;
      case "adjustB": this.continueAdjustB(location, delta); break;
      case "adjustTimeNote": this.continueAdjustTimeNote(location, delta); break;
      case "adjustDuration": this.continueAdjustDuration(location, delta); break;
    }
  }
  
  clickedInDurationZone(location) {
    for (const event of location.events) {
      if (typeof(event.duration) !== "number") continue;
      if (location.yView < event.y) continue;
      if (location.yView >= event.y + event.h) continue;
      if (location.xView >= event.x + event.w) continue;
      if (location.xView < event.x + event.w - this.chartRenderer.rowHeightPixels) continue;
      return true;
    }
    return false;
  }
  
  /* Selection.
   *********************************************************************/
   
  anyEventIsSelected(events) {
    for (const event of events) {
      if (this.selectedEvents.find(e => e.id === event.id)) return true;
    }
    return false;
  }
   
  dropSelection() {
    if (!this.selectedEvents.length) return;
    this.selectedEvents = [];
    this.chartUi.renderSoon();
  }
  
  selectEvents(events) {
    let changed = false;
    for (const event of events) {
      if (this.selectedEvents.find(e => e.id === event.id)) return;
      this.selectedEvents.push(event);
      changed = true;
    }
    if (changed) this.chartUi.renderSoon();
  }
  
  toggleEventsSelected(events) {
    let changed = false;
    for (const event of events) {
      const p = this.selectedEvents.findIndex(e => e.id === event.id);
      if (p >= 0) {
        this.selectedEvents.splice(p, 1);
      } else {
        this.selectedEvents.push(event);
      }
      changed = true;
    }
    if (changed) this.chartUi.renderSoon();
  }
  
  updateSelectedEventsForViewRect(r, initial) {
    const right = r.x + r.w;
    const bottom = r.y + r.h;
    const newIds = [];
    if (!initial) {
      this.selectedEvents = [];
    }
    for (const event of this.chartRenderer.currentEvents) {
      if (event.x >= right) continue;
      if (event.y >= bottom) continue;
      if (r.x >= event.x + event.w) continue;
      if (r.y >= event.y + event.h) continue;
      if (initial) {
        newIds.push(event.id);
      } else {
        this.selectedEvents.push(event);
      }
    }
    if (initial) {
      // Selecting with Shift key and a prior selection.
      // What we commit as the new selection are those in (initial) or (newIds) but not both, hence the "xor" in "pendingSelectionXorIds".
      const newEvents = [];
      // ummm there must be a smarter way to go about this
      const allRelevantIds = Array.from(new Set([...initial, ...newIds]));
      for (const id of allRelevantIds) {
        const isNew = newIds.indexOf(id) >= 0;
        const isInitial = initial.indexOf(id) >= 0;
        if (isNew === isInitial) continue; // <= LNXOR
        let event = this.chartRenderer.currentEvents.find(e => e.id === id);
        if (!event) {
          // Might not be in currentEvents if you select something, scroll away, then shift+select.
          // This is not an unusual circumstance!
          // So keep (selectedEvents) intact until at least this point, and search events there too.
          event = this.selectedEvents.find(e => e.id === id);
        }
        if (event) newEvents.push(event);
      }
      this.selectedEvents = newEvents;
    }
  }
  
  beginSelectRect(location) {
    this.state = "selectRect";
    this.anchor = location;
    this.pendingSelection = {
      x: location.xView,
      y: location.yView,
      w: 1,
      h: 1,
    };
    if (location.shift) {
      this.pendingSelectionXorIds = this.selectedEvents.map(e => e.id);
    } else {
      this.dropSelection();
      this.pendingSelectionXorIds = null;
    }
  }
  
  /* Begin dragging, clicked on an event.
   **********************************************************************/
   
  beginDrag(location, forceState) {
    if (this.selectedEvents.length < 1) return;
    this.undoService.push(this.chartUi.song);
    
    if (forceState) {
      this.state = forceState;
    } else if (location.shift && location.control) {
      this.state = "adjustB";
    } else if (location.control) {
      this.state = "adjustA";
    } else {
      this.state = "adjustTimeNote";
    }
    // Not yet used: "adjustTime"
    
    this.anchor = location;
    this.anchorEvents = this.selectedEvents.map(e => ({
      id: e.id,
      time: e.time,
      a: e.a,
      b: e.b,
      duration: e.duration,
    }));
  }
  
  /* Continuation of dragging.
   *******************************************************************/
   
  continueSelectRect(location, delta) {
    let x = this.anchor.xView;
    let y = this.anchor.yView;
    let w = delta.xView;
    let h = delta.yView;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    this.pendingSelection = { x, y, w, h };
    this.updateSelectedEventsForViewRect(this.pendingSelection, this.pendingSelectionXorIds);
    this.chartUi.renderSoon();
  }
  
  continueAdjust(cb) {
    if (!this.selectedEvents.length) return;
    if (this.selectedEvents.length !== this.anchorEvents.length) return;
    for (let i=0; i<this.selectedEvents.length; i++) {
      const event = this.selectedEvents[i];
      const anchor = this.anchorEvents[i];
      cb(event, anchor);
      if (event.a > 0x7f) event.a = 0x7f;
      else if (event.a < 0) event.a = 0;
      if (event.b > 0x7f) event.b = 0x7f;
      else if (event.b < 0) event.b = 0;
      if (event.time < 0) event.time = 0;
      if (event.duration < 0) event.duration = 0;
      // (selectedEvents) usually, i think always, contains copies of the Song events. Not the real things.
      const real = this.chartUi.song.events.find(e => e.id === event.id);
      if (real) {
        real.time = event.time;
        real.a = event.a;
        real.b = event.b;
        real.duration = event.duration;
      }
    }
    this.chartUi.renderSoon();
  }
  
  continueAdjustTime(location, delta) {
    if (delta.time) this.timesChanged = true;
    this.continueAdjust((event, anchor) => {
      event.time = Math.floor(anchor.time + delta.time);
    });
  }
  
  continueAdjustA(location, delta) {
    this.continueAdjust((event, anchor) => {
      event.a = Math.floor(anchor.a + delta.noteid);
    });
  }
  
  continueAdjustB(location, delta) {
    this.continueAdjust((event, anchor) => {
      event.b = Math.floor(anchor.b - delta.yView); // sic -: up is positive
    });
  }
  
  continueAdjustTimeNote(location, delta) {
    if (delta.time) this.timesChanged = true;
    this.continueAdjust((event, anchor) => {
      event.time = Math.floor(anchor.time + delta.time);
      if ((event.opcode === 0x90) || (event.opcode === 0xa0)) {
        event.a = Math.floor(anchor.a + delta.noteid);
      }
    });
  }
  
  continueAdjustDuration(location, delta) {
    if (delta.time) this.timesChanged = true; // duration doesn't affect sorting, but we might need to recalc width
    this.continueAdjust((event, anchor) => {
      if (typeof(anchor.duration) !== "number") return;
      event.duration = Math.floor(anchor.duration + delta.time);
    });
  }
  
  /* Add event.
   *******************************************************/
   
  addEvent(location) {
    if (!this.chartUi.song) return;
    if (this.state !== "idle") return;
    this.undoService.push(this.chartUi.song);
    const time = Math.max(location.time, 0);
    const event = this.chartUi.song.createEvent(time);
    event.trackid = this.trackidForNewEvent();
    event.chid = this.chidForNewEvent();
    event.a = location.noteid;
    this.selectedEvents = [event];
    this.chartUi.renderSoon();
  }
  
  trackidForNewEvent() {
    const visible = this.chartRenderer.visibility.trackid;
    if (!visible) return 0;
    if (visible.size < 1) return 0;
    return Array.from(visible)[0];
  }
  
  chidForNewEvent() {
    const visible = this.chartRenderer.visibility.chid;
    if (!visible) return 0;
    if (visible.size < 1) return 0;
    return Array.from(visible)[0];
  }
  
  /* Begin manual edit.
   ********************************************************/
   
  editEventsManually(events) {
    if (!events || (events.length < 1)) return;
    if (!this.chartUi.song) return;
    this.undoService.push(this.chartUi.song); // Everything that happens in the modal is a single "undo" batch.
    const eventsModal = this.dom.spawnModal(EventsModal);
    eventsModal.setTicksPerQnote(this.chartUi.song.division);
    eventsModal.setUsPerQnote(this.chartUi.song.getTempo(false));
    eventsModal.setEvents(events);
    
    eventsModal.addEventListener("mid.eventsEdited", (editedEvent) => {
      if (!this.chartUi.song) return;
      let needSort = false, needRender = false;
      for (const edited of editedEvent.events) {
        const e = this.chartUi.song.events.find(ee => ee.id === edited.id);
        if (!e) continue;
        for (const k of Object.keys(edited)) {
          if (e[k] === edited[k]) continue;
          needRender = true;
          if (k === "time") needSort = true;
          e[k] = edited[k];
        }
      }
      if (needSort) {
        this.chartUi.song.sortEvents();
        this.chartUi.dispatchEvent(new TimesChangedEvent());
      }
      if (needRender) this.chartUi.renderSoon();
    });
    
    eventsModal.addEventListener("mid.deleteEvents", (deleteEvent) => {
      if (!this.chartUi.song) return;
      for (const e of deleteEvent.events) {
        const p = this.chartUi.song.events.findIndex(ee => ee.id === e.id);
        if (p < 0) continue;
        this.chartUi.song.events.splice(p, 1);
      }
      this.selectedEvents = this.selectedEvents.filter(e => !deleteEvent.events.find(ee => ee.id === e.id));
      this.chartUi.renderSoon();
    });
  }
  
  applyEdits(events) {
    if (!this.chartUi.song) return;
    let needSort = false, needRender = false;
    for (const edited of events) {
      const e = this.chartUi.song.events.find(ee => ee.id === edited.id);
      if (!e) continue;
      for (const k of Object.keys(edited)) {
        if (e[k] === edited[k]) continue;
        needRender = true;
        if (k === "time") needSort = true;
        e[k] = edited[k];
      }
    }
    if (needSort) {
      this.chartUi.song.sortEvents();
      this.chartUi.dispatchEvent(new TimesChangedEvent());
    }
    if (needRender) this.chartUi.renderSoon();
  }
}
