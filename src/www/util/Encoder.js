/* Encoder.js
 * Packs binary data into an ArrayBuffer.
 */
 
export class Encoder {
  constructor() {
    this.v = new Uint8Array(256);
    this.c = 0;
    this.textEncoder = null;
  }
  
  /* Returns a new ArrayBuffer with content copied from our internal buffer.
   * It's safe to continue encoding after; the thing returned previously won't change.
   */
  finish() {
    const dst = new Uint8Array(this.c);
    const srcView = new Uint8Array(this.v.buffer, 0, this.c);
    dst.set(srcView);
    return dst.buffer;
  }
  
  require(addc) {
    if (addc < 1) return;
    let na = this.c + addc;
    if (na <= this.v.length) return;
    na = (na + 256) & ~255;
    const nv = new Uint8Array(na);
    nv.set(this.v);
    this.v = nv;
  }
  
  requireTextEncoder() {
    if (this.textEncoder) return;
    this.textEncoder = new TextEncoder("utf-8");
  }
  
  /* Plain integers.
   * Note they are all named "u" but since we're writing, sign doesn't matter.
   *******************************************************************************/
  
  u8(v) {
    this.require(1);
    this.v[this.c++] = v;
  }
  
  u16be(v) {
    this.require(2);
    this.v[this.c++] = v >> 8;
    this.v[this.c++] = v;
  }
  
  u32be(v) {
    this.require(4);
    this.v[this.c++] = v >> 24;
    this.v[this.c++] = v >> 16;
    this.v[this.c++] = v >> 8;
    this.v[this.c++] = v;
  }
  
  u16le(v) {
    this.require(2);
    this.v[this.c++] = v;
    this.v[this.c++] = v >> 8;
  }
  
  u32le(v) {
    this.require(4);
    this.v[this.c++] = v;
    this.v[this.c++] = v >> 8;
    this.v[this.c++] = v >> 16;
    this.v[this.c++] = v >> 24;
  }
  
  /* Integers, alternate formats.
   *****************************************************************/
   
  vlq(v) {
    this.require(4);
    if (v < 0) throw new Error(`Illegal value ${v} for VLQ`);
    if (v < 0x80) {
      this.v[this.c++] = v;
      return;
    }
    if (v < 0x4000) {
      this.v[this.c++] = 0x80 | (v >> 7);
      this.v[this.c++] = v & 0x7f;
      return;
    }
    if (v < 0x200000) {
      this.v[this.c++] = 0x80 | (v >> 14);
      this.v[this.c++] = 0x80 | (v >> 7);
      this.v[this.c++] = v & 0x7f;
      return;
    }
    if (v < 0x10000000) {
      this.v[this.c++] = 0x80 | (v >> 21);
      this.v[this.c++] = 0x80 | (v >> 14);
      this.v[this.c++] = 0x80 | (v >> 7);
      this.v[this.c++] = v & 0x7f;
      return;
    }
    throw new Error(`Illegal value ${v} for VLQ`);
  }
  
  /* Chunks of data.
   *************************************************************/
  
  // ArrayBuffer, Uint8Array, string, Encoder
  raw(v) {
    this.appendUint8Array(this.rawInputAsUint8Array(v));
  }
  
  rawInputAsUint8Array(v) {
    if (v instanceof ArrayBuffer) {
      return new Uint8Array(v);
    } else if (v instanceof Uint8Array) {
      return v;
    } else if (typeof(v) === "string") {
      this.requireTextEncoder();
      return this.textEncoder.encode(v);
    } else if (v instanceof Encoder) {
      return new Uint8Array(v.finish());
    } else {
      throw new Error(`Unsuitable value for raw append`);
    }
  }
  
  appendUint8Array(v) {
    this.require(v.length);
    const dstView = new Uint8Array(this.v.buffer, this.c, v.length);
    dstView.set(v);
    this.c += v.length;
  }
  
  insertBytes(p, v) {
    if (v.length < 1) return;
    if ((p < 0) || (p > this.c)) throw new Error(`Insertion point ${p} out of range, length=${this.c}`);
    this.require(v.length);
    const loViewW = new Uint8Array(this.v.buffer, p, v.length);
    const loViewR = new Uint8Array(this.v.buffer, p, this.c - p);
    const hiView = new Uint8Array(this.v.buffer, p + v.length, this.c - p);
    hiView.set(loViewR);
    loViewW.set(v);
    this.c += v.length;
  }
  
  /* Insert length prefix at some point in the past.
   * If (p) is a number, you've already encoded the payload and we're inserting length.
   * Otherwise (p) is the payload.
   ********************************************************/
   
  u8len(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      if (len > 0xff) throw new Error(`Can't insert length ${len} as u8`);
      this.insertBytes(p, [len]);
    } else {
      const v = this.rawInputAsUint8Array(p);
      if (v.length > 0xff) throw new Error(`Can't insert length ${len} as u8`);
      this.u8(v.length);
      this.appendUint8Array(v);
    }
  }
   
  u16belen(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      if (len > 0xffff) throw new Error(`Can't insert length ${len} as u16`);
      this.insertBytes(p, [len >> 8, len]);
    } else {
      const v = this.rawInputAsUint8Array(p);
      if (v.length > 0xffff) throw new Error(`Can't insert length ${len} as u16`);
      this.u16be(v.length);
      this.appendUint8Array(v);
    }
  }
   
  u32belen(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      this.insertBytes(p, [len >> 24, len >> 16, len >> 8, len]);
    } else {
      const v = this.rawInputAsUint8Array(p);
      this.u32be(v.length);
      this.appendUint8Array(v);
    }
  }
   
  u16lelen(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      if (len > 0xffff) throw new Error(`Can't insert length ${len} as u16`);
      this.insertBytes(p, [len, len >> 8]);
    } else {
      const v = this.rawInputAsUint8Array(p);
      if (v.length > 0xffff) throw new Error(`Can't insert length ${len} as u16`);
      this.u16le(v.length);
      this.appendUint8Array(v);
    }
  }
   
  u32lelen(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      this.insertBytes(p, [len, len >> 8, len >> 16, len >> 24]);
    } else {
      const v = this.rawInputAsUint8Array(p);
      this.u32le(v.length);
      this.appendUint8Array(v);
    }
  }
  
  vlqlen(p) {
    if (typeof(p) === "number") {
      const len = this.c - p;
      if (len >= 0x10000000) throw new Error(`Can't insert length ${len} as VLQ`);
      const tmp = [0x80 | (len >> 21), 0x80 | (len >> 14), 0x80 | (len >> 7), len & 0x7f];
      while (tmp[0] === 0x80) tmp.splice(0, 1);
      this.insertBytes(p, tmp);
    } else {
      const v = this.rawInputAsUint8Array(p);
      if (v.length > 0x10000000) throw new Error(`Can't insert length ${len} as VLQ`);
      this.vlq(v.length);
      this.appendUint8Array(v);
    }
  }
    
}
