/* SongPlayService.js
 * Manages the global play/record state.
 */
 
import { MidiBus } from "./MidiBus.js";
 
export class LoopChangeEvent extends Event {
  constructor(startTime, stopTime) {
    super("mid.loopChange");
    this.startTime = startTime;
    this.stopTime = stopTime;
  }
}

export class PlayheadChangeEvent extends Event {
  constructor(playheadTime) {
    super("mid.playheadChange");
    this.playheadTime = playheadTime;
  }
}

export class PlayingSongChangeEvent extends Event {
  constructor(song) {
    super("mid.playingSongChange");
    this.song = song;
  }
}

export class PlayStateChangeEvent extends Event {
  constructor(state) {
    super("mid.playStateChange");
    this.state = state;
  }
}

export class MetronomeEvent extends Event {
  constructor() {
    super("mid.metronome");
  }
}
 
export class SongPlayService extends EventTarget {
  static getDependencies() {
    return [MidiBus, Window];
  }
  constructor(midiBus, window) {
    super();
    this.midiBus = midiBus;
    this.window = window;
    
    this.song = null;
    this.playheadTime = 0; // ticks
    this.loopStartTime = 0; // ticks
    this.loopEndTime = 0; // ticks; if 0 there is no loop
    this.state = "empty"; // "empty","ready","play","record"
    this.playing = false;
    this.recording = false;
    this.eventp = 0; // Position in (this.song.events) of next event, when playing.
    this.nextEventTime = 0; // Absolute time in ms of the next event.
    this.usPerQnote = 0; // Updated when play starts. We use a single tempo even if the song says otherwise.
    this.msPerTick = 0; // ''
    this.timeOffset = 0; // Absolute time in ms of the start of the song, in the current playback.
    this.midiInListener = null;
    this.metronomeChid = 9;
    this.metronomeNoteid = 56; // GM cowbell
    this.metronomeVelocity = 0x7f;
    this.metronomeRate = 0; // qnotes
    this.metronomeNextTime = 0; // absolute ms
    
    /* Important! The song has Note On and Note Off combined. We need to track held notes and generate those Note Offs ourselves.
     * Array of {chid,noteid,velocity,time} with (time) precalculated to absolute ms.
     * These are for playback only.
     */
    this.pendingNotes = [];
    
    // Similar to pendingNotes, for ones we're recording. {chid,noteid,eventid}
    this.recordingNotes = [];
  }
  
  setSong(song) {
    this.song = song;
    this.dispatchEvent(new PlayingSongChangeEvent(this.song));
    if (this.playheadTime) {
      this.playheadTime = 0;
      this.dispatchEvent(new PlayheadChangeEvent(this.playheadTime));
    }
    if (this.loopStartTime || this.loopEndTime) {
      this.loopStartTime = 0;
      this.loopEndTime = 0;
      this.dispatchEvent(new LoopChangeEvent(this.loopStartTime, this.loopEndTime));
    }
    this.setState(this.song ? "ready" : "empty");
  }
  
  setState(state) {
    if (this.state === state) return;
    this.endState();
    this.state = state;
    this.beginState();
    this.dispatchEvent(new PlayStateChangeEvent(this.state));
  }
  
  setPlayhead(time) {
    if (time === this.playheadTime) return;
    this.releaseAll(); // order matters, if we're recording. Release, then change playheadTime.
    this.playheadTime = time;
    this.dispatchEvent(new PlayheadChangeEvent(this.playheadTime));
    this.updateForAdjustedPlayheadIfPlaying();
  }
  
  setLoop(aTime, zTime) {
    if (aTime >= zTime) {
      aTime = 0;
      zTime = 0;
    }
    if ((aTime === this.loopStartTime) && (zTime === this.loopEndTime)) return;
    this.loopStartTime = aTime;
    this.loopEndTime = zTime;
    this.dispatchEvent(new LoopChangeEvent(this.loopStartTime, this.loopEndTime));
  }
  
  // play or pause
  play() {
    if (!this.song) return;
    if (this.state === "play") {
      this.setState("ready");
    } else if (this.state === "record") {
      this.setState("ready");
    } else {
      this.setState("play");
    }
  }
  
  // If a loop is set, toggles between loop start and zero, preferring loop start.
  skipBackward() {
    if (!this.song) return;
    let dstTime = 0;
    if ((this.loopStartTime < this.loopEndTime) && (this.playheadTime !== this.loopStartTime)) {
      dstTime = this.loopStartTime;
    }
    if (this.playheadTime === dstTime) return;
    this.playheadTime = dstTime;
    this.releaseAll();
    this.dispatchEvent(new PlayheadChangeEvent(this.playheadTime));
    this.updateForAdjustedPlayheadIfPlaying();
  }
  
  // Same idea as skipBackward re loop.
  skipForward() {
    if (!this.song) return;
    let dstTime = 0;
    if ((this.loopStartTime < this.loopEndTime) && (this.playheadTime !== this.loopEndTime)) {
      dstTime = this.loopEndTime;
    } else if (this.song.events.length > 0) {
      dstTime = this.song.events[this.song.events.length - 1].time;
    }
    if (this.playheadTime === dstTime) return;
    this.playheadTime = dstTime;
    this.releaseAll();
    this.dispatchEvent(new PlayheadChangeEvent(this.playheadTime));
    this.updateForAdjustedPlayheadIfPlaying();
  }
  
  // record or pause
  record() {
    if (!this.song) return;
    if (this.state === "play") {
      this.setState("record");
    } else if (this.state === "record") {
      this.setState("ready");
    } else {
      this.setState("record");
    }
  }
  
  /* Private.
   ************************************************************************/
   
  beginState() {
    switch (this.state) {
      case "empty": this.stopIfPlaying(); break;
      case "ready": this.stopIfPlaying(); break;
      case "play": this.beginPlay(); break;
      case "record": this.beginRecord(); break;
    }
  }
  
  endState() {
    switch (this.state) {
      case "empty": break;
      case "ready": break;
      case "play": this.endPlay(); break;
      case "record": this.endRecord(); break;
    }
  }
  
  beginPlay() {
    this.releaseAll();
    this.startIfStopped();
  }
  
  endPlay() {
    this.stopIfPlaying();
  }
  
  beginRecord() {
    this.startIfStopped();
    this.recording = true;
    if (!this.midiInListener) {
      this.midiInListener = e => this.onMidiIn(e);
      this.midiBus.addEventListener("mid.midi", this.midiInListener);
    }
  }
  
  endRecord() {
    this.releaseAll();
    this.recording = false;
    if (this.midiInListener) {
      this.midiBus.removeEventListener("mid.midi", this.midiInListener);
      this.midiInListener = null;
    }
  }
  
  /* Finally, the real "song player" stuff.
   *************************************************************************/
   
  onMidiIn(event) {
    if (!this.recording) return;
    if (!this.song) return;
    if (event.data.length < 1) return;
    switch (event.data[0] & 0xf0) {
      case 0x80: this.recordNoteOff(event.data); break;
      case 0x90: this.recordNoteOn(event.data); break;
      case 0xa0: case 0xb0: case 0xc0: case 0xd0: case 0xe0: this.recordVerbatim(event.data); break;
      // Ignore realtime, sysex, etc.
    }
  }
  
  recordVerbatim(serial) {
    const event = this.song.addEncodedEventAtTime(this.playheadTime, serial);
    if (!event) return;
  }
  
  recordNoteOn(serial) {
    const event = this.song.addEncodedEventAtTime(this.playheadTime, serial);
    if (!event) return;
    this.recordingNotes.push({
      chid: event.chid,
      noteid: event.a,
      eventid: event.id,
    });
  }
  
  recordNoteOff(serial) {
    if (serial.length < 2) return;
    const chid = serial[0] & 0x0f;
    const noteid = serial[1];
    const p = this.recordingNotes.findIndex(n => ((n.chid === chid) && (n.noteid === noteid)));
    if (p >= 0) {
      const note = this.recordingNotes[p];
      this.recordingNotes.splice(p, 1);
      const event = this.song.events.find(e => e.id === note.eventid);
      if (event) {
        event.duration = Math.max(0, Math.floor(this.playheadTime - event.time));
        event.offVelocity = serial[2] || 0x40;
      }
    }
  }
   
  releaseAll() {
    this.midiBus.panic();
    this.pendingNotes = [];
    if (this.song) {
      for (const { chid, noteid, eventid } of this.recordingNotes) {
        const event = this.song.events.find(e => e.id === eventid);
        if (event && (event.time < this.playheadTime)) {
          event.duration = Math.floor(this.playheadTime - event.time);
          event.offVelocity = 0x40;
        }
      }
    }
    this.recordingNotes = [];
  }
  
  stopIfPlaying() {
    if (!this.playing) return;
    this.playing = false;
    this.releaseAll();
  }
    
  // A little heavy-handed? Run through the whole song up to the playhead and fire all non-note events.
  // To get all channels in the proper state.
  prerunChannelConfig() {
    for (const event of this.song.events) {
      if (event.time >= this.playheadTime) break;
      if (event.opcode === 0x90) continue;
      if (event.opcode >= 0xf0) continue;
      this.playEvent(event);
    }
  }
  
  startIfStopped() {
    if (this.playing) return;
    this.playing = true;
    this.nextEventTime = Date.now();
    this.eventp = this.song.searchEventsByTime(this.playheadTime, -1);
    this.usPerQnote = this.song.getTempo(false);
    this.msPerTick = this.usPerQnote / (this.song.division * 1000);
    this.timeOffset = this.nextEventTime - this.playheadTime * this.msPerTick;
    this.calculateMetronomeNextTime();
    this.prerunChannelConfig();
    // It would read better to do like (window.setTimeout(() => this.update(), calculatedMsToNextEvent)).
    // But setTimeout is not reliable enough for the precise timing music demands.
    // Instead, have it poll us at video timing, and at each poll we examine time continuously.
    this.window.requestAnimationFrame(() => this.update());
  }
  
  updateForAdjustedPlayheadIfPlaying() {
    if (!this.playing) return;
    this.prerunChannelConfig();
    this.nextEventTime = Date.now();
    this.eventp = this.song.searchEventsByTime(this.playheadTime, -1);
    this.usPerQnote = this.song.getTempo(false);
    this.msPerTick = this.usPerQnote / (this.song.division * 1000);
    this.timeOffset = this.nextEventTime - this.playheadTime * this.msPerTick;
    this.calculateMetronomeNextTime();
  }
  
  calculateMetronomeNextTime() {
    if (this.metronomeRate <= 0) {
      this.metronomeNextTime = 0;
      return;
    }
    const beat = Math.ceil(this.playheadTime / (this.metronomeRate * this.song.division));
    this.metronomeNextTime = this.timeOffset + beat * this.metronomeRate * this.song.division * this.msPerTick;
  }
  
  playMetronome() {
    this.dispatchEvent(new MetronomeEvent());
    this.midiBus.sendOutput([0x90 | this.metronomeChid, this.metronomeNoteid, this.metronomeVelocity]);
    this.midiBus.sendOutput([0x80 | this.metronomeChid, this.metronomeNoteid, 0x40]);
  }
  
  update() {
    if (!this.playing) return;
    if (!this.song) return;
    
    const now = Date.now();
    
    if (this.pendingNotes.length) {
      for (;;) {
        const heldNotep = this.pendingNotes.findIndex(n => n.time <= now);
        if (heldNotep < 0) break;
        const heldNote = this.pendingNotes[heldNotep];
        this.pendingNotes.splice(heldNotep, 1);
        this.playNoteOff(heldNote);
      }
    }
    
    if (now >= this.nextEventTime) {
      this.consumeSongEvents();
    }
    
    this.playheadTime = (now - this.timeOffset) / this.msPerTick;
    if ((this.loopEndTime > this.loopStartTime) && (this.playheadTime >= this.loopEndTime)) {
      // Let the usual processing for playhead change run on loops too (dropping held notes etc).
      this.setPlayhead(this.loopStartTime);
    } else {
      this.dispatchEvent(new PlayheadChangeEvent(this.playheadTime));
    }
    
    if (this.metronomeNextTime && (now >= this.metronomeNextTime)) {
      this.playMetronome();
      this.calculateMetronomeNextTime();
    }
    
    this.window.requestAnimationFrame(() => this.update());
  }
  
  consumeSongEvents() {
    const now = Date.now();
    for (;;) {
        
      if (this.eventp >= this.song.events.length) {
        this.nextEventTime *= 2; // the distant future
        return;
      }
      
      const event = this.song.events[this.eventp];
      const eventTimeMs = event.time * this.msPerTick + this.timeOffset;
      if (now < eventTimeMs) {
        this.nextEventTime = eventTimeMs;
        return;
      }
      this.playEvent(event);
      this.eventp++;
    }
  }
  
  playEvent(event) {
    const serial = this.song.encodeEventForPlayback(event);
    if (!serial) return;
    this.midiBus.sendOutput(serial);
    if (event.opcode === 0x90) {
      if (event.duration > 0) {
        this.pendingNotes.push({
          chid: event.chid,
          noteid: event.a,
          velocity: event.offVelocity || 0x40,
          time: Date.now() + event.duration * this.msPerTick,
        });
      } else {
        this.midiBus.sendOutput([0x80 | event.chid, event.a, event.offVelocity || 0x40]);
      }
    }
  }
  
  playNoteOff(note) {
    const serial = new Uint8Array([0x80 | note.chid, note.noteid, note.velocity]);
    this.midiBus.sendOutput(serial);
  }
}

SongPlayService.singleton = true;
