/* MynthChannelHeadersModal.js
 * Special channel headers editor specific to my minimal synthesizer "mynth".
 * https://github.com/aksommerville/gamek
 *
  0x07 Volume
  0x0c Attack time ms, minimum or no-velocity
  0x0d Attack level, ''
  0x0e Decay time ms, ''
  0x0f Sustain level, ''
  0x10 Release time 8ms, ''
  0x2c Attack time ms, maximum velocity
  0x2d Attack level, ''
  0x2e Decay time ms, ''
  0x2f Sustain level, ''
  0x30 Release time 8ms, ''
  0x40 Enable sustain
  0x46 Wave select, 0..7
  0x47 Wheel range, dimes.
  0x48 Warble range, dimes.
  0x49 Warble rate, hz.
  0x4a Warble phase: 0=rising ... 0x40=falling ... 0x7f=rising
 */
 
import { Dom } from "../util/Dom.js";
import { MidiSerial } from "../midi/MidiSerial.js";
import { MynthEnvelopeGraph } from "./MynthEnvelopeGraph.js";

export class MynthChannelHeadersChangedEvent extends Event {
  constructor() {
    super("mid.mynthChannelHeadersChanged");
  }
}

export class MynthChannelHeadersModal extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom, "discriminator"];
  }
  constructor(element, dom, discriminator) {
    super();
    this.element = element;
    this.dom = dom;
    this.discriminator = discriminator;
    
    this.song = null;
    
    /* Sparseable, indexed by chid:
     * {
     *   chid: number
     *   warning: string // present if there are duplicate events, or ones after time zero
     *   volume: 0..127
     *   attackTimeLo,Hi: 0..127, ms
     *   attackLevelLo,Hi: 0..127
     *   decayTimeLo,Hi: 0..127, ms
     *   sustainLevelLo,Hi: 0..127
     *   releaseTimeLo,Hi: 0..127, 8ms
     *   sustain: boolean
     *   wave: 0..7
     *   wheelRange: 0..127, dimes
     *   warbleRange: 0..127, dimes
     *   warbleRate: 0..127, hz
     *   warblePhase: 0..127, follows a sine wave
     * }
     */
    this.model = [];
    
    this.buildUi();
  }
  
  setup(song) {
    this.song = song;
    this.model = this.generateModelFromSong(this.song);
    this.rebuildChannelsUi();
    this.populateUi();
  }
  
  /* UI.
   *********************************************************************/
  
  buildUi() {
    this.element.innerHTML = "";
    
    const blurb = this.dom.spawn(this.element, "DIV", ["blurb"]);
    blurb.innerHTML = ""
      + "Mynth is a synthesizer belonging to my game framework 'gamek' [<a href=\"https://github.com/aksommerville/gamek\">https://github.com/aksommerville/gamek</a>].<br/>"
      + "Nothing particularly particular here, just a few Control Change events with specific meanings. "
      ;
      
    const channelsContainer = this.dom.spawn(this.element, "DIV", ["channelsContainer"], { "on-input": e => this.onInput(e) });
  }
  
  rebuildChannelsUi() {
    const channelsContainer = this.element.querySelector(".channelsContainer");
    channelsContainer.innerHTML = "";
    for (const channel of this.model) {
      if (!channel) continue;
      // We're not using (channel) at this time, except for its existence and its chid.
      // Everything gets populated in a separate pass.
      const channelContainer = this.dom.spawn(channelsContainer, "DIV", ["channel"], { "data-chid": channel.chid });
      
      this.dom.spawn(channelContainer, "H3", channel.chid);
      this.dom.spawn(channelContainer, "DIV", ["warning", "hidden"]);
      
      const graphController = this.dom.spawnController(channelContainer, MynthEnvelopeGraph);
      
      const volumeId = `MynthChannelHeadersModal-${this.discriminator}-${channel.chid}-volume`;
      const volumeRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(volumeRow, "INPUT", {
        name: "volume",
        type: "range",
        min: 0,
        max: 127,
        id: volumeId,
      });
      this.dom.spawn(volumeRow, "SPAN", ["tattle"], { "data-key": "volume" });
      this.dom.spawn(volumeRow, "LABEL", { for: volumeId }, "Volume");
      
      const sustainId = `MynthChannelHeadersModal-${this.discriminator}-${channel.chid}-sustain`;
      const sustainRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(sustainRow, "INPUT", {
        name: "sustain",
        type: "checkbox",
        id: sustainId,
      });
      this.dom.spawn(sustainRow, "LABEL", { for: sustainId }, "Sustain");
      
      const waveRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      const waveSelect = this.dom.spawn(waveRow, "SELECT", {
        name: "wave",
      });
      this.dom.spawn(waveSelect, "OPTION", { value: "0" }, "Wave 0");
      this.dom.spawn(waveSelect, "OPTION", { value: "1" }, "Wave 1");
      this.dom.spawn(waveSelect, "OPTION", { value: "2" }, "Wave 2");
      this.dom.spawn(waveSelect, "OPTION", { value: "3" }, "Wave 3");
      this.dom.spawn(waveSelect, "OPTION", { value: "4" }, "Wave 4");
      this.dom.spawn(waveSelect, "OPTION", { value: "5" }, "Wave 5");
      this.dom.spawn(waveSelect, "OPTION", { value: "6" }, "Wave 6");
      this.dom.spawn(waveSelect, "OPTION", { value: "7" }, "Wave 7");
      
      const wheelRangeId = `MynthChannelHeadersModal-${this.discriminator}-${channel.chid}-wheelRange`;
      const wheelRangeRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(wheelRangeRow, "INPUT", {
        name: "wheelRange",
        type: "range",
        min: 0,
        max: 127,
        id: wheelRangeId,
      });
      this.dom.spawn(wheelRangeRow, "SPAN", ["tattle"], { "data-key": "wheelRange" });
      this.dom.spawn(wheelRangeRow, "LABEL", { for: wheelRangeId }, "Wheel range, dimes");
      
      const warbleRangeId = `MynthChannelHeadersModal-${this.discriminator}-${channel.chid}-warbleRange`;
      const warbleRangeRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(warbleRangeRow, "INPUT", {
        name: "warbleRange",
        type: "range",
        min: 0,
        max: 127,
        id: warbleRangeId,
      });
      this.dom.spawn(warbleRangeRow, "SPAN", ["tattle"], { "data-key": "warbleRange" });
      this.dom.spawn(warbleRangeRow, "LABEL", { for: warbleRangeId }, "Warble range, dimes");
      
      const warbleRateId = `MynthChannelHeadersModal-${this.discriminator}-${channel.chid}-warbleRate`;
      const warbleRateRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(warbleRateRow, "INPUT", {
        name: "warbleRate",
        type: "range",
        min: 0,
        max: 127,
        id: warbleRateId,
      });
      this.dom.spawn(warbleRateRow, "SPAN", ["tattle"], { "data-key": "warbleRate" });
      this.dom.spawn(warbleRateRow, "LABEL", { for: warbleRateId }, "Warble rate, hz");
      
      const warblePhaseId = `MynthChannelHeadersModal-${this.discriminator}-${channel.id}-warblePhase`;
      const warblePhaseRow = this.dom.spawn(channelContainer, "DIV", ["row"]);
      this.dom.spawn(warblePhaseRow, "INPUT", {
        name: "warblePhase",
        type: "range",
        min: 0,
        max: 127,
        id: warblePhaseId,
      });
      this.dom.spawn(warblePhaseRow, "SPAN", ["tattle"], { "data-key": "warblePhase" });
      this.dom.spawn(warblePhaseRow, "LABEL", { for: warblePhaseId }, "Warble phase");
    }
  }
  
  populateUi() {
    for (const container of this.element.querySelectorAll(".channel")) {
      const chid = +container.getAttribute("data-chid");
      const channel = this.model[chid] || {};
      this.populateChannelContainer(container, channel);
    }
  }
  
  populateChannelContainer(container, channel) {
    
    const warning = container.querySelector(".warning")
    if (channel.warning) {
      warning.classList.remove("hidden");
      warning.innerText = channel.warning;
    } else {
      warning.classList.add("hidden");
    }
    
    for (const input of container.querySelectorAll("*[name]")) {
      const key = input.getAttribute("name");
      let value;
      if (channel.hasOwnProperty(key)) value = channel[key];
      else value = this.defaultValueForField(key);
      if (typeof(value) === "boolean") {
        input.checked = value;
      } else {
        input.value = value;
      }
      const tattle = container.querySelector(`.tattle[data-key='${key}']`);
      if (tattle) tattle.innerText = value.toString().padStart(4);
    }
    
    const graphController = this.dom.queryControllerClass(container, MynthEnvelopeGraph);
    graphController.setup(channel);
  }
  
  /* Events.
   *******************************************************************/
  
  onInput(event) {
    
    // Find chid, key, and value.
    if (!event?.target) return;
    const key = event.target.name;
    if (!key) return;
    let chid = null;
    for (let parent=event.target; parent; parent = parent.parentNode) {
      chid = parent.getAttribute("data-chid");
      if (!chid) continue;
      chid = +chid;
      break;
    }
    if (chid === null) return;
    let value;
    if (event.target.type === "checkbox") value = event.target.checked;
    else value = +event.target.value;
    
    // Update the tattle if there is one. Only numeric inputs use this.
    if (typeof(value) === "number") {
      const tattle = this.element.querySelector(`.channel[data-chid='${chid}'] .tattle[data-key='${key}']`);
      if (tattle) {
        tattle.innerText = value.toString().padStart(4);
      }
    }
    
    // Commit change to the song.
    this.replaceFieldInSong(chid, key, value);
  }
  
  replaceFieldInSong(chid, key, value) {
    if (!this.song) return;
    for (const event of this.song.events) {
      if (event.chid !== chid) continue;
      const ekey = this.modelKeyForEvent(event);
      if (ekey !== key) continue;
      
      if (event.b === value) return;
      event.b = value;
      this.dispatchEvent(new MynthChannelHeadersChangedEvent());
      return;
    }
    // Not found, must add it.
    const event = this.song.createEvent(0, -1);
    event.chid = chid;
    event.opcode = 0xb0;
    event.a = this.eventKeyForModelKey(key);
    event.b = value;
    this.dispatchEvent(new MynthChannelHeadersChangedEvent());
  }
  
  /* Model.
   *******************************************************************/
   
  generateModelFromSong(song) {
    const model = [];
    if (song) {
      for (const event of song.events) {
      
        const key = this.modelKeyForEvent(event);
        if (!key) {
          if (event.chid >= 0) {
            if (!model[event.chid]) model[event.chid] = { chid: event.chid };
          }
          continue;
        }
      
        let channel = model[event.chid];
        if (!channel) {
          channel = { chid: event.chid };
          model[event.chid] = channel;
        }
        
        if (event.time && !channel.warning) {
          channel.warning = `Event ${event.id} at time ${event.time}, should be time zero.`;
        }
        
        if (channel.hasOwnProperty(key) && !channel.warning) {
          channel.warning = `Multiple events for ${key} on channel ${event.chid}`;
        }
        
        channel[key] = event.b;
      }
    }
    return model;
  }
  
  modelKeyForEvent(event) {
    if (event.opcode !== 0xb0) return null;
    switch (event.a) {
      case 0x07: return "volume";
      case 0x0c: return "attackTimeLo";
      case 0x0d: return "attackLevelLo";
      case 0x0e: return "decayTimeLo";
      case 0x0f: return "sustainLevelLo";
      case 0x10: return "releaseTimeLo";
      case 0x2c: return "attackTimeHi";
      case 0x2d: return "attackLevelHi";
      case 0x2e: return "decayTimeHi";
      case 0x2f: return "sustainLevelHi";
      case 0x30: return "releaseTimeHi";
      case 0x40: return "sustain";
      case 0x46: return "wave";
      case 0x47: return "wheelRange";
      case 0x48: return "warbleRange";
      case 0x49: return "warbleRate";
      case 0x4a: return "warblePhase";
    }
    return null;
  }
  
  eventKeyForModelKey(key) {
    switch (key) {
      case "volume": return 0x07;
      case "attackTimeLo": return 0x0c;
      case "attackLevelLo": return 0x0d;
      case "decayTimeLo": return 0x0e;
      case "sustainLevelLo": return 0x0f;
      case "releaseTimeLo": return 0x10;
      case "attackTimeHi": return 0x2c;
      case "attackLevelHi": return 0x2d;
      case "decayTimeHi": return 0x2e;
      case "sustainLevelHi": return 0x2f;
      case "releaseTimeHi": return 0x30;
      case "sustain": return 0x40;
      case "wave": return 0x46;
      case "wheelRange": return 0x47;
      case "warbleRange": return 0x48;
      case "warbleRate": return 0x49;
      case "warblePhase": return 0x4a;
    }
    return null;
  }
  
  // From gamek/src/opt/mynth/mynth_channel.c; may change in the future.
  defaultValueForField(key) {
    switch (key) {
      case "volume": return 0x40;
      case "attackTimeLo": case "attackTimeHi": return 15;
      case "decayTimeLo": case "decayTimeHi": return 40;
      case "releaseTimeLo": case "releaseTimeHi": return 25;
      case "attackLevelLo": case "attackLevelHi": return 0x50;
      case "sustainLevelLo": case "sustainLevelHi": return 0x30;
      case "sustain": return true;
      case "wave": return 0;
      case "wheelRange": return 20;
      case "warbleRange": return 0;
      case "warbleRate": return 0;
      case "warblePhase": return 0;
    }
    return 0;
  }
}
