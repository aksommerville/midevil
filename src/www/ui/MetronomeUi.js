/* MetronomeUi.js
 * Button and popup menu for configuring the metronome.
 * No events or input from owner; we interact directly with SongPlayService.
 */
 
import { Dom } from "../util/Dom.js";
import { SongPlayService } from "../midi/SongPlayService.js";

export class MetronomeUi extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom, SongPlayService];
  }
  constructor(element, dom, songPlayService) {
    super();
    this.element = element;
    this.dom = dom;
    this.songPlayService = songPlayService;
    
    this.element.classList.add("poppable");
    
    this.buildUi();
    this.populateUi();
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    this.dom.spawn(this.element, "INPUT", {
      type: "button",
      value: "Metronome",
      "on-click": () => this.onTogglePopup(),
    });
    
    const popup = this.dom.spawn(this.element, "DIV", ["popup", "hidden"]);
    const table = this.dom.spawn(popup, "TABLE");
    table.addEventListener("change", (event) => this.onChange(event));
    
    const explainTr = this.dom.spawn(table, "TR");
    this.dom.spawn(explainTr, "TD", { colspan: 2 }, "Rate in qnotes. Zero to disable.");
    
    const rateRow = this.spawnRow(table, "Rate");
    this.dom.spawn(rateRow, "INPUT", { name: "rate", type: "number", min: 0 });
    
    const chidRow = this.spawnRow(table, "Channel");
    this.dom.spawn(chidRow, "INPUT", { name: "chid", type: "number", min: 0, max: 15 });

    const noteidRow = this.spawnRow(table, "Note");
    this.dom.spawn(noteidRow, "INPUT", { name: "noteid", type: "number", min: 0, max: 0x7f });
    
    const velocityRow = this.spawnRow(table, "Velocity");
    this.dom.spawn(velocityRow, "INPUT", { name: "velocity", type: "number", min: 1, max: 0x7f });
  }
  
  spawnRow(table, label) {
    const tr = this.dom.spawn(table, "TR");
    this.dom.spawn(tr, "TD", ["key"], label);
    return this.dom.spawn(tr, "TD", ["value"]);
  }
  
  populateUi() {
    this.element.querySelector("input[name='rate']").value = this.songPlayService.metronomeRate;
    this.element.querySelector("input[name='chid']").value = this.songPlayService.metronomeChid;
    this.element.querySelector("input[name='noteid']").value = this.songPlayService.metronomeNoteid;
    this.element.querySelector("input[name='velocity']").value = this.songPlayService.metronomeVelocity;
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
    this.songPlayService.metronomeRate = +this.element.querySelector("input[name='rate']").value;
    this.songPlayService.metronomeChid = +this.element.querySelector("input[name='chid']").value;
    this.songPlayService.metronomeNoteid = +this.element.querySelector("input[name='noteid']").value;
    this.songPlayService.metronomeVelocity = +this.element.querySelector("input[name='velocity']").value;
    this.songPlayService.calculateMetronomeNextTime();
  }
}
