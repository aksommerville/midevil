/* ChannelHeadersModal.js
 * View and logic for editing channel features which conventionally are set just once, at the start.
 * Program, volume, pan, etc.
 * We must detect whether these things are in fact constant across time, and warn if not.
 */
 
import { Dom } from "../util/Dom.js";
import { MidiSerial } from "../midi/MidiSerial.js";

class HeadersChangedEvent extends Event {
  constructor() {
    super("mid.headersChanged");
  }
}

export class ChannelHeadersModal extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom];
  }
  constructor(element, dom) {
    super();
    this.element = element;
    this.dom = dom;
    
    this.song = null;
    this.toc = []; // [chid, key, eventId] key=program|bankMsb|bankLsb|volume|pan
    
    this.buildUi();
  }
  
  setup(song) {
    this.song = song;
    this.populateUi();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    const table = this.dom.spawn(this.element, "TABLE", { "on-change": (event) => this.onChange(event) });
    
    const headerRow = this.dom.spawn(table, "TR");
    this.dom.spawn(headerRow, "TH", "Channel");
    this.dom.spawn(headerRow, "TH", "Program");
    this.dom.spawn(headerRow, "TH", "Volume");
    this.dom.spawn(headerRow, "TH", "Pan");
    this.dom.spawn(headerRow, "TH", "Comment");
    
    for (let chid=0; chid<16; chid++) {
      const tr = this.dom.spawn(table, "TR", { "data-chid": chid });
      this.dom.spawn(tr, "TD", ["eventId"], chid);
      
      const tdProgram = this.dom.spawn(tr, "TD", ["program"]);
      const inputProgram = this.dom.spawn(tdProgram, "INPUT", {
        type: "number",
        name: "program",
        min: -1,
        max: 0x000fffff, // including 14-bit Bank ID in high bits
        value: -1,
      });
      const programTattle = this.dom.spawn(tdProgram, "SPAN", ["programTattle"], "\u00a0");
      inputProgram.addEventListener("change", () => this.updateProgramTattle(chid));
      
      const tdVolume = this.dom.spawn(tr, "TD", ["volume"]);
      const inputVolume = this.dom.spawn(tdVolume, "INPUT", {
        type: "range",
        name: "volume",
        min: -1,
        max: 0x7f,
        value: -1,
      });
      const volumeTattle = this.dom.spawn(tdVolume, "SPAN", ["volumeTattle"], "---");
      inputVolume.addEventListener("input", () => this.updateVolumeTattle(chid));
      
      const tdPan = this.dom.spawn(tr, "TD", ["pan"]);
      const inputPan = this.dom.spawn(tdPan, "INPUT", {
        type: "range",
        name: "pan",
        min: -1,
        max: 0x7f,
        value: -1,
      });
      const panTattle = this.dom.spawn(tdPan, "SPAN", ["panTattle"], "---");
      inputPan.addEventListener("input", () => this.updatePanTattle(chid));
      
      this.dom.spawn(tr, "TD", ["comment"]);
    }
  }
  
  populateUi() {
    const model = this.generateHeadersModel(this.song ? this.song.events : []);
    for (let chid=0; chid<16; chid++) {
      const channel = model[chid];
      const row = this.element.querySelector(`tr[data-chid='${chid}']`);
      row.querySelector("input[name='program']").value = channel.program;
      row.querySelector("input[name='volume']").value = channel.volume;
      row.querySelector("input[name='pan']").value = channel.pan;
      row.querySelector(".comment").innerText = channel.comment;
      this.updateProgramTattle(chid);
      this.updateVolumeTattle(chid);
      this.updatePanTattle(chid);
    }
  }
  
  updateProgramTattle(chid) {
    const input = this.element.querySelector(`tr[data-chid='${chid}'] input[name='program']`);
    const tattle = this.element.querySelector(`tr[data-chid='${chid}'] .programTattle`);
    tattle.innerText = MidiSerial.reprProgram(+input.value) || "\u00a0";
  }
  
  updateVolumeTattle(chid) {
    const input = this.element.querySelector(`tr[data-chid='${chid}'] input[name='volume']`);
    const tattle = this.element.querySelector(`tr[data-chid='${chid}'] .volumeTattle`);
    tattle.innerText = (input.value >= 0) ? input.value : "---";
  }
  
  updatePanTattle(chid) {
    const input = this.element.querySelector(`tr[data-chid='${chid}'] input[name='pan']`);
    const tattle = this.element.querySelector(`tr[data-chid='${chid}'] .panTattle`);
    tattle.innerText = (input.value >= 0) ? (input.value - 0x40) : "---";
  }
  
  onChange(event) {
    if (!this.song) return;
    let chid = null;
    for (let row = event.target; row; row = row.parentNode) {
      if (row.tagName === "TR") {
        chid = +row.getAttribute("data-chid");
        break;
      } else if (row.tagName === "TABLE") {
        break;
      }
    }
    if (chid === null) return;
    const key = event.target.name;
    const value = +event.target.value;
    if (key === "program") {
      if (value < 0) {
        this.fieldChanged(chid, "bankMsb", -1);
        this.fieldChanged(chid, "bankLsb", -1);
        this.fieldChanged(chid, "program", -1);
      } else if (value & 0x1fc000) {
        this.fieldChanged(chid, "bankMsb", (value >> 14) & 0x7f);
        this.fieldChanged(chid, "bankLsb", (value >> 7) & 0x7f);
        this.fieldChanged(chid, "program", value & 0x7f);
      } else if (value & 0x003f80) {
        this.fieldChanged(chid, "bankMsb", -1);
        this.fieldChanged(chid, "bankLsb", (value >> 7) & 0x7f);
        this.fieldChanged(chid, "program", value & 0x7f);
      } else {
        this.fieldChanged(chid, "bankMsb", -1);
        this.fieldChanged(chid, "bankLsb", -1);
        this.fieldChanged(chid, "program", value & 0x7f);
      }
    } else {
      this.fieldChanged(chid, key, value);
    }
    this.dispatchEvent(new HeadersChangedEvent());
  }
  
  fieldChanged(chid, key, value) {
    const tocp = this.toc.findIndex(e => ((e[0] === chid) && (e[1] === key)));
    if (value < 0) { // <0 means delete the event
      if (tocp < 0) return;
      this.song.deleteEventById(this.toc[tocp][2]);
      this.toc.splice(tocp, 1);
      
    } else { // Update or add.
      if (tocp < 0) {
        const event = this.song.createEvent(0);
        event.chid = chid;
        switch (key) {
          case "bankMsb": event.opcode = 0xb0; event.a = 0x00; event.b = value; break;
          case "bankLsb": event.opcode = 0xb0; event.a = 0x20; event.b = value; break;
          case "program": event.opcode = 0xc0; event.a = value; break;
          case "volume": event.opcode = 0xb0; event.a = 0x07; event.b = value; break;
          case "pan": event.opcode = 0xb0; event.a = 0x07; event.b = value; break;
        }
        this.toc.push([chid, key, event.id]);
      } else {
        let event = this.song.events.find(e => e.id === this.toc[tocp][2]);
        if (event) {
          if (key === "program") event.a = value;
          else event.b = value;
        }
      }
    }
  }
  
  /* Generate model.
   * Returns an array ready to apply to the UI.
   * Also rebuilds (this.toc) with lookups for event IDs.
   ******************************************************************************/
  
  generateHeadersModel(events) {
    this.toc = [];
    if (!events) events = [];
    const model = [];
    for (let chid=0; chid<16; chid++) {
      model.push({ warnings: [] });
    }
    for (const event of events) {
      if (event.chid < 0) continue; // Might someday want to check MIDI Channel Prefix and associated Meta events?
      const channel = model[event.chid];
      switch (event.opcode) {
      
        case 0xb0: switch (event.a) {
        
            case 0x00: { // Bank MSB
                if (event.time) {
                  channel.warnings.push(`Bank MSB at ${event.time}`);
                }
                if (channel.hasOwnProperty("bankMsb")) {
                  if (channel.bankMsb !== event.b) {
                    channel.warnings.push(`Multiple Bank MSB (${channel.bankMsb}, ${event.b})`);
                  }
                } else {
                  channel.bankMsb = event.b;
                  this.toc.push([event.chid, "bankMsb", event.id]);
                }
              } break;
              
            case 0x07: { // Volume MSB
                if (event.time) {
                  channel.warnings.push(`Volume at ${event.time}`);
                }
                if (channel.hasOwnProperty("volume")) {
                  if (channel.volume !== event.b) {
                    channel.warnings.push(`Multiple volume (${channel.volume}, ${event.b})`);
                  }
                } else {
                  channel.volume = event.b;
                  this.toc.push([event.chid, "volume", event.id]);
                }
              } break;
              
            case 0x0a: { // Pan MSB
                if (event.time) {
                  channel.warnings.push(`Pan at ${event.time}`);
                }
                if (channel.hasOwnProperty("pan")) {
                  if (channel.pan !== event.b) {
                    channel.warnings.push(`Multiple pan (${channel.pan}, ${event.b})`);
                  }
                } else {
                  channel.pan = event.b;
                  this.toc.push([event.chid, "pan", event.id]);
                }
              } break;
              
            case 0x20: { // Bank LSB
                if (event.time) {
                  channel.warnings.push(`Bank LSB at ${event.time}`);
                }
                if (channel.hasOwnProperty("bankLsb")) {
                  if (channel.bankLsb !== event.b) {
                    channel.warnings.push(`Multiple Bank LSB (${channel.bankLsb}, ${event.b})`);
                  }
                } else {
                  channel.bankLsb = event.b;
                  this.toc.push([event.chid, "bankLsb", event.id]);
                }
              } break;
              
            case 0x27: { // Volume LSB
                channel.warnings.push(`Volume LSB present, we will ignore`);
              } break;
              
            case 0x2a: { // Pan LSB
                channel.warnings.push(`Pan LSB present, we will ignore`);
              } break;
              
          } break;
          
        case 0xc0: { // Program Change
            if (event.time) {
              channel.warnings.push(`Program change at ${event.time}`);
            }
            if (channel.hasOwnProperty("program")) {
              if (channel.program !== event.a) {
                channel.warnings.push(`Multiple programs (${channel.program}, ${event.a})`);
              }
            } else {
              channel.program = event.a;
              this.toc.push([event.chid, "program", event.id]);
            }
          } break;
      }
    }
    return model.map(src => {
      const dst = {
        program: -1,
        volume: -1,
        pan: -1,
        comment: "",
      };
      if (src.hasOwnProperty("program") || src.hasOwnProperty("bankLsb") || src.hasOwnProperty("bankMsb")) {
        dst.program = (src.program || 0) | ((src.bankLsb || 0) << 7) | ((src.bankMsb || 0) << 14);
      }
      if (src.hasOwnProperty("volume")) dst.volume = src.volume;
      if (src.hasOwnProperty("pan")) dst.pan = src.pan;
      if (src.warnings.length > 0) {
        dst.comment = src.warnings.join("\n");
      }
      return dst;
    });
  }
}
