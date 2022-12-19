/* RootUi.js
 * Top of the application's view controller hierarchy.
 */
 
import { Dom } from "../util/Dom.js";
import { ToolbarUi } from "./ToolbarUi.js";
import { EditorUi } from "./EditorUi.js";
import { QuantizationModal } from "./QuantizationModal.js";
import { EventListModal } from "./EventListModal.js";
import { ChannelHeadersModal } from "./ChannelHeadersModal.js";
import { Song } from "../midi/Song.js";
import { MidiBus } from "../midi/MidiBus.js";
 
export class RootUi {
  static getDependencies() {
    return [HTMLElement, Dom, Window, MidiBus];
  }
  constructor(element, dom, window, midiBus) {
    this.element = element;
    this.dom = dom;
    this.window = window;
    this.midiBus = midiBus;
    
    this.toolbar = null;
    this.editor = null;
    this.buildUi();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    this.toolbar = this.dom.spawnController(this.element, ToolbarUi);
    this.editor = this.dom.spawnController(this.element, EditorUi);
    
    this.toolbar.addEventListener("mid.openFile", (event) => this.onOpenFile(event.name, event.content));
    this.toolbar.addEventListener("mid.operation", (event) => this.onOperation(event.name));
    this.toolbar.addEventListener("mid.viewScale", (event) => this.editor.setViewScale(event.x, event.y));
    this.toolbar.addEventListener("mid.outputSelection", (event) => this.onOutputSelection(event.name));
    this.toolbar.visibilityUi.addEventListener("mid.visibilityChange", (event) => this.editor.chartUi.setVisibility(event.model));
    
    this.editor.addEventListener("mid.songDirty", (event) => this.toolbar.fileDirty(event.cb));
    this.editor.addEventListener("mid.trackCountChanged", (event) => this.toolbar.visibilityUi.setTrackCount(event.trackCount));
    this.editor.chartUi.addEventListener("mid.mouseTattle", (event) => this.toolbar.setMouseTattle(event.message));
  }
  
  onOpenFile(name, content) {
    this.editor.loadFile(content);
  }
  
  onOperation(name) {
    switch (name) {
      case "newSong": this.onNewSong(); break;
      case "channelHeaders": this.onEditChannelHeaders(); break;
      case "events": this.onEditEvents(); break;
      case "quantizeTime": this.onQuantizeTime(); break;
      case "division": this.onEditDivision(); break;
      case "tempo": this.onEditTempo(); break;
      default: console.log(`RootUi.onOperation, unknown op '${name}'`);
    }
  }
  
  onNewSong() {
    const serial = Song.blankEncodedSong();
    if (!serial) return;
    this.editor.loadFile(serial);
  }
  
  onEditChannelHeaders() {
    if (!this.editor.song) return;
    const modal = this.dom.spawnModal(ChannelHeadersModal);
    modal.setup(this.editor.song);
    modal.addEventListener("mid.headersChanged", () => {
      this.editor.reset();
    });
  }
  
  onEditEvents() {
    if (!this.editor.song) return;
    const modal = this.dom.spawnModal(EventListModal);
    // I'm not doing so good with state ownership here, TODO use a global Store?
    modal.setup(
      this.editor.song,
      this.editor.chartUi.chartEditor.selectedEvents,
      this.editor.chartUi.chartRenderer.visibility
    );
    modal.addEventListener("mid.eventChanged", (event) => {
      this.editor.chartUi.chartEditor.applyEdits([event.event]);
    });
  }
  
  onQuantizeTime() {
    let events = this.editor.getSelectedEvents();
    if (!events?.length) events = this.editor.song?.events;
    if (!events?.length) return;
    const modal = this.dom.spawnModal(QuantizationModal);
    modal.setup(this.editor.song.division, events);
    modal.addEventListener("mid.quantized", (event) => {
      this.editor.applyEdits(event.events);
    });
  }
  
  onEditDivision() {
    if (!this.editor.song) return;
    const response = this.window.prompt("Ticks per qnote:", this.editor.song.division);
    if (!response) return;
    const division = +response;
    if ((division < 1) || (division >= 0x8000)) return;
    if (division === this.editor.song.division) return;
    this.editor.song.changeDivision(division);
    this.editor.reset();
  }
  
  onEditTempo() {
    if (!this.editor.song) return;
    const tempo = this.editor.song.getTempo(true);
    let response;
    if (tempo < 0) {
      response = this.window.prompt("WARNING! Multiple tempos in song. If you respond here, we will have just one.\nTempo, us/qnote:", -tempo);
    } else {
      response = this.window.prompt("Tempo, us/qnote:", tempo);
    }
    if (!response) return;
    const newTempo = +response;
    if ((newTempo < 1) || (newTempo > 0xffffff)) return;
    this.editor.song.setTempo(newTempo);
    this.editor.reset();
  }
  
  onOutputSelection(name) {
    this.midiBus.playthrough(name);
  }
}
