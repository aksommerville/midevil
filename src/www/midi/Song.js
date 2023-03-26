/* Song.js
 * Live representation of one MIDI file.
 */
 
import { MidiSerial } from "./MidiSerial.js";
import { Encoder } from "../util/Encoder.js";
import { Decoder } from "../util/Decoder.js";
 
/*
interface SongEvent {
  id: number;           // arbitrary unique id, so it's safe to copy events
  time: number;         // absolute ticks from start of song
  trackid: number;      // index of MTrk
  chid: number;         // 0..15, or -1 if not associated with a channel
  opcode: number;       // stripped of chid
  a: number;            // first data byte, or Meta type
  b: number;            // second data byte
  serial?: Uint8Array;  // for Meta and SysEx; may point into original ArrayBuffer
  duration?: number;    // ticks; for Note On in combined mode.
  offVelocity?: number; // for Note On in combined mode.
}
*/
 
export class Song {
  constructor(serial) {
    this.events = []; // SongEvent
    this.format = 0; // from MThd
    this.trackCount = 0; // from MThd; not necessarily the MTrk count. I don't know what this is for.
    this.division = 0; // from MThd. ticks/qnote. We use this as a proxy for MThd present.
    this.tracks = null; // private; only present during decode.
    this.time = null; // private; playhead time in ticks during decode.
    this.combined = false; // True if Note Off are removed, and referenced by their Note On (duration,offVelocity).
    this.decode(serial);
  }
  
  static blankEncodedSong() {
    // We could skip all this and just output the final result statically.
    // But leaving this building-up approach in case we want to tweak later.
    const encoder = new Encoder();
    
    encoder.raw("MThd");
    const mthdLenp = encoder.c;
    encoder.u16be(0); // format
    encoder.u16be(1); // track count
    encoder.u16be(24); // division
    encoder.u32belen(mthdLenp);
    
    encoder.raw("MTrk");
    const mtrkLenp = encoder.c;
    encoder.vlq(0); // delay
    encoder.u8(0xff); // meta
    encoder.u8(0x2f); // end of track
    encoder.vlq(0); // payload length
    encoder.u32belen(mtrkLenp);
    
    return encoder.finish();
  }
  
  getDurationTicks() {
    if (this.events.length < 1) return 0;
    const event = this.events[this.events.length - 1];
    // Assume that the last event is also the greatest time.
    // This might technically not be true in combined mode.
    // But it always *should* be true: There should be an End of Track event after the last Note Off.
    return event.time + (event.duration || 0);
  }
  
  getDurationQnotes() {
    if (this.division < 1) return 0;
    return this.getDurationTicks() / this.division;
  }
  
  getTrackCount() {
    return this.events.map(e => e.trackid).reduce((a, v) => Math.max(a, v), -1) + 1;
  }
  
  deleteEventById(id) {
    const p = this.events.findIndex(e => e.id === id);
    if (p < 0) return false;
    this.events.splice(p, 1);
    return true;
  }
  
  // Must call this after you change any event.time
  sortEvents() {
    // ES2019 requires that Array.sort be stable, earlier versions did not.
    // We depend on stability here:
    this.events.sort((a, b) => a.time - b.time);
  }
  
  changeDivision(division) {
    if (typeof(division) !== "number") return false;
    if (division === this.division) return false;
    if (division < 1) return false;
    if (division >= 0x8000) return false;
    const adjust = division / this.division;
    for (const event of this.events) {
      event.time = Math.round(event.time * adjust);
      if (typeof(event.duration) === "number") {
        event.duration = Math.round(event.duration * adjust);
      }
    }
    this.sortEvents(); // probly not possible for order to get mixed up? whatever, let's be sure.
    this.division = division;
    return true;
  }
  
  /* Search for Meta Set Tempo events and return the first one's payload (us/qnote 0..0xffffff).
   * With (fullSearch), continue after the first and return the first tempo negative if there are others.
   * If not found, return the default 500000.
   */
  getTempo(fullSearch) {
    let tempo = 500000, found = false;
    for (const event of this.events) {
      if (event.opcode !== 0xff) continue;
      if (event.a !== 0x51) continue;
      if (!event.serial) continue;
      if (event.serial.length < 3) continue;
      if (found) {
        tempo = -tempo;
      } else {
        tempo = (event.serial[0] << 16) | (event.serial[1] << 8) | event.serial[2];
        if (!fullSearch) return tempo;
        found = true;
      }
    }
    return tempo;
  }
  
  /* Replace the first Meta Set Tempo payload, or add it.
   */
  setTempo(tempo) {
    if ((tempo < 1) || (tempo > 0xffffff)) return;
    for (const event of this.events) {
      if (event.opcode !== 0xff) continue;
      if (event.a !== 0x51) continue;
      event.serial = new Uint8Array([ tempo >> 16, tempo >> 8, tempo ]);
      return;
    }
    const event = this.createEvent(0);
    event.chid = -1;
    event.opcode = 0xff;
    event.a = 0x51;
    event.serial = new Uint8Array([ tempo >> 16, tempo >> 8, tempo ]);
  }
  
  /* Convert between canonical ticks and real seconds.
   * This assumes a single tempo, as we do in general (but MIDI doesn't).
   */
  secondsFromTicks(ticks) {
    const usPerQnote = this.getTempo(false);
    return (ticks * usPerQnote) / (this.division * 1000000);
  }
  ticksFromSeconds(seconds) {
    const usPerQnote = this.getTempo(false);
    return (seconds * this.division * 1000000) / usPerQnote;
  }
  
  // Deep copy.
  copy() {
    const dst = new Song();
    dst.format = this.format;
    dst.trackCount = this.trackCount;
    dst.division = this.division;
    dst.combined = this.combined;
    dst.events = this.events.map(e => this.copyEvent(e));
    return dst;
  }
  
  copyEvent(src) {
    const dst = {...src};
    if (dst.serial) dst.serial = new Uint8Array(dst.serial);
    return dst;
  }
  
  getFirstNoteTime() {
    for (const event of this.events) {
      if (event.opcode === 0x90) return event.time;
    }
    return 0;
  }
  
  shuffleTimes(dticks) {
    for (const event of this.events) {
      event.time += dticks;
      if (event.time < 0) event.time = 0;
    }
  }
  
  /* In combined mode, there are no Note Off events, and each Note On has (duration,offVelocity).
   * Songs are uncombined after decode, and we uncombine again before encoding.
   * You can combine after decoding, if it's more convenient for UI that way.
   **************************************************************/
   
  combine() {
    if (this.combined) return;
    for (let i=0; i<this.events.length; i++) {
      const event = this.events[i];
      if (event.opcode === 0x80) {
        this.events.splice(i, 1);
        i--;
      } else if (event.opcode === 0x90) {
        const offEvent = this.findOffEvent(i, event.trackid, event.chid, event.a);
        if (offEvent) {
          event.duration = offEvent.time - event.time;
          event.offVelocity = offEvent.b;
        } else {
          event.duration = 0;
          event.offVelocity = 0x40;
        }
      }
    }
    this.combined = true;
  }
  
  uncombine() {
    if (!this.combined) return;
    for (let i=0; i<this.events.length; i++) {
      const event = this.events[i];
      if (event.opcode === 0x90) {
        const offTime = event.time + (event.duration || 0);
        const offVelocity = event.offVelocity || 0x40;
        this.insertEvent({
          id: Song.nextEventId++,
          time: offTime,
          trackid: event.trackid,
          chid: event.chid,
          opcode: 0x80,
          a: event.a,
          b: offVelocity,
        }, 1);
      }
    }
    this.combined = false;
  }
  
  findOffEvent(p, trackid, chid, noteid) {
    for (let i=p; i<this.events.length; i++) {
      const event = this.events[i];
      if (event.opcode !== 0x80) continue;
      if (event.trackid !== trackid) continue;
      if (event.chid !== chid) continue;
      if (event.a !== noteid) continue;
      return event;
    }
    return null;
  }
  
  createEvent(time, order=0) {
    time = Math.round(time);
    const event = {
      id: Song.nextEventId++,
      time,
      trackid: 0,
      chid: 0,
      opcode: 0x90,
      a: 0x40,
      b: 0x40,
      duration: 0,
      offVelocity: 0x40,
    };
    let p = this.searchEventsByTime(time, order);
    this.events.splice(p, 0, event);
    return event;
  }
  
  insertEvent(event, order) {
    let p = this.searchEventsByTime(event.time, order);
    this.events.splice(p, 0, event);
  }
  
  /* Returns a valid insertion point always.
   * (order) tells us how to handle exact matches:
   *   <0: Return the first match.
   *   >0: Return just after the last match.
   *    0: Don't care. An exact match may have simultaneous events both fore and aft.
   */
  searchEventsByTime(time, order) {
    let lo = 0, hi = this.events.length;
    while (lo < hi) {
      let ck = (lo + hi) >> 1;
      const event = this.events[ck];
           if (time < event.time) hi = ck;
      else if (time > event.time) lo = ck + 1;
      else {
        if (order < 0) {
          while (ck && (this.events[ck - 1].time === event.time)) ck--;
        } else if (order > 0) {
          while ((ck < this.events.length) && (this.events[ck].time === event.time)) ck++;
        }
        return ck;
      }
    }
    return lo;
  }
  
  /* Give us a time in ticks, and an encoded event right off the wire.
   * If it's valid, we return the decoded event, which is also added to (this.events).
   */
  addEncodedEventAtTime(time, serial, trackId, chid) {
    if (time < 0) return null;
    if (!serial || (serial.length < 1)) return null;
    if (serial[0] < 0x80) return null;
    if (serial[0] >= 0xf0) return null; // Forbidding Sysex and Realtime.
    if (this.combined && ((serial[0] & 0xf0) === 0x80)) return null; // No Note Off if we're in combined mode, please.
    const event = this.createEvent(time);
    if (!event) return null;
    event.opcode = serial[0] & 0xf0;
    if (trackId >= 0) event.trackId = trackId;
    if ((chid >= 0) && (chid < 0x10)) event.chid = chid;
    else event.chid = serial[0] & 0x0f;
    event.a = serial[1] || 0;
    event.b = serial[2] || 0;
    return event;
  }
  
  /* Encode single event for live playback.
   * Null if this event should not travel on the bus, eg Meta.
   * Otherwise a Uint8Array ready to deliver to a MIDI output device.
   ****************************************************************/
   
  encodeEventForPlayback(event) {
    switch (event.opcode) {
      case 0x80: case 0x90: case 0xa0: case 0xb0: case 0xe0: {
          return new Uint8Array([event.opcode | event.chid, event.a, event.b]);
        }
      case 0xc0: case 0xd0: {
          return new Uint8Array([event.opcode | event.chid, event.a]);
        }
      case 0xf0: break; //TODO Do we want to send Sysex?
      case 0xf7: break; // ''
    }
    return null;
  }
  
  /* Force each track to end with a Meta End of Track event.
   * While we're in there, count the actual MTrk chunks we're going to make and update the header trackCount.
   */
  sanitizeTrackCountAndTerminators() {
    const eventIndicesToDelete = [];
    const terminatorByTrackid = [];
    const lastTimeByTrackid = [];
    for (let i=0; i<this.events.length; i++) {
      const event = this.events[i];
      if (!lastTimeByTrackid[event.trackid] || (event.time > lastTimeByTrackid[event.trackid])) {
        lastTimeByTrackid[event.trackid] = event.time;
      }
      if ((event.opcode === 0xff) && (event.a === 0x2f)) {
        if (terminatorByTrackid[event.trackid]) {
          // Multiple EOT events! Delete all but the first.
          eventIndicesToDelete.push(i);
        } else {
          terminatorByTrackid[event.trackid] = event;
        }
      }
    }
    if (eventIndicesToDelete.length) {
      console.log(`WARNING: Deleting ${eventIndicesToDelete.length} redundant End of Track events`);
      // Run backward so the indices stay fresh.
      for (let i=eventIndicesToDelete.length; i-->0; ) {
        const index = eventIndicesToDelete[i];
        this.events.splice(index, 1);
      }
    }
    if (lastTimeByTrackid.length !== this.trackCount) {
      // Update track count based on the highest index (ie count unused trackid).
      const newCount = lastTimeByTrackid.length;
      console.log(`WARNING: Updating MThd trackCount from ${this.trackCount} to ${newCount}`);
      this.trackCount = newCount;
    }
    for (let trackid=0; trackid<lastTimeByTrackid.length; trackid++) {
      const lastTime = lastTimeByTrackid[trackid];
      if (isNaN(lastTime)) continue; // sparse is ok, and there won't be a terminator if there's no lastTime.
      if (!terminatorByTrackid[trackid]) {
        // Terminator missing. Add one.
        console.log(`WARNING: Adding End of Track event for track ${trackid}`);
        const event = this.createEvent(lastTime + 1); // +1 to be safe. Might mess up the user's timing if he's super precise?
        event.opcode = 0xff;
        event.a = 0x2f;
        event.trackid = trackid;
      } else {
        const term = terminatorByTrackid[trackid];
        if (term.time < lastTime) {
          // Terminator exists but there are more events on that track.
          const newTime = lastTime + 1;
          console.log(`WARNING: Moving End of Track event on track ${trackid} from time ${term.time} to ${newTime}`);
          term.time = newTime;
          // Must painstakingly sort the whole thing after each change, since there could be more insertions during this loop.
          this.sortEvents();
        }
      }
    }
  }
  
  /* At time zero, we'll enforce a few extra sequencing rules, per channel:
   *  - Bank Select before Program Change.
   *  - Program Change before Control Change (except Bank Select).
   *  - Control Change before everything else.
   * If events for one channel are on different tracks, we can't be sure that they'll play back in the right order.
   * But that's your problem, not mine. I recommend one channel per track exactly.
   */
  sanitizeTimeZeroSequence() {
    for (let ai=1; ai<this.events.length; ai++) {
      const a = this.events[ai];
      if (a.time) break;
      for (let bi=0; bi<ai; bi++) {
        const b = this.events[bi];
        if (this.compareTimeZeroSequence(b, a) <= 0) continue;
        console.log(`*** time zero sequence correction ${ai}=>${bi}`, { a, b });
        this.events.splice(ai, 1);
        this.events.splice(bi, 0, a);
        break;
      }
    }
  }
  compareTimeZeroSequence(a, b) {
    // Ignore (time); they must both be zero.
    // Different channels, don't care.
    if (a.chid !== b.chid) return 0;
    // Describe each event as [1,2,3,4] = [Bank Select, Program Change, other Control Change, other]
    const ad = this.describeTimeZeroEvent(a);
    const bd = this.describeTimeZeroEvent(b);
    if (ad < bd) return -1;
    if (ad > bd) return 1;
    return 0;
  }
  describeTimeZeroEvent(event) {
    if (event.opcode === 0xb0) { // Control Change
      if (event.a === 0x00) return 1; // Bank Select MSB
      if (event.b === 0x20) return 1; // Bank Select LSB
      return 3; // other Control Change
    }
    if (event.opcode === 0xc0) return 2; // Program Change
    return 4; // other
  }
  
  /* Encode to file.
   ***************************************************************/
   
  encode() {
    // Important to uncombine before sanitizing: Typically the last real event on a track is a Note Off.
    this.uncombine();
    this.sanitizeTrackCountAndTerminators();
    this.sanitizeTimeZeroSequence();
    const dst = new Encoder();
    
    dst.raw("MThd");
    const mthdLenp = dst.c;
    dst.u16be(this.format);
    dst.u16be(this.trackCount);
    dst.u16be(this.division);
    dst.u32belen(mthdLenp);
    
    for (let trackid=0; ; trackid++) {
      if (!this.encodeMTrk(dst, trackid)) break;
    }
    
    return dst.finish();
  }
  
  // We encode without Running Status or the velocity-zero trick.
  // TODO Could substantially reduce output size if we did those things. Is it worth the effort?
  encodeMTrk(dst, trackid) {
    let lenp = 0; // if nonzero, we've started writing
    let time = 0;
    for (const event of this.events) {
      if (event.trackid !== trackid) continue;
      if (!lenp) {
        dst.raw("MTrk");
        lenp = dst.c;
      }
      dst.vlq(event.time - time);
      this.encodeEvent(dst, event);
      time = event.time;
    }
    if (!lenp) return false;
    dst.u32belen(lenp);
    return true;
  }
  
  encodeEvent(dst, event) {
    switch (event.opcode) {
      case 0x80:
      case 0x90:
      case 0xa0:
      case 0xb0:
      case 0xe0: {
          dst.u8(event.opcode | event.chid);
          dst.u8(event.a);
          dst.u8(event.b);
        } break;
      case 0xc0:
      case 0xd0: {
          dst.u8(event.opcode | event.chid);
          dst.u8(event.a);
        } break;
      case 0xf0: case 0xf7: {
          dst.u8(event.opcode);
          dst.vlqlen(event.serial);
        } break;
      case 0xff: {
          dst.u8(event.opcode);
          dst.u8(event.a);
          dst.vlqlen(event.serial);
        } break;
      default: throw new Error(`Unable to encode event opcode ${event.opcode}`);
    }
  }
  
  /* Decode, dechunking the file.
   ****************************************************************/
  
  decode(serial) {
    this.events = [];
    this.format = 0;
    this.trackCount = 0;
    this.division = 0;
    this.combined = false;
    if (!serial) return;
    this.tracks = [];
    this.time = 0;
    const src = new Decoder(serial);
    while (src.remaining() >= 8) {
      const chunkid = src.u32be();
      const chunk = src.u32belen(true);
      switch (chunkid) {
        case Song.CHUNKID_MThd: this.decodeMThd(chunk); break;
        case Song.CHUNKID_MTrk: this.decodeMTrk(chunk); break;
        default: this.decodeUnknown(chunkid, chunk); break;
      }
    }
    this.decodeFinish();
  }
  
  decodeFinish() {
    if (!this.division) throw new Error("No MThd");
    this.recordEventsFromTracks();
    this.tracks = null;
    this.time = null;
  }
  
  decodeMThd(src) {
    if (this.division) throw new Error("Multiple MThd");
    if (src.length < 6) throw new Error(`Invalid MThd length ${src.length}, expected at least 6`);
    const decoder = new Decoder(src);
    this.format = decoder.u16be();
    this.trackCount = decoder.u16be();
    this.division = decoder.u16be();
    if (!this.division) throw new Error("Illegal division zero");
    if (this.division & 0x8000) throw new Error("SMPTE timing not supported");
  }
  
  decodeMTrk(src) {
    this.tracks.push({
      trackid: this.tracks.length,
      src: new Decoder(src),
      delay: -1, // <0 if we need to read it
      term: false,
      status: 0,
    });
  }
  
  decodeUnknown(chunkid, src) {
    // Ignore, this is fine.
  }
  
  /* Decode, run all tracks to completion and record events.
   ************************************************************************/
   
  recordEventsFromTracks() {
    while (this.recordNextEvent()) ;
  }
  
  recordNextEvent() {
    let minDelay = 0x10000000; // not expressible as VLQ
    for (const track of this.tracks) {
      for (;;) { // read events until it acquires a delay or terminates
        if (track.term) break;
        if (track.delay < 0) {
          this.readDelay(track);
          if (track.term) break;
        }
        if (track.delay) {
          if (track.delay < minDelay) minDelay = track.delay;
          break;
        }
        this.readEvent(track);
      }
    }
    // If we didn't capture a delay, we're done.
    if (minDelay >= 0x10000000) return false;
    // Apply the delay to readhead and tell outer loop to continue.
    this.time += minDelay;
    for (const track of this.tracks) {
      if (track.delay >= minDelay) track.delay -= minDelay;
    }
    return true;
  }
  
  readDelay(track) {
    if (track.src.remaining() < 1) {
      track.term = true;
      return;
    }
    try {
      track.delay = track.src.vlq();
    } catch (e) {
      console.error(`${track.trackid}:${track.src.p}: Malformed VLQ, aborting track early`);
      track.term = true;
    }
  }
  
  readEvent(track) {
    track.delay = -1;
    if (track.src.remaining() < 1) {
      track.term = true;
      return;
    }
    
    let lead = track.src.peekU8();
    if (lead & 0x80) {
      track.status = lead;
      track.src.u8();
    } else if (track.status) {
      lead = track.status;
    } else {
      console.error(`${track.trackid}:${track.src.p}: Missing status byte, aborting track early`);
      track.term = true;
      return;
    }
    
    const event = {
      id: Song.nextEventId++,
      time: this.time,
      trackid: track.trackid,
      chid: lead & 0x0f,
      opcode: lead & 0xf0,
      a: 0,
      b: 0,
    };
    switch (event.opcode) {
      case 0x80: case 0xa0: case 0xb0: case 0xe0: { // Regular AB: Note Off, Note Adjust, Control, Wheel
          try {
            event.a = track.src.u8();
            event.b = track.src.u8();
          } catch (e) {
            console.error(`${track.trackid}:${track.src.p}: Missing data bytes, aborting track early`);
            track.term = true;
            return;
          }
        } break;
      case 0x90: { // Note On. AB, but check for the special velocity-zero case.
          try {
            event.a = track.src.u8();
            event.b = track.src.u8();
          } catch (e) {
            console.error(`${track.trackid}:${track.src.p}: Missing data bytes, aborting track early`);
            track.term = true;
            return;
          }
          if (!event.b) {
            event.opcode = 0x80;
            event.b = 0x40;
          }
        } break;
      case 0xc0: case 0xd0: { // Regular A: Program, Pressure
          try {
            event.a = track.src.u8();
          } catch (e) {
            console.error(`${track.trackid}:${track.src.p}: Missing data bytes, aborting track early`);
            track.term = true;
            return;
          }
        } break;
      case 0xf0: {
          track.status = 0;
          event.opcode = lead;
          event.chid = -1;
          switch (event.opcode) {
            case 0xff: { // Meta
                try {
                  event.a = track.src.u8();
                } catch (e) {
                  console.error(`${track.trackid}:${track.src.p}: Missing Meta Type`);
                  track.term = true;
                  return;
                }
              } // pass; remainder of Meta event is the same as Sysex (VLQ + serial)
            case 0xf0: case 0xf7: { // Sysex
                try {
                  event.serial = track.src.vlqlen(true);
                } catch (e) {
                  console.error(`${track.trackid}:${track.src.p}: Error reading Meta or Sysex payload`);
                  track.term = true;
                  return;
                }
              } break;
            default: {
                console.error(`${track.trackid}:${track.p}: Unexpected opcode ${event.opcode}`);
                track.term = true;
                return;
              }
          }
        } break;
    }
    
    this.events.push(event);
  }
}

Song.nextEventId = 1;

Song.CHUNKID_MThd = 0x4d546864;
Song.CHUNKID_MTrk = 0x4d54726b;
