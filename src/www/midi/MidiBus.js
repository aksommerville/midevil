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
    this.playthroughDevice = null; // Output device, we echo all inputs to it.
    // "playthroughDevice" is also the main output, poor choice of name initially. There's just one output.
    this.playthroughSocket = null;
    
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
  
  // outputDeviceId may also be a WebSocket instance.
  playthrough(outputDeviceId) {
    if (outputDeviceId instanceof WebSocket) {
      try { this.playthroughDevice.send([0xff]); } catch (e) {}
      this.playthroughDevice = null;
      this.playthroughSocket = outputDeviceId;
      return true;
    }
    if (!this.midiAccess) return false;
    for (const [id, device] of this.midiAccess.outputs) {
      if (device.id === outputDeviceId) {
        this.playthroughDevice = device;
        this.playthroughSocket = null;
        return true;
      }
    }
    if (this.playthroughDevice) {
      try { this.playthroughDevice.send([0xff]); } catch (e) {}
      this.playthroughDevice = null;
      this.playthroughSocket = null;
    }
    return false;
  }
  
  sendOutput(serial) {
    if (this.playthroughSocket) {
      if (!(serial instanceof Uint8Array)) serial = new Uint8Array(serial);
      this.playthroughSocket.send(serial);
    } else if (this.playthroughDevice) {
      this.playthroughDevice.send(serial);
    }
  }
  
  panic() {
    this.sendOutput([0xff]);
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
    if (this.playthroughDevice) {
      this.playthroughDevice.send(event.data);
    } else if (this.playthroughSocket) {
      const serial = new Uint8Array(event.data);
      this.playthroughSocket.send(event.data);
    }
  }
}

MidiBus.singleton = true;
