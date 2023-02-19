/* VisibilityUi.js
 * Button and popup menu for controlling which events are visible in the editor.
 *
 * TODO Would be really cool to highlight Channel and Opcode options based on whether such events exist.
 * This would have to update dynamically as the Song changes, and as the rest of the filter changes.
 * (it shows "will there be any events if I pick this thing?")
 */
 
import { Dom } from "../util/Dom.js";

/* interface VisibilityModel {
  // Designing this to allow for a possible future with fine-grained controls, eg select multiple channels.
  // The UI we present will be simpler, producing only null or single-value Sets.
  // Empty set is *not* the same as null -- null means "everything", empty means "nothing".
  trackid: Set<number> | null;
  chid: Set<number> | null;
  opcode: Set<number> | null; // eg "don't show Channel Pressure"
  event: { // eg "show Meta Set Tempo"; in this case null and empty are the same thing
    opcode: number;
    a: number | null;
    b: number | null;
  }[] | null;
} */

class VisibilityChangeEvent extends Event {
  constructor(model) {
    super("mid.visibilityChange");
    this.model = model;
  }
}

export class VisibilityUi extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom];
  }
  constructor(element, dom) {
    super();
    this.element = element;
    this.dom = dom;
    
    // I'm getting sick of this not updating, and not up to fixing it.
    // Just assume there will be no more than 16 tracks. That's sensible -- I normally put each channel on its own track.
    this.trackCount = 16;
    
    this.element.classList.add("poppable");
    
    this.buildUi();
    this.populateUi();
  }
  
  setTrackCount(c) {
    return;
    if (c === this.trackCount) return;
    this.trackCount = c;
    this.populateUi();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    this.dom.spawn(this.element, "INPUT", {
      type: "button",
      value: "Visibility",
      "on-click": () => this.onTogglePopup(),
    });
    
    const popup = this.dom.spawn(this.element, "DIV", ["popup", "hidden"]);
    const table = this.dom.spawn(popup, "TABLE");
    table.addEventListener("change", (event) => this.onChange(event));
    
    const trackRow = this.spawnFilterRow(table, "Track");
    this.dom.spawn(trackRow, "SELECT", ["trackid"]);

    const channelRow = this.spawnFilterRow(table, "Channel");
    const channelSelect = this.dom.spawn(channelRow, "SELECT", ["chid"]);
    this.dom.spawn(channelSelect, "OPTION", "All Channels", { value: "", selected: "selected" });
    this.dom.spawn(channelSelect, "OPTION", "Channelless Events", { value: "-1" });
    for (let i=0; i<16; i++) {
      this.dom.spawn(channelSelect, "OPTION", `Channel ${i}`, { value: i.toString() });
    }
    
    const opcodeRow = this.spawnFilterRow(table, "Opcode");
    const opcodeSelect = this.dom.spawn(opcodeRow, "SELECT", ["opcode"]);
    this.dom.spawn(opcodeSelect, "OPTION", "All Opcodes", { value: "", selected: "selected" });
    this.dom.spawn(opcodeSelect, "OPTION", "0x80 Note Off (not used)", { value: "0x80" });
    this.dom.spawn(opcodeSelect, "OPTION", "0x90 Note On", { value: "0x90" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xa0 Note Adjust", { value: "0xa0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xb0 Control Change", { value: "0xb0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xc0 Program Change", { value: "0xc0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xd0 Channel Pressure", { value: "0xd0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xe0 Pitch Wheel", { value: "0xe0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xf0 Sysex (unterminated)", { value: "0xf0" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xf7 Sysex (terminated)", { value: "0xf7" });
    this.dom.spawn(opcodeSelect, "OPTION", "0xff Meta", { value: "0xff" });
  }
  
  spawnFilterRow(table, label) {
    const tr = this.dom.spawn(table, "TR");
    //this.dom.spawn(tr, "TD", ["key"], label); //XXX This doesn't add much; our select labels are pretty much context-free
    return this.dom.spawn(tr, "TD", ["value"]);
  }
  
  populateUi() {
    const trackSelect = this.element.querySelector("select.trackid");
    trackSelect.innerHTML = "";
    this.dom.spawn(trackSelect, "OPTION", "All Tracks", { value: "", selected: "selected" });
    for (let i=0; i<this.trackCount; i++) {
      this.dom.spawn(trackSelect, "OPTION", `Track ${i}`, { value: i.toString() });
    }
  }
  
  onTogglePopup() {
    const popup = this.element.querySelector(".popup");
    if (popup.classList.contains("hidden")) {
      popup.classList.remove("hidden");
    } else {
      popup.classList.add("hidden");
    }
  }
  
  onChange(event) {
    const trackid = this.element.querySelector("select.trackid").value;
    const chid = this.element.querySelector("select.chid").value;
    const opcode = this.element.querySelector("select.opcode").value;
    this.dispatchEvent(new VisibilityChangeEvent({
      trackid: trackid ? new Set([+trackid]) : null,
      chid: chid ? new Set([+chid]) : null,
      opcode: opcode ? new Set([+opcode]) : null,
      event: null,
    }));
  }
}
