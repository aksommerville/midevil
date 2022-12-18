/* MidiBus.js
 * Wrapper around Web MIDI API.
 */
 
class OutputDevicesChangedEvent extends Event {
  constructor() {
    super("mid.outputDevicesChanged");
  }
}

class InputDevicesChangedEvent extends Event {
  constructor() {
    super("mid.inputDevicesChanged");
  }
}

class MidiEvent extends Event {
  constructor(device, data) {
    super("mid.midi");
    this.device = device;
    this.data = data;
  }
}
 
export class MidiBus extends EventTarget {
  static getDependencies() {
    return [Window];
  }
  constructor(window) {
    super();
    this.window = window;
    
    this.midiAccess = null;
    this.pollPending = false;
    this.inputListeners = []; // [device, cb] so we can unlisten on state changes
    
    if (this.window.navigator.requestMIDIAccess) {
      this.window.navigator.requestMIDIAccess().then(access => {
        this.midiAccess = access;
        this.midiAccess.addEventListener("statechange", (event) => this.onStateChange(event));
        this.onStateChange(null);
      }).catch(error => {
        console.error(`MIDI access denied`, error);
      });
    } else {
      console.error(`MIDI bus not available`);
    }
  }
  
  getOutputDevices() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.outputs).map(([id, device]) => device);
  }
  
  getInputDevices() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs).map(([id, device]) => device);
  }
  
  // When I connect a device, I get half a dozen state change events (Linux, Chrome, MPK225). Debounce.
  onStateChange(event) {
    this.pollDevicesSoon();
  }
  
  pollDevicesSoon() {
    if (this.pollPending) return;
    this.pollPending = true;
    this.window.setTimeout(() => {
      this.pollPending = false;
      this.pollDevicesNow();
    }, 50);
  }
  
  pollDevicesNow() {
    // For now, I'm not going to bother tracking devices. Maybe there's a need? Dunno.
    // Tell our listeners that both input and output device sets changed.
    this.dispatchEvent(new OutputDevicesChangedEvent());
    this.dispatchEvent(new InputDevicesChangedEvent());
    
    // Listen on every input device. Again, not sure this is the right approach but let's see where it puts us.
    for (const [device, cb] of this.inputListeners) {
      device.removeEventListener("midimessage", cb);
    }
    this.inputListeners = [];
    if (this.midiAccess) {
      for (const [id, device] of this.midiAccess.inputs) {
        const cb = (event) => this.onMidiMessage(event);
        device.addEventListener("midimessage", cb);
        this.inputListeners.push([device, cb]);
      }
    }
  }
  
  onMidiMessage(event) {
    this.dispatchEvent(new MidiEvent(event.target, event.data));
  }
}

MidiBus.singleton = true;
