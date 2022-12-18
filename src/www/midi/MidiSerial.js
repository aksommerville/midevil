/* MidiSerial.js
 * Constants and encoding helpers. Static only.
 */
 
export class MidiSerial {
  
  static reprNote(noteid) {
    if (typeof(noteid) !== "number") return "";
    if (noteid < 0) return "";
    if (noteid > 0x7f) return "";
    const octave = Math.floor(noteid / 12) - 1; // -1..9. NB Octaves start on C because C is the first letter or something.
    let name;
    switch (noteid % 12) { // Note 0 is C-1
      case 0: name = "C"; break;
      case 1: name = "C#"; break;
      case 2: name = "D"; break;
      case 3: name = "D#"; break;
      case 4: name = "E"; break;
      case 5: name = "F"; break;
      case 6: name = "F#"; break;
      case 7: name = "G"; break;
      case 8: name = "G#"; break;
      case 9: name = "A"; break;
      case 10: name = "A#"; break;
      case 11: name = "B"; break;
    }
    return `${name}${octave}`;
  }
  
  // I'm adding this a little late, the text is duplicated in a few places already.
  static reprOpcode(opcode) {
    switch (opcode) {
      case 0x80: return "Note Off";
      case 0x90: return "Note On";
      case 0xa0: return "Note Adjust";
      case 0xb0: return "Control Change";
      case 0xc0: return "Program Change";
      case 0xd0: return "Channel Pressure";
      case 0xe0: return "Pitch Wheel";
      case 0xf0: return "Sysex (unterminated)";
      case 0xf7: return "Sysex (terminated)";
      case 0xff: return "Meta";
    }
    return "";
  }
  
  static reprControlKey(key) {
    switch (key) {
      // This list is exhaustive, to my knowledge.
      case 0x00: return "Bank MSB";
      case 0x01: return "Mod MSB";
      case 0x02: return "Breath MSB";
      case 0x04: return "Foot MSB";
      case 0x05: return "Porta Time MSB";
      case 0x06: return "Data Entry MSB";
      case 0x07: return "Volume MSB";
      case 0x08: return "Balance MSB";
      case 0x0a: return "Pan MSB";
      case 0x0b: return "Expression MSB";
      case 0x0c: return "Effect 1 MSB";
      case 0x0d: return "Effect 2 MSB";
      case 0x0e: return "Effect 3 MSB";
      case 0x0f: return "Effect 4 MSB";
      case 0x10: return "GP 1 MSB";
      case 0x11: return "GP 2 MSB";
      case 0x12: return "GP 3 MSB";
      case 0x13: return "GP 4 MSB";
      case 0x20: return "Bank LSB";
      case 0x21: return "Mod LSB";
      case 0x22: return "Breath LSB";
      case 0x24: return "Foot LSB";
      case 0x25: return "Porta Time LSB";
      case 0x26: return "Data Entry LSB";
      case 0x27: return "Volume LSB";
      case 0x28: return "Balance LSB";
      case 0x2a: return "Pan LSB";
      case 0x2b: return "Expression LSB";
      case 0x2c: return "Effect 1 LSB";
      case 0x2d: return "Effect 2 LSB";
      case 0x2e: return "Effect 3 LSB";
      case 0x2f: return "Effect 4 LSB";
      case 0x30: return "GP 1 LSB";
      case 0x31: return "GP 2 LSB";
      case 0x32: return "GP 3 LSB";
      case 0x33: return "GP 4 LSB";
      case 0x40: return "Sustain Switch";
      case 0x41: return "Porta Switch";
      case 0x42: return "Sustenuto Switch";
      case 0x43: return "Soft Switch";
      case 0x44: return "Legato Switch";
      case 0x45: return "Hold 2 Switch";
      case 0x46: return "C1 Sound Variation";
      case 0x47: return "C2 Timbre";
      case 0x48: return "C3 Release Time";
      case 0x49: return "C4 Attack Time";
      case 0x4a: return "C5 Brightness";
      case 0x4b: return "C6";
      case 0x4c: return "C7";
      case 0x4d: return "C8";
      case 0x4e: return "C9";
      case 0x4f: return "C10";
      case 0x50: return "GP 5";
      case 0x51: return "GP 6";
      case 0x52: return "GP 7";
      case 0x53: return "GP 8";
      case 0x54: return "Porta Control";
      case 0x5b: return "Effect 1 Depth";
      case 0x5c: return "Effect 2 Depth";
      case 0x5d: return "Effect 3 Depth";
      case 0x5e: return "Effect 4 Depth";
      case 0x5f: return "Effect 5 Depth";
      case 0x78: return "All Sound Off";
      case 0x79: return "Reset Controllers";
      case 0x7a: return "Local Controller Switch";
      case 0x7b: return "All Notes Off";
      case 0x7c: return "Omni Off";
      case 0x7d: return "Omni On";
      case 0x7e: return "Poly Switch";
      case 0x7f: return "Poly On";
    }
  }
  
  static reprMetaKey(key) {
    switch (key) {
      // This list is not exhaustive.
      case 0x01: return "Text";
      case 0x02: return "Copyright";
      case 0x03: return "Track Name";
      case 0x04: return "Instrument Name";
      case 0x05: return "Lyrics";
      case 0x06: return "Marker";
      case 0x07: return "Cue Point";
      // 0x08..0x0f Text of undefined intent
      case 0x20: return "Channel Prefix"; // We could use this more intelligently if we cared, luckily we don't.
      case 0x2f: return "End of Track";
      case 0x51: return "Set Tempo";
      case 0x54: return "SMPTE Offset";
      case 0x58: return "Time Signature";
      case 0x59: return "Key Signature";
    }
    return "";
  }
  
  /* GM program name for a Fully-Qualified Program ID, ie one with the Bank ID in bits 20..7.
   */
  static reprProgram(fqpid) {
    if (fqpid < 0) return "";
    const bank = (fqpid >> 7) & 0x3fff;
    const pid = fqpid & 0x7f;
    const name = [
      "Acoustic Grand Piano ",
      "Bright Acoustic Piano",
      "Electric Grand Piano",
      "Honky-Tonk Piano",
      "Electric Piano 1 (Rhodes Piano)",
      "Electric Piano 2 (Chorused Piano)",
      "Harpsichord",
      "Clavinet",
      "Celesta ",
      "Glockenspiel",
      "Music Box",
      "Vibraphone",
      "Marimba",
      "Xylophone",
      "Tubular Bells",
      "Dulcimer (Santur)",
      "Drawbar Organ (Hammond) ",
      "Percussive Organ",
      "Rock Organ",
      "Church Organ",
      "Reed Organ",
      "Accordion (French)",
      "Harmonica",
      "Tango Accordion (Band neon)",
      "Acoustic Guitar (nylon) ",
      "Acoustic Guitar (steel)",
      "Electric Guitar (jazz)",
      "Electric Guitar (clean)",
      "Electric Guitar (muted)",
      "Overdriven Guitar",
      "Distortion Guitar",
      "Guitar harmonics",
      "Acoustic Bass ",
      "Electric Bass (fingered)",
      "Electric Bass (picked)",
      "Fretless Bass",
      "Slap Bass 1",
      "Slap Bass 2",
      "Synth Bass 1",
      "Synth Bass 2",
      "Violin ",
      "Viola",
      "Cello",
      "Contrabass",
      "Tremolo Strings",
      "Pizzicato Strings",
      "Orchestral Harp",
      "Timpani",
      "String Ensemble 1 (strings) ",
      "String Ensemble 2 (slow strings)",
      "SynthStrings 1",
      "SynthStrings 2",
      "Choir Aahs",
      "Voice Oohs",
      "Synth Voice",
      "Orchestra Hit",
      "Trumpet ",
      "Trombone",
      "Tuba",
      "Muted Trumpet",
      "French Horn",
      "Brass Section",
      "SynthBrass 1",
      "SynthBrass 2",
      "Soprano Sax ",
      "Alto Sax",
      "Tenor Sax",
      "Baritone Sax",
      "Oboe",
      "English Horn",
      "Bassoon",
      "Clarinet",
      "Piccolo ",
      "Flute",
      "Recorder",
      "Pan Flute",
      "Blown Bottle",
      "Shakuhachi",
      "Whistle",
      "Ocarina",
      "Lead 1 (square wave) ",
      "Lead 2 (sawtooth wave)",
      "Lead 3 (calliope)",
      "Lead 4 (chiffer)",
      "Lead 5 (charang)",
      "Lead 6 (voice solo)",
      "Lead 7 (fifths)",
      "Lead 8 (bass + lead)",
      "Pad 1 (new age Fantasia) ",
      "Pad 2 (warm)",
      "Pad 3 (polysynth)",
      "Pad 4 (choir space voice)",
      "Pad 5 (bowed glass)",
      "Pad 6 (metallic pro)",
      "Pad 7 (halo)",
      "Pad 8 (sweep)",
      "FX 1 (rain) ",
      "FX 2 (soundtrack)",
      "FX 3 (crystal)",
      "FX 4 (atmosphere)",
      "FX 5 (brightness)",
      "FX 6 (goblins)",
      "FX 7 (echoes, drops)",
      "FX 8 (sci-fi, star theme)",
      "Sitar ",
      "Banjo",
      "Shamisen",
      "Koto",
      "Kalimba",
      "Bag pipe",
      "Fiddle",
      "Shanai",
      "Tinkle Bell ",
      "Agogo",
      "Steel Drums",
      "Woodblock",
      "Taiko Drum",
      "Melodic Tom",
      "Synth Drum",
      "Reverse Cymbal",
      "Guitar Fret Noise ",
      "Breath Noise",
      "Seashore",
      "Bird Tweet",
      "Telephone Ring",
      "Helicopter",
      "Applause",
      "Gunshot",
    ][pid];
    if (!name) return "";
    if (bank) return `${name}(${bank})`;
    return name;
  }
}
