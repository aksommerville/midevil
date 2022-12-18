/* Dom.js
 */
 
import { Injector } from "./Injector.js";

export class Dom {
  static getDependencies() {
    return [Window, Document, Injector];
  }
  constructor(window, document, injector) {
    this.window = window;
    this.document = document;
    this.injector = injector;
    
    this.mutationObserver = new this.window.MutationObserver((events) => this.onMutations(events));
    this.mutationObserver.observe(this.document.body, { childList: true, subtree: true });
    
    this.window.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        this.dismissModals();
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  
  onMutations(records) {
    for (const record of records) {
      for (const element of record.removedNodes || []) {
        if (element._fmn_controller) {
          element._fmn_controller?.onRemoveFromDom?.();
          delete element._fmn_controller;
        }
      }
    }
  }
  
  /* (args) may contain:
   *  - string|number => innerText
   *  - array => CSS class names
   *  - {
   *      "on-*" => event listener
   *      "*" => attribute
   *    }
   * Anything else is an error.
   */
  spawn(parent, tagName, ...args) {
    const element = this.document.createElement(tagName);
    for (const arg of args) {
      switch (typeof(arg)) {
        case "string": case "number": element.innerText = arg; break;
        case "object": {
            if (arg instanceof Array) {
              for (const cls of arg) {
                element.classList.add(cls);
              }
            } else for (const k of Object.keys(arg)) {
              if (k.startsWith("on-")) {
                element.addEventListener(k.substr(3), arg[k]);
              } else {
                element.setAttribute(k, arg[k]);
              }
            }
          } break;
        default: throw new Error(`Unexpected argument ${arg}`);
      }
    }
    parent.appendChild(element);
    return element;
  }
  
  spawnController(parent, clazz, overrides) {
    const element = this.spawn(parent, this.tagNameForControllerClass(clazz), [clazz.name]);
    const controller = this.injector.getInstance(clazz, [...(overrides || []), element]);
    element._fmn_controller = controller;
    return controller;
  }
  
  spawnModal(clazz, overrides) {
    const frame = this._spawnModalFrame();
    const controller = this.spawnController(frame, clazz, overrides);
    return controller;
  }
  
  getTopModalController() {
    const frames = Array.from(this.document.body.querySelectorAll(".modalFrame"));
    if (!frames.length) return null;
    const frame = frames[frames.length - 1];
    const element = frame.children[0];
    return element._fmn_controller;
  }
  
  tagNameForControllerClass(clazz) {
    for (const dcls of clazz.getDependencies?.() || []) {
      const match = dcls.name?.match(/^HTML(.*)Element$/);
      if (match) switch (match[1]) {
        // Unfortunately, the names of HTMLElement subclasses are not all verbatim tag names.
        case "": return "DIV";
        case "Div": return "DIV";
        case "Canvas": return "CANVAS";
        default: {
            console.log(`TODO: Unexpected HTMLElement subclass name '${match[1]}', returning 'DIV'`);
            return "DIV";
          }
      }
    }
    return "DIV";
  }
  
  dismissModals() {
    this.document.body.querySelector(".modalBlotter")?.remove();
    this.document.body.querySelector(".modalStack")?.remove();
  }
  
  popTopModal() {
    const frame = this.document.body.querySelector(".modalFrame:last-child");
    if (!frame) return;
    frame.remove();
    if (!this.document.body.querySelector(".modalFrame")) {
      this.dismissModals();
    }
  }
  
  popModal(controller) {
    for (const frame of this.document.body.querySelectorAll(".modalFrame")) {
      if (Array.from(frame.children || []).find(e => e._fmn_controller === controller)) {
        frame.remove();
        if (!this.document.body.querySelector(".modalFrame")) {
          this.dismissModals();
        }
        return;
      }
    }
    console.log(`failed to pop modal`, controller);
  }
  
  _spawnModalFrame() {
    const stack = this._requireModalStack();
    return this.spawn(stack, "DIV", ["modalFrame"]);
  }
  
  _requireModalStack() {
    let blotter = this.document.body.querySelector(".modalBlotter");
    if (!blotter) {
      blotter = this.spawn(this.document.body, "DIV", ["modalBlotter"]);
    }
    let stack = this.document.body.querySelector(".modalStack");
    if (!stack) {
      stack = this.spawn(this.document.body, "DIV", ["modalStack"], {
        "on-mousedown": (event) => {
          if (event.target === stack) {
            this.popTopModal();
          }
        },
      });
    }
    return stack;
  }
}

Dom.singleton = true;
