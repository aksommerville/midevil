/* Decoder.js
 * Structured decoder for binary data.
 */
 
export class Decoder {
  constructor(src) {
    this.v = null; // Uint8Array
    this.p = 0;
    this.textDecoder = null;
    if (src instanceof Decoder) this.initDecoder(src);
    else if (src instanceof ArrayBuffer) this.initArrayBuffer(src);
    else if (src instanceof Uint8Array) this.initUint8Array(src);
    else if (typeof(src) === "string") this.initString(src);
    else if (Array.isArray(src)) this.initArray(src);
    else throw new Error(`Invalid input type for Decoder`);
  }
  
  initDecoder(src) {
    this.v = src.v;
    this.p = src.p;
  }
  
  initArrayBuffer(src) {
    this.v = new Uint8Array(src);
  }
  
  initUint8Array(src) {
    this.v = src;
  }
  
  initString(src) {
    this.v = new TextEncoder("utf-8").encode(src);
  }
  
  initArray(src) {
    this.v = new Uint8Array(src);
  }
  
  require(c) {
    if (this.p > this.v.length - c) {
      throw new Error(`Expected ${c} more bytes at ${this.p}/${this.v.length}`);
    }
  }
  
  requireTextDecoder() {
    if (this.textDecoder) return;
    this.textDecoder = new TextDecoder("utf-8");
  }
  
  remaining() {
    return this.v.length - this.p;
  }
  
  /* Plain integers.
   *****************************************************************/
   
  peekU8() {
    this.require(1);
    return this.v[this.p];
  }
  
  u8() {
    this.require(1);
    return this.v[this.p++];
  }
  
  s8() {
    this.require(1);
    return this.signed(this.v[this.p++], 0x7f);
  }
  
  u16be() {
    this.require(2);
    const n = (this.v[this.p] << 8) | this.v[this.p + 1];
    this.p += 2;
    return n;
  }
  
  s16be() {
    this.require(2);
    const n = (this.v[this.p] << 8) | this.v[this.p + 1];
    this.p += 2;
    return this.signed(n, 0x7fff);
  }
  
  u32be() {
    this.require(4);
    const n = (this.v[this.p] << 24) | (this.v[this.p + 1] << 16) | (this.v[this.p + 2] << 8) | this.v[this.p + 3];
    this.p += 4;
    return n;
  }
  
  s32be() {
    this.require(4);
    const n = (this.v[this.p] << 24) | (this.v[this.p + 1] << 16) | (this.v[this.p + 2] << 8) | this.v[this.p + 3];
    this.p += 4;
    return this.signed(n, 0x7fffffff);
  }
  
  u16le() {
    this.require(2);
    const n = this.v[this.p] | (this.v[this.p + 1] << 8);
    this.p += 2;
    return n;
  }
  
  s16le() {
    this.require(2);
    const n = this.v[this.p] | (this.v[this.p + 1] << 8);
    this.p += 2;
    return this.signed(n, 0x7fff);
  }
  
  u32le() {
    this.require(4);
    const n = this.v[this.p] | (this.v[this.p + 1] << 8) | (this.v[this.p + 2] << 16) | (this.v[this.p + 3] << 24);
    this.p += 4;
    return n;
  }
  
  s32le() {
    this.require(4);
    const n = this.v[this.p] | (this.v[this.p + 1] << 8) | (this.v[this.p + 2] << 16) | (this.v[this.p + 3] << 24);
    this.p += 4;
    return this.signed(n, 0x7fffffff);
  }
  
  signed(v, umax) {
    const hibits = ~umax;
    if (v & hibits) return v | hibits;
    return v;
  }
  
  /* Integers, alternate formats.
   ****************************************************************/
   
  vlq() {
    let v = 0;
    for (let i=4; i-->0;) {
      this.require(1);
      const b = this.v[this.p++];
      v <<= 7;
      v |= b & 0x7f;
      if (!(b & 0x80)) return v;
    }
    this.p -= 4;
    throw new Error(`Invalid VLQ at ${this.p}/${this.length}`);
  }
  
  /* Raw data.
   *****************************************************************/
   
  arrayBuffer(len) {
    this.require(len);
    const dstView = new Uint8Array(len);
    dstView.set(this.v, this.p);
    this.p += len;
    return dstView.buffer;
  }
  
  uint8ArrayView(len) {
    this.require(len);
    const v = new Uint8Array(this.v.buffer, this.v.byteOffset + this.p, len);
    this.p += len;
    return v;
  }
  
  string(len) {
    const src = this.uint8ArrayView(len);
    this.requireTextDecoder();
    return this.textDecoder.decode(src);
  }
  
  /* Raw data with prefix length.
   * These all return ArrayBuffers (copying data) by default, or Uint8Array views if requested.
   ****************************************************************/
   
  u8len(view) {
    const len = this.u8();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
  
  u16belen(view) {
    const len = this.u16be();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
  
  u32belen(view) {
    const len = this.u32be();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
  
  u16lelen(view) {
    const len = this.u16le();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
  
  u32lelen(view) {
    const len = this.u32le();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
  
  vlqlen(view) {
    const len = this.vlq();
    return view ? this.uint8ArrayView(len) : this.arrayBuffer(len);
  }
}
