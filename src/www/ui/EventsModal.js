/* EventsModal.js
 * Content of a modal for editing one or more song events.
 * We contain the logic for combining and editing in aggregate, all that cool stuff.
 */
 
import { Dom } from "../util/Dom.js";
import { QuantizationModal } from "./QuantizationModal.js";
import { MidiSerial } from "../midi/MidiSerial.js";

class EventsEditedEvent extends Event {
  constructor(events) {
    super("mid.eventsEdited");
    this.events = events;
  }
}

class DeleteEventsEvent extends Event {
  constructor(events) {
    super("mid.deleteEvents");
    this.events = events;
  }
}

export class EventsModal extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom];
  }
  constructor(element, dom) {
    super();
    this.element = element;
    this.dom = dom;
    
    this.events = [];
    this.originalEvents = [];
    this.ticksPerQnote = 0; // Necessary for quantization, if the user asks for that.
    
    this.element.addEventListener("change", (event) => this.onChange(event));
  }
  
  setEvents(events) {
    this.originalEvents = this.copyEvents(events);
    this.events = this.copyEvents(events);
    this.populateUi();
  }
  
  setTicksPerQnote(division) {
    this.ticksPerQnote = division || 0;
  }
  
  populateUi() {
    this.element.innerHTML = "";
    if (this.events.length < 1) {
      this.populateNoEvents();
    } else if (this.events.length === 1) {
      this.populateSingle(this.events[0]);
    } else {
      this.populateMultiple(this.events);
    }
  }
  
  populateNoEvents() {
    this.element.innerText = "No events selected.";
  }
  
  copyEvents(events) {
    if (!events) return [];
    return events.map(e => {
      if (e.serial) { // the only mutable field
        return {
          ...e,
          time: Math.floor(e.time),
          serial: new Uint8Array(e.serial),
        };
      }
      return {
        ...e,
        time: Math.floor(e.time),
      };
    });
  }
  
  labelA(opcode) {
    switch (opcode) {
      case 0x80: return "Note";
      case 0x90: return "Note";
      case 0xa0: return "Note";
      case 0xb0: return "Key";
      case 0xc0: return "Program";
      case 0xd0: return "Pressure";
      case 0xe0: return "LSB";
      case 0xff: return "Type";
    }
    return "";
  }
  
  labelB(opcode) {
    switch (opcode) {
      case 0x80: return "Velocity";
      case 0x90: return "Velocity";
      case 0xa0: return "Pressure";
      case 0xb0: return "Value";
      case 0xe0: return "MSB";
    }
    return "";
  }
  
  /* Events.
   ******************************************************************/
   
  onChange(event) {
    if (!event || !event.target) return;
    const name = event.target.name;
    const relative = event.target.getAttribute("data-relativity") === "relative";
    const value = +event.target.value; // TODO (serial) will need special handling.
    if (this.applyChange(name, relative, value)) {
      // Copy on the way out, just to be on the safe side.
      this.dispatchEvent(new EventsEditedEvent(this.copyEvents(this.events)));
    }
  }
  
  onQuantize() {
    const modal = this.dom.spawnModal(QuantizationModal);
    modal.setup(this.ticksPerQnote, this.events);
    modal.addEventListener("mid.quantized", (event) => {
      this.events = this.copyEvents(event.events);
      this.populateUi();
      this.dispatchEvent(new EventsEditedEvent(this.copyEvents(event.events)));
    });
  }
  
  onReset() {
    this.events = this.copyEvents(this.originalEvents);
    this.dispatchEvent(new EventsEditedEvent(this.events));
    this.populateUi();
  }
  
  onDelete() {
    this.dispatchEvent(new DeleteEventsEvent(this.events));
    this.dom.popModal(this);
  }
  
  /* Apply one change from UI to model.
   * Return true if something did in fact change. Do not trigger events.
   ************************************************************************/
   
  applyChange(key, relative, value) {
    if (!key) return false;
    if (this.originalEvents.length !== this.events.length) return false; // oops
    let changed = false;
    for (let i=0; i<this.events.length; i++) {
      const original = this.originalEvents[i];
      const event = this.events[i];
      if (!event.hasOwnProperty(key)) continue; // eg "serial" or "duration", for a mixed set of events.
      let subvalue = value;
      if (relative) subvalue = (original[key] || 0) + value;
      subvalue = this.sanitizeValue(key, subvalue);
      if (event[key] === subvalue) continue;
      event[key] = subvalue;
      changed = true;
    }
    return changed;
  }
  
  sanitizeValue(key, value) {
    if (typeof(value) === "number") value = Math.floor(value);
    switch (key) {
      case "time": if (value < 0) return 0; break;
      case "trackid": if (value < 0) return 0; break;
      case "chid": if (value < 0) return 0; break;
      case "opcode": if (value < 0x80) return 0x80; if (value > 0xff) return 0xff; break;
      case "a": if (value < 0) return 0; if (value > 0x7f) return 0x7f; break;
      case "b": if (value < 0) return 0; if (value > 0x7f) return 0x7f; break;
      case "duration": if (value < 0) return 0; break;
      case "offVelocity": if (value < 0) return 0; if (value > 0x7f) return 0x7f; break;
    }
    return value;
  }
  
  /* Table helpers.
   * If your label is false, we do not create a row.
   * That's a convenience for the form builders, eg no "B" row if the event doesn't use B.
   **********************************************************************/
   
  spawnWideTextRow(table, label) {
    if (!label) return;
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(table, "TD", { colspan: 2 }, label);
  }
  
  spawnImmutableRow(table, label, value) {
    if (!label) return;
    if ((typeof(value) !== "number") && (typeof(value) !== "string")) value = "";
    else value = value.toString();
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    this.dom.spawn(tr, "TD", ["value"], value);
  }
  
  spawnNumberRow(table, key, label, lo, hi, value, extra) {
    if (!label) return;
    if ((typeof(value) !== "number") && (typeof(value) !== "string")) value = "";
    else value = value.toString();
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    const td = this.dom.spawn(tr, "TD", ["value"]);
    const input = this.dom.spawn(td, "INPUT", {
      type: "number",
      min: lo,
      max: hi,
      value,
      name: key,
      "data-relativity": "absolute",
    });
    switch (extra) {
      case "note": {
          const tattle = this.dom.spawn(td, "SPAN", MidiSerial.reprNote(+value));
          input.addEventListener("change", () => {
            tattle.innerText = MidiSerial.reprNote(+input.value);
          });
        } break;
      case "control": {
          const tattle = this.dom.spawn(td, "SPAN", MidiSerial.reprControlKey(+value));
          input.addEventListener("change", () => {
            tattle.innerText = MidiSerial.reprControlKey(+input.value);
          });
        } break;
      case "program": {
          const tattle = this.dom.spawn(td, "SPAN", MidiSerial.reprProgram(+value));
          input.addEventListener("change", () => {
            tattle.innerText = MidiSerial.reprProgram(+input.value);
          });
        } break;
      case "meta": {
          const tattle = this.dom.spawn(td, "SPAN", MidiSerial.reprMetaKey(+value));
          input.addEventListener("change", () => {
            tattle.innerText = MidiSerial.reprMetaKey(+input.value);
          });
        } break;
    }
  }
  
  spawnRelativeNumberRow(table, key, label) {
    if (!label) return;
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    const td = this.dom.spawn(tr, "TD", ["value"]);
    this.dom.spawn(td, "SPAN", "+");
    const input = this.dom.spawn(td, "INPUT", {
      type: "number",
      name: key,
      "data-relativity": "relative",
    });
  }
  
  spawnEnumRow(table, key, label, options/*[value,label]*/, value) {
    if (!label) return;
    if ((typeof(value) !== "number") && (typeof(value) !== "string")) value = "";
    else value = value.toString();
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    const td = this.dom.spawn(tr, "TD", ["value"]);
    const select = this.dom.spawn(td, "SELECT", {
      name: key,
      "data-relativity": "absolute",
    });
    for (const [ov, ol] of options) {
      this.dom.spawn(select, "OPTION", { value: ov.toString() }, ol);
    }
    select.value = value;
  }
  
  spawnHexdumpRow(table, key, label, value) {
    if (!label) return;
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    const td = this.dom.spawn(tr, "TD", ["value"]);
    const input = this.dom.spawn(td, "INPUT", {
      type: "text",
      name: key,
      "data-relativity": "absolute",
    });
    //TODO hexdump rows for serial
  }
  
  spawnButtonsRow(table, labelsAndCallbacks) {
    const tr = this.dom.spawn(table, "TR");
    const td = this.dom.spawn(tr, "TD", { colspan: "2" });
    for (const [label, cb] of labelsAndCallbacks) {
      this.dom.spawn(td, "INPUT", {
        type: "button",
        value: label,
        "on-click": cb,
      });
    }
  }
  
  /* Single event. We're your basic form, no surprises.
   ******************************************************************/
   
  populateSingle(event) {
    const table = this.dom.spawn(this.element, "TABLE");
    this.spawnWideTextRow(table, "Editing 1 event");
    this.spawnImmutableRow(table, "ID", event.id);
    this.spawnNumberRow(table, "time", "Time", 0, 0x7fffffff, event.time);
    this.spawnNumberRow(table, "trackid", "Track", 0, 99, event.trackid);
    if (event.chid >= 0) { // Meta and Sysex have (chid==-1), and it's not meaningful or mutable.
      this.spawnNumberRow(table, "chid", "Channel", 0, 15, event.chid);
    }
    this.spawnEnumRow(table, "opcode", "Opcode", EventsModal.OPCODE_OPTIONS, event.opcode);
    this.spawnNumberRow(table, "a", this.labelA(event.opcode), 0, 0x7f, event.a,
      (event.opcode === 0x90) ? "note" :
      (event.opcode === 0xb0) ? "control" :
      (event.opcode === 0xc0) ? "program" :
      (event.opcode === 0xff) ? "meta" :
    "");
    this.spawnNumberRow(table, "b", this.labelB(event.opcode), 0, 0x7f, event.b);
    if (event.opcode === 0x90) { // Note On only.
      this.spawnNumberRow(table, "duration", "Duration", 0, 0x7fffffff, event.duration || 0);
      this.spawnNumberRow(table, "offVelocity", "Off Velocity", 0, 0x7f, event.offVelocity);
    }
    if (event.opcode >= 0xf0) { // Meta and Sysex only.
      this.spawnHexdumpRow(table, "serial", "Serial", event.serial);
    }
    this.spawnButtonsRow(table, [
      ["Quantize", () => this.onQuantize()],
      ["Reset", () => this.onReset()],
      ["Delete", () => this.onDelete()],
    ]);
  }
  
  /* Multiple events.
   * This is kind of confusing. What are the rules?
   *  - Time can always be edited relatively.
   *  - Trackid is mutable if all events match.
   *  - Chid mutable if matching and not -1.
   *  - Opcode mutable if matching.
   *  - A,B: If opcodes match, mutable relatively.
   *  - Duration: Mutable relatively if any Note On present. Ignore for any other opcodes present.
   *  - Off Velocity: ''
   *  - Serial: Immutable.
   ****************************************************************/
   
  populateMultiple(events) {
    const opcodesMatch = events.reduce((a, v) => (v.opcode === a) ? a : null, events[0].opcode);
    const table = this.dom.spawn(this.element, "TABLE");
    this.spawnWideTextRow(table, `Editing ${events.length} events`);
    this.spawnImmutableRow(table, "ID", this.aggregateValuesForDisplay(events.map(e => e.id)));
    this.spawnRelativeNumberRow(table, "time", "Time");
    this.mutableRowIfMatching(table, "trackid", "Track", 0, 99, events.map(e => e.trackid));
    this.mutableRowIfMatching(table, "chid", "Channel", -1, 15, events.map(e => e.chid), (chid) => chid >= 0);
    if (opcodesMatch) {
      this.spawnEnumRow(table, "opcode", "Opcode", EventsModal.OPCODE_OPTIONS, events[0].opcode);
      this.spawnRelativeNumberRow(table, "a", this.labelA(events[0].opcode));
      this.spawnRelativeNumberRow(table, "b", this.labelB(events[0].opcode));
    } else {
      this.spawnImmutableRow(table, "Opcode", this.aggregateValuesForDisplay(events.map(e => e.opcode)));
      this.spawnImmutableRow(table, "A", this.aggregateValuesForDisplay(events.map(e => e.a)));
      this.spawnImmutableRow(table, "B", this.aggregateValuesForDisplay(events.map(e => e.b)));
    }
    if (events.find(e => e.opcode === 0x90)) { // at least one Note On
      this.spawnRelativeNumberRow(table, "duration", "Duration");
      this.spawnRelativeNumberRow(table, "offVelocity", "Off Velocity");
    }
    // Ignoring (serial). Not sure there's anything we can or should do about those, in a multi-event case.
    this.spawnButtonsRow(table, [
      ["Quantize", () => this.onQuantize()],
      ["Reset", () => this.onReset()],
      // "Delete" works just the same as for single, but let's accentuate the fact that there's more than one event.
      [`!!! Delete ${events.length} events !!!`, () => this.onDelete()],
    ]);
  }
  
  aggregateValuesForDisplay(values) {
    const set = new Set(values);
    const limit = 10;
    if (set.size > limit) return `${set.size} unique values`;
    return Array.from(set).sort().join(", ");
  }
  
  mutableRowIfMatching(table, key, label, lo, hi, values, condition) {
    for (let i=1; i<values.length; i++) {
      if (values[0] !== values[i]) {
        return this.spawnImmutableRow(
          table, label, this.aggregateValuesForDisplay(values)
        );
      }
    }
    if (condition && !condition(values[0])) {
      return this.spawnImmutableRow(
        table, label, values[0]
      );
    }
    return this.spawnNumberRow(table, key, label, lo, hi, values[0]);
  }
}

EventsModal.OPCODE_OPTIONS = [
  [0x80, "0x80 Note Off"],
  [0x90, "0x90 Note On"],
  [0xa0, "0xa0 Note Adjust"],
  [0xb0, "0xb0 Control Change"],
  [0xc0, "0xc0 Program Change"],
  [0xd0, "0xd0 Channel Pressure"],
  [0xe0, "0xe0 Pitch Wheel"],
  [0xf0, "0xf0 Sysex (unterminated)"],
  [0xf7, "0xf7 Sysex (terminated)"],
  [0xff, "0xff Meta"],
];
