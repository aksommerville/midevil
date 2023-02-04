/* ToolbarUi.js
 * Top of the page, always present.
 */
 
import { Dom } from "../util/Dom.js";
import { Operations } from "../midi/Operations.js";
import { MidiBus } from "../midi/MidiBus.js";
import { VisibilityUi } from "./VisibilityUi.js";
import { SongPlayService } from "../midi/SongPlayService.js";
import { MetronomeUi } from "./MetronomeUi.js";

class OpenFileEvent extends Event {
  constructor(name, content) {
    super("mid.openFile");
    this.name = name;
    this.content = content;
  }
}

class OperationEvent extends Event {
  constructor(name) {
    super("mid.operation");
    this.name = name;
  }
}

class ViewScaleEvent extends Event {
  constructor(x, y) {
    super("mid.viewScale");
    this.x = x;
    this.y = y;
  }
}

class OutputSelectionEvent extends Event {
  constructor(name) {
    super("mid.outputSelection");
    this.name = name;
  }
}

export class ToolbarUi extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom, Window, Operations, MidiBus, SongPlayService];
  }
  constructor(element, dom, window, operations, midiBus, songPlayService) {
    super();
    this.element = element;
    this.dom = dom;
    this.window = window;
    this.operations = operations;
    this.midiBus = midiBus;
    this.songPlayService = songPlayService;
    
    this.fileName = "";
    this.encodeFile = null; // () => ArrayBuffer
    this.visibilityUi = null;
    this.metronomeUi = null;
    
    this.buildUi();
    
    this.midiOutputsListener = () => this.populateOutputMenu();
    this.midiBus.addEventListener("mid.outputDevicesChanged", this.midiOutputsListener);
    
    this.playheadListener = () => this.onPlayheadChange();
    this.songPlayService.addEventListener("mid.playheadChange", this.playheadListener);
  }
  
  onRemoveFromDom() {
    if (this.midiOutputsListener) {
      this.midiBus.removeEventListener("mid.outputDevicesChanged", this.midiOutputsListener);
      this.midiOutputsListener = null;
    }
    if (this.playheadListener) {
      this.songPlayService.removeEventListener("mid.playheadChange", this.playheadListener);
      this.playheadListener = null;
    }
  }
  
  fileDirty(encodeFile) {
    if (this.encodeFile = encodeFile) {
      this.element.querySelector("input.save").disabled = false;
    } else {
      this.element.querySelector("input.save").disabled = true;
    }
  }
  
  setMouseTattle(message) {
    this.element.querySelector(".mouseTattle").innerText = message;
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    const fileRow = this.dom.spawn(this.element, "DIV");
    const viewRow = this.dom.spawn(this.element, "DIV");
    const playRow = this.dom.spawn(this.element, "DIV");
    
    /* Top row: Save file, global ops menu.
     */
    
    const file = this.dom.spawn(fileRow, "INPUT", {
      type: "file",
      accept: ".mid,audio/midi",
      "on-change": (event) => this.onOpenFile(file.files[0]),
    });
    
    this.dom.spawn(fileRow, "INPUT", ["save"], {
      type: "button",
      value: "Save",
      disabled: "disabled",
      "on-click": () => this.onSaveFile(),
    });
    
    const opsMenu = this.dom.spawn(fileRow, "SELECT", ["ops"], { "on-change": () => this.onOpsChange() });
    this.dom.spawn(opsMenu, "OPTION", "Operations...", { value: "", disabled: "disabled", selected: "selected" });
    for (const { label, name } of this.operations.listOperationsForDisplay()) {
      this.dom.spawn(opsMenu, "OPTION", label, { value: name });
    }
    
    /* Second row: View concerns. Scale and filter.
     */
    
    this.visibilityUi = this.dom.spawnController(viewRow, VisibilityUi);
    
    this.dom.spawn(viewRow, "INPUT", {
      type: "range",
      name: "horzScale",
      min: 0,
      max: 1000,
      value: 500,
      "on-input": () => this.onScaleInput(),
    });
    this.dom.spawn(viewRow, "INPUT", {
      type: "range",
      name: "vertScale",
      min: 0,
      max: 1000,
      value: 500,
      "on-input": () => this.onScaleInput(),
    });
    
    this.dom.spawn(viewRow, "DIV", ["mouseTattle"]);
    
    /* Bottom row: Playback controls.
     */
    
    this.metronomeUi = this.dom.spawnController(playRow, MetronomeUi);
    
    const outputMenu = this.dom.spawn(playRow, "SELECT", ["output"], { "on-change": () => this.onOutputChange() });
    this.populateOutputMenu();
    
    this.dom.spawn(playRow, "INPUT", { type: "button", value: "|<", "on-click": () => this.songPlayService.skipBackward() });
    this.dom.spawn(playRow, "INPUT", { type: "button", value: ">", "on-click": () => this.songPlayService.play() });
    this.dom.spawn(playRow, "INPUT", { type: "button", value: ">|", "on-click": () => this.songPlayService.skipForward() });
    this.dom.spawn(playRow, "INPUT", { type: "button", value: "O", "on-click": () => this.songPlayService.record() });
    this.dom.spawn(playRow, "INPUT", { type: "button", value: "!!!", "on-click": () => this.midiBus.panic() });
    
    this.dom.spawn(playRow, "DIV", ["playheadTattle"]);
  }
  
  populateOutputMenu(devices) {
    const menu = this.element.querySelector("select.output");
    menu.innerHTML = "";
    this.dom.spawn(menu, "OPTION", "No Output", { value: "" });
    this.dom.spawn(menu, "OPTION", "WebSocket", { value: "websocket" });
    for (const device of this.midiBus.getOutputDevices()) {
      this.dom.spawn(menu, "OPTION", device.name, { value: device.id });
    }
  }
  
  onOpenFile(file) {
    if (!file) return;
    file.stream().getReader().read().then(content => {
      this.fileName = file.name;
      this.dispatchEvent(new OpenFileEvent(file.name, content.value.buffer));
    }).catch(e => console.error(e));
  }
  
  onSaveFile() {
    if (!this.encodeFile) return;
    const serial = this.encodeFile();
    if (!serial) return;
    const blob = new Blob([serial], { type: "audio/midi" });
    const url = this.window.URL.createObjectURL(blob);
    const a = this.window.document.createElement("A");
    a.href = url;
    a.download = this.fileName || "download";
    a.click();
  }
  
  onOpsChange() {
    const menu = this.element.querySelector(".ops");
    const selection = menu.value;
    menu.value = "";
    if (selection) {
      this.dispatchEvent(new OperationEvent(selection));
    }
  }
  
  onScaleInput() {
    const horzScale = this.element.querySelector("input[name='horzScale']")?.value;
    const vertScale = this.element.querySelector("input[name='vertScale']")?.value;
    this.dispatchEvent(new ViewScaleEvent(horzScale, vertScale));
  }
  
  onOutputChange() {
    const menu = this.element.querySelector(".output");
    const selection = menu.value;
    this.dispatchEvent(new OutputSelectionEvent(selection));
  }
  
  onPlayheadChange() {
    const tattle = this.element.querySelector(".playheadTattle");
    if (this.songPlayService.song) {
      const playheadTicks = Math.floor(this.songPlayService.playheadTime);
      const limitTicks = this.songPlayService.song.getDurationTicks();
      const digitCount = Math.max(1, Math.ceil(Math.log10(limitTicks + 1)));
      tattle.innerText = playheadTicks.toString().padStart(digitCount) + "/" + limitTicks.toString().padStart(digitCount);
    } else {
      tattle.innerText = "";
    }
  }
}
