/* EventListModal.js
 * Presents a filterable list of all events.
 * Click one event to open an EventsModal for it.
 * (contrast to EventsModal, which displays events aggregated, we show them verbatim).
 */
 
import { Dom } from "../util/Dom.js";
import { MidiSerial } from "../midi/MidiSerial.js";
import { EventsModal } from "./EventsModal.js";

class EventChangedEvent extends Event {
  constructor(event) {
    super("mid.eventChanged");
    this.event = event;
  }
}

export class EventListModal extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom];
  }
  constructor(element, dom) {
    super();
    this.element = element;
    this.dom = dom;
    
    this.song = null;
    this.selectedEventIds = [];
    this.visibility = {};
    
    this.buildUi();
  }
  
  setup(song, selectedEvents, visibility) {
    this.song = song;
    this.selectedEventIds = selectedEvents ? selectedEvents.map(e => e.id) : [];
    this.visibility = visibility || {};
    this.filterAndDisplay();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    const filterRow = this.dom.spawn(this.element, "DIV", ["filterRow"], { "on-change": () => this.filterAndDisplay() });
    this.spawnMenu(filterRow, "filterSource", ["All", "Visible", "Selected"]);
    this.spawnMenu(filterRow, "opcodes", ["All", "Notes", "Aftertouch,Wheel", "Meta,Control,Program"]);
    
    const eventListScroller = this.dom.spawn(this.element, "DIV", ["eventListScroller"]);
    const eventList = this.dom.spawn(eventListScroller, "TABLE", ["eventList"], { "on-click": event => this.onTableClick(event) });
  }
  
  spawnMenu(parent, name, content) {
    const select = this.dom.spawn(parent, "SELECT", { name });
    for (const label of content) {
      this.dom.spawn(select, "OPTION", label, { value: label });
    }
  }
  
  filterAndDisplay() {
    const eventList = this.element.querySelector(".eventList");
    eventList.innerHTML = "";
    const trHeader = this.dom.spawn(eventList, "TR", ["header"]);
    for (const label of ["Move", "ID", "Time", "Track", "Channel", "Opcode", "A", "B", "Duration", "Off Velocity"]) {
      this.dom.spawn(trHeader, "TD", label);
    }
    if (!this.song) return;
    
    const filterSource = this.element.querySelector("select[name='filterSource']").value;
    const opcodes = this.element.querySelector("select[name='opcodes']").value;
    let events = [];
    switch (filterSource) {
      case "All": events = this.song.events; break;
      case "Visible": events = this.applyVisibility(this.song.events, this.visibility); break;
      case "Selected": events = this.selectedEventIds.map(id => this.song.events.find(e => e.id === id)).filter(e => e); break;
    }
    switch (opcodes) {
      case "All": break;
      case "Notes": events = events.filter(e => e.opcode === 0x90); break;
      case "Aftertouch,Wheel": events = events.filter(e => ((e.opcode === 0xa0) || (e.opcode === 0xd0) || (e.opcode === 0xe0))); break;
      case "Meta,Control,Program": events = events.filter(e => ((e.opcode === 0xb0) || (e.opcode === 0xc0) || (e.opcode >= 0xf0))); break;
    }
    
    for (const event of events) {
      const tr = this.dom.spawn(eventList, "TR", ["event"], { "data-event-id": event.id });
      this.fillRowWithEvent(tr, event);
    }
  }
  
  rewriteTableRowForChangedEvent(event) {
    const tr = this.element.querySelector(`tr[data-event-id="${event.id}"]`);
    if (!tr) return;
    tr.innerHTML = "";
    this.fillRowWithEvent(tr, event);
  }
  
  fillRowWithEvent(tr, event) {
    const tdButtons = this.dom.spawn(tr, "TD");
    this.dom.spawn(tdButtons, "INPUT", { type: "button", value: "^", "on-click": (e) => this.onMoveEvent(e, event, -1) });
    this.dom.spawn(tdButtons, "INPUT", { type: "button", value: "v", "on-click": (e) => this.onMoveEvent(e, event, 1) });
    this.dom.spawn(tr, "TD", event.id);
    this.dom.spawn(tr, "TD", event.time);
    this.dom.spawn(tr, "TD", event.trackid);
    this.dom.spawn(tr, "TD", (event.chid >= 0) ? event.chid : "");
    this.dom.spawn(tr, "TD", `0x${event.opcode.toString(16).padStart(2, '0')} ${MidiSerial.reprOpcode(event.opcode)}`);
    this.dom.spawn(tr, "TD", this.reprA(event.opcode, event.a));
    this.dom.spawn(tr, "TD", this.reprB(event.opcode, event.b));
    this.dom.spawn(tr, "TD", event.duration || "");
    this.dom.spawn(tr, "TD", event.offVelocity || "");
  }
  
  applyVisibility(events, visibility) {
    const output = [];
    for (const event of events) {
      if (visibility.trackid) {
        if (!visibility.trackid.has(event.trackid)) continue;
      }
      if (visibility.chid) {
        if (!visibility.chid.has(event.chid)) continue;
      }
      if (visibility.opcode) {
        if (!visibility.opcode.has(event.opcode)) continue;
      }
      if (visibility.event && visibility.event.length) {
        let ok = false;
        for (const filter of visibility.event) {
          if (filter.opcode !== event.opcode) continue;
          if ((typeof(filter.a) === "number") && (filter.a !== event.a)) ;
          else if ((typeof(filter.b) === "number") && (filter.b !== event.b)) ;
          else { ok = true; break; }
        }
        if (!ok) continue;
      }
      output.push(event);
    }
    return output;
  }
  
  reprA(opcode, a) {
    switch (opcode) {
      case 0x80: case 0x90: case 0xa0: return MidiSerial.reprNote(a) || a;
      case 0xb0: return MidiSerial.reprControlKey(a) || a;
      case 0xff: return MidiSerial.reprMetaKey(a) || a;
    }
    return a;
  }
  
  reprB(opcode, b) {
    return b;
  }
  
  onTableClick(event) {
    if (!this.song) return;
    for (let row = event.target; row; row = row.parentNode) {
      if (row.tagName === "TR") {
        const id = +row.getAttribute("data-event-id");
        if (id) {
          const event = this.song.events.find(e => e.id === id);
          if (event) {
            this.editEvent(event);
          }
        }
        return;
      } else if (row.tagName === "TABLE") {
        return;
      }
    }
  }
  
  onMoveEvent(domEvent, songEvent, d) {
    domEvent.stopPropagation();
    if ((d !== -1) && (d !== 1)) return;
    if (!this.song) return;
    const p = this.song.events.findIndex(e => e.id === songEvent.id);
    if (p < 0) return;
    
    // We allow this movement only if the next event in that direction is at the same time.
    const neighborP = p + d;
    if ((neighborP < 0) || (neighborP >= this.song.events.length)) return;
    const neighbor = this.song.events[neighborP];
    if (neighbor.time !== songEvent.time) return;
    
    this.song.events.splice(p, 1);
    if (d === -1) {
      this.song.events.splice(p - 1, 0, songEvent);
    } else {
      this.song.events.splice(p + 1, 0, songEvent);
    }
    this.filterAndDisplay();
    // Don't fire an event. Changing order in the list should not affect anything else. (TODO prove me wrong...)
  }
  
  editEvent(event) {
    const eventsModal = this.dom.spawnModal(EventsModal);
    eventsModal.setTicksPerQnote(this.song.division);
    eventsModal.setEvents([event]);
    
    eventsModal.addEventListener("mid.eventsEdited", (editedEvent) => {
      this.dispatchEvent(new EventChangedEvent(editedEvent.events[0]));
      this.rewriteTableRowForChangedEvent(editedEvent.events[0]);
    });
    
    eventsModal.addEventListener("mid.deleteEvents", (deleteEvent) => {
      if (!this.song) return;
      for (const e of deleteEvent.events) {
        const p = this.song.events.findIndex(ee => ee.id === e.id);
        if (p < 0) continue;
        this.song.events.splice(p, 1);
      }
      this.filterAndDisplay();
    });
  }
}
