/* QuantizationModal.js
 * Presents options to quantize time for multiple events.
 * Also responsible for the logic behind that.
 */
 
import { Dom } from "../util/Dom.js";

class QuantizedEvent extends Event {
  constructor(events) {
    super("mid.quantized");
    this.events = events;
  }
}

export class QuantizationModal extends EventTarget {
  static getDependencies() {
    return [HTMLElement, Dom];
  }
  constructor(element, dom) {
    super();
    this.element = element;
    this.dom = dom;
    
    this.ticksPerQnote = 0;
    this.events = [];
    this.distribution = []; // [ticks, eventCount], ticks is a factor of ticksPerQnote
    this.includeOffs = false;
    
    this.buildUi();
  }
  
  setup(ticksPerQnote, events) {
    this.ticksPerQnote = ticksPerQnote;
    this.events = events;
    this.calculateDistribution();
    this.populateUi();
  }
  
  calculateDistribution() {
    if (this.ticksPerQnote < 1) return;
    if (this.events.length < 1) return;
    
    /* The qnote is our upper bound, we will not quantize to any coarser interval than that.
     * Every factor of qnote is eligible (including 1, tho it would have no effect).
     * So first find the integer factors of ticksPerQnote.
     * I feel bad about using such a naive factoring algorithm, but ummm, 
     * it needs to be one I can understand, which pretty much rules out all the cool ones.
     */
    const factors = [[1, 0]]; // [value, count]
    const limit = Math.floor(this.ticksPerQnote / 2);
    for (let i=2; i<=limit; i++) {
      if (!(this.ticksPerQnote % i)) factors.splice(0, 0, [i, 0]);
    }
    factors.splice(0, 0, [this.ticksPerQnote, 0]);
    
    for (const event of this.events) {
      for (const valueAndCount of factors) {
        if (!(event.time % valueAndCount[0])) {
          valueAndCount[1]++;
          break;
        }
      }
    }
    if (this.includeOffs) {
      for (const event of this.events) {
        if (typeof(event.duration) !== "number") continue;
        for (const valueAndCount of factors) {
          if (!(event.duration % valueAndCount[0])) {
            valueAndCount[1]++;
            break;
          }
        }
      }
    }
    
    this.distribution = factors;
  }
  
  buildUi() {
    this.element.innerHTML = "";
    
    const offLabel = this.dom.spawn(this.element, "LABEL", "Include Off events");
    const offCheckbox = this.dom.spawn(offLabel, "INPUT", { type: "checkbox" });
    offCheckbox.checked = this.includeOffs;
    offCheckbox.addEventListener("change", () => {
      this.includeOffs = offCheckbox.checked;
      this.calculateDistribution();
      this.populateUi();
    });
    
    const table = this.dom.spawn(this.element, "TABLE");
  }
  
  populateUi() {
    const table = this.element.querySelector("table");
    table.innerHTML = "";
    for (const [interval, count] of this.distribution) {
      const tr = this.dom.spawn(table, "TR");
      this.dom.spawn(tr, "TD", `${interval} (1/${this.ticksPerQnote / interval})`);
      this.dom.spawn(tr, "TD", count ? count.toString() : "");
      const td = this.dom.spawn(tr, "TD");
      const button = this.dom.spawn(td, "INPUT", {
        type: "button",
        value: "Quantize",
        "on-click": () => this.quantize(interval),
      });
    }
  }
  
  quantize(interval) {
    if (interval < 1) return;
    if (this.ticksPerQnote < 1) return;
    if (this.events.length < 1) return;
    for (const event of this.events) {
      event.time = Math.round(event.time / interval) * interval;
      if (this.includeOffs && (typeof(event.duration) === "number")) {
        event.duration = Math.round(event.duration / interval) * interval;
      }
    }
    this.calculateDistribution();
    this.populateUi();
    this.dispatchEvent(new QuantizedEvent(this.events));
  }
}
