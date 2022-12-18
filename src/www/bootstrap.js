import { Injector } from "./util/Injector.js";
import { Dom } from "./util/Dom.js";
import { RootUi } from "./ui/RootUi.js";

window.addEventListener("load", () => {
  const injector = new Injector(window);
  const dom = injector.getInstance(Dom);
  const body = document.body;
  body.innerHTML = "";
  const root = dom.spawnController(body, RootUi);
});
