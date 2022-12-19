/* ChartRenderer.js
 * Responsible for rendering, and the authority for event visibility and placement on screen.
 * ChartEditor leans on this to know where events are located visually.
 */
 
export class ChartRenderer {
  static getDependencies() {
    return [];
  }
  constructor() {
  
    // Owner must set upon construction.
    this.chartUi = null;
    this.chartEditor = null;
    
    this.VERT_LINE_SPACING_MIN = 10; // pixels between vertical grid lines
    this.EVENT_WIDTH_MIN = 10;

    this.scrollX = 0;
    this.scrollY = 0;    
    this.qnoteWidthPixels = 1; // usually has a fraction; will overwrite before returning
    this.rowHeightPixels = 1;
    this.currentEvents = []; // SongEvent + {x,y,w,h}. ChartEditor will access directly.
    this.visibility = {}; // VisibilityUi.js:VisibilityModel. An empty object means "show everything".
  }
  
  getSizePixels() {
    const duration = this.chartUi.song ? this.chartUi.song.getDurationQnotes() : 0;
    const widthSlop = 200; // Ensure there is always some right-hand room to grow into.
    return [duration * this.qnoteWidthPixels + widthSlop, 128 * this.rowHeightPixels];
  }
  
  setScale(x, y) {
    this.qnoteWidthPixels = 1 + (x * 256) / 1000;
    this.rowHeightPixels = 1 + (y * 16) / 1000;
  }
  
  setScroll(x, y) {
    if ((x === this.scrollX) && (y === this.scrollY)) return false;
    this.scrollX = x;
    this.scrollY = y;
    return true;
  }
  
  setVisibility(model) {
    this.visibility = model;
    this.currentEvents = [];
  }
  
  /* Event location.
   **************************************************************************/
   
  // Returns [x, y, time, noteid, events]
  locateEvent(xView, yView, search) {
    const x = this.scrollX + xView;
    const y = this.scrollY + yView;
    const time = this.chartUi.song ? ((x * this.chartUi.song.division) / this.qnoteWidthPixels) : 0;
    const noteid = 0x7f - Math.floor(y / this.rowHeightPixels);
    const events = [];
    if (search) {
      for (const songEvent of this.currentEvents) {
        if (xView < songEvent.x) continue;
        if (yView < songEvent.y) continue;
        if (xView >= songEvent.x + songEvent.w) continue;
        if (yView >= songEvent.y + songEvent.h) continue;
        events.push(songEvent);
      }
    }
    return [x, y, time, noteid, events];
  }
  
  songTimeForViewX(x) {
    if (!this.chartUi.song) return 0;
    return ((x + this.scrollX) * this.chartUi.song.division) / this.qnoteWidthPixels;
  }
  
  viewXForSongTime(time) {
    if (!this.chartUi.song) return 0;
    return (time * this.qnoteWidthPixels) / this.chartUi.song.division - this.scrollX;
  }
  
  /* Render.
   **************************************************************************************/
  
  render(canvas) {
    const bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    
    const hiddenEvents = [], visibleEvents = [];
    this.bucketEventsForDisplay(visibleEvents, hiddenEvents, canvas.width);
    this.currentEvents = [];
    
    this.renderBackground(context, canvas.width, canvas.height);
    this.renderHiddenEvents(context, canvas.width, canvas.height, hiddenEvents);
    this.renderGrid(context, canvas.width, canvas.height);
    this.renderVisibleEvents(context, canvas.width, canvas.height, visibleEvents);
    if (this.chartEditor.pendingSelection) {
      this.renderPendingSelection(context, canvas.width, canvas.height, this.chartEditor.pendingSelection);
    }
  }
  
  // Clear the canvas to a background color, with variations to highlight certain rows.
  renderBackground(context, fullw, fullh) {
    const rowa = Math.max(0, Math.floor(this.scrollY / this.rowHeightPixels));
    const rowz = Math.min(127, Math.ceil((this.scrollY + fullh) / this.rowHeightPixels));
    let y = rowa * this.rowHeightPixels - this.scrollY;
    let noteid = 0x7f - rowa;
    let highlightRows;
    if (this.chartUi.noteHighlights.length) {
      highlightRows = new Set(this.chartUi.noteHighlights.map(h => h.noteid));
    } else {
      highlightRows = new Set();
    }
    for (let row=rowa; row<=rowz; row++, y+=this.rowHeightPixels, noteid--) {
      if (highlightRows.has(noteid)) {
        context.fillStyle = "#ffff00";
      } else if ((noteid >= 0x3c) && (noteid < 0x48)) { // C4..B4
        context.fillStyle = (row & 1) ? "#1c1c1c" : "#181818";
      } else {
        context.fillStyle = (row & 1) ? "#101010" : "#141414";
      }
      context.fillRect(0, y, fullw, this.rowHeightPixels);
    }
  }
  
  // Grid lines in both axes.
  renderGrid(context, fullw, fullh) {
    
    // Row lines are simple enough, same idea as background.
    const rowa = Math.max(0, Math.floor(this.scrollY / this.rowHeightPixels));
    const rowz = Math.min(127, Math.ceil((this.scrollY + fullh) / this.rowHeightPixels));
    let y = rowa * this.rowHeightPixels - this.scrollY;
    context.beginPath();
    for (let row=rowa; row<=rowz; row++, y+=this.rowHeightPixels) {
      context.moveTo(0, y);
      context.lineTo(fullw, y);
    }
    context.strokeStyle = "#222";
    context.stroke();
    
    // If we don't have a song, there is nothing sensible we can do on the horizontal axis, so we're done.
    if (!this.chartUi.song) return;
    const duration = this.chartUi.song.getDurationTicks();
    if (duration < 1) return;
    const ticksPerQnote = this.chartUi.song.division || 1;
    
    /* Column lines are more interesting.
     * First select the finest division we're going to draw.
     * This is never finer than one tick, never closer than some constant threshold, and always an integer multiple of ticks.
     */
    let ticksPerLine = ticksPerQnote;
    let lineSpacing = this.qnoteWidthPixels;
    if (lineSpacing >= this.VERT_LINE_SPACING_MIN) {
      // Check the simple one-line-per-tick case, when you're zoomed in way far.
      const pixelsPerTick = this.qnoteWidthPixels / ticksPerQnote;
      if (pixelsPerTick >= this.VERT_LINE_SPACING_MIN) {
        ticksPerLine = 1;
        lineSpacing = pixelsPerTick;
      } else {
        // Cut in half until we can't. If the song's division is far from powers of two, we will skip a few possibilities.
        const doubleSpacing = this.VERT_LINE_SPACING_MIN * 2;
        while ((ticksPerLine > 1) && !(ticksPerLine & 1) && (lineSpacing >= doubleSpacing)) {
          lineSpacing /= 2;
          ticksPerLine /= 2;
        }
      }
    } else {
      // Double the division until we're wide enough.
      while (lineSpacing < this.VERT_LINE_SPACING_MIN) {
        ticksPerLine *= 2;
        lineSpacing *= 2;
      }
    }
    
    const measureBoundary = ticksPerQnote * 4; //TODO Are we going to support measures of other than 4 qnotes? (for decorative purposes)
    const leftTick = (this.scrollX * ticksPerLine) / lineSpacing;
    const rightTick = ((this.scrollX + fullw) * ticksPerLine) / lineSpacing;
    let tick = Math.ceil((leftTick / ticksPerLine)) * ticksPerLine;
    let x = (tick * lineSpacing) / ticksPerLine - this.scrollX;
    for (; x<fullw && tick<=duration; x+=lineSpacing, tick+=ticksPerLine) {
      // TODO Is it worth combining like colors into a single path, instead of one path per line?
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, fullh);
      if (!(tick % measureBoundary)) context.strokeStyle = "#888";
      else if (!(tick % ticksPerQnote)) context.strokeStyle = "#444";
      else context.strokeStyle = "#222";
      context.stroke();
    }
  }
  
  // Events not currently in focus are drawn faintly, behind the grid.
  renderHiddenEvents(context, fullw, fullh, events) {
    context.fillStyle = "#333";
    for (const event of events) {
      const bounds = this.calculateEventRenderBounds(event);
      context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
  }
  
  // Foreground events are loud and colorful, on top of everything.
  // We also rewrite (currentEvents) while processing, because others will surely like to know what's currently in play.
  renderVisibleEvents(context, fullw, fullh, events) {
    this.currentEvents = [];
    for (const event of events) {
      const bounds = this.calculateEventRenderBounds(event);
      
      let drawBBar = (event.opcode === 0x90); // This was going to be only when selected, but hey it's helpful always.
      if (this.chartEditor.selectedEvents.find(e => e.id === event.id)) {
        context.fillStyle = "#08f";
      } else {
        context.fillStyle = this.colorForVisibleEvent(event);
      }
      
      context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      this.currentEvents.push({
        ...event,
        ...bounds,
      });
      
      // Notes with a duration can be extended from the right edge.
      // Highlight these with a vertical bar.
      if (typeof(event.duration) === "number") {
        const x = bounds.x + bounds.w - this.rowHeightPixels;
        if (x >= bounds.x) {
          context.beginPath();
          context.moveTo(x, bounds.y);
          context.lineTo(x, bounds.y + bounds.h);
          context.strokeStyle = "#000";
          context.stroke();
        }
      }
      
      // Optional horizontal line for B values.
      if (drawBBar) {
        const y = bounds.y + bounds.h - 2;
        if (y >= bounds.y) {
          context.beginPath();
          context.moveTo(bounds.x, y);
          context.lineTo(bounds.x + (event.b * bounds.w) / 0x7f, y);
          context.strokeStyle = "#000";
          context.stroke();
        }
      }
    }
  }
  
  // If selected, pick that off on your own.
  colorForVisibleEvent(event) {
    switch (event.opcode) {
      case 0x90: { // Note On: black..green..white per velocity
          if (event.b < 0x40) {
            const luma = Math.floor((event.b * 0x100) / 0x40);
            return `rgb(0,${luma},0)`;
          } else {
            const luma = Math.floor(((event.b - 0x40) * 0x100) / 0x40);
            return `rgb(${luma},255,${luma})`;
          }
        }
      case 0xa0: { // Note Adjust: black..blue..white per velocity
          if (event.b < 0x40) {
            const luma = Math.floor((event.b * 0x100) / 0x40);
            return `rgb(0,0,${luma})`;
          } else {
            const luma = Math.floor(((event.b - 0x40) * 0x100) / 0x40);
            return `rgb(${luma},${luma},255)`;
          }
        }
      case 0xd0: { // Channel Pressure: Same as Note Adjust
          if (event.a < 0x40) {
            const luma = Math.floor((event.a * 0x100) / 0x40);
            return `rgb(0,0,${luma})`;
          } else {
            const luma = Math.floor(((event.a - 0x40) * 0x100) / 0x40);
            return `rgb(${luma},${luma},255)`;
          }
        }
      case 0xe0: { // Pitch Wheel: yellow..black..cyan
          const v = event.a | (event.b << 7);
          if (v < 0x2000) {
            const luma = Math.floor(((0x2000 - v) * 0x100) / 0x2000);
            return `rgb(${luma},${luma},0)`;
          } else {
            const luma = Math.floor(((v - 0x2000) * 0x100) / 0x2000);
            return `rgb(0,${luma},${luma})`;
          }
        }
      case 0xb0: { // Control Change: purple. Do we want to scale the color per value?
          return "#60a";
        }
    }
    return "#f00";
  }
  
  calculateEventRenderBounds(event) {
  
    // (x,w,h) are pretty straightforward, but (y) is interesting. (w) will be clamped to a minimum at the end.
    const x = (event.time * this.qnoteWidthPixels) / this.chartUi.song.division - this.scrollX;
    const w = event.duration ? ((event.duration * this.qnoteWidthPixels) / this.chartUi.song.division) : 0;
    const h = this.rowHeightPixels;
    
    let y = 0;
    switch (event.opcode) {
    
      // Notes and Control Changes get a vertical position by key.
      case 0x90: case 0xa0: { // Note On, Note Adjust.
          y = 0x7f - event.a;
        } break;
      case 0xb0: { // Control.
          y = 0x7f - event.a;
        } break;
        
      // Unknown, Program Change, Meta, Sysex, we lump into special rows up at the top.
      // The value for Pressure and Wheel events will be expressed as a color.
      case 0xf0: case 0xff: { // Sysex.
          y = 1;
        } break;
      case 0xc0: { // Program.
          y = 2;
        } break;
      case 0xd0: { // Pressure.
          y = 3;
        } break;
      case 0xe0: { // Wheel
          y = 4;
        } break;
      case 0xff: { // Meta. Like controls, maybe we want to occupy different rows for different event types.
          y = 5;
        } break;
    }
    y &= 0x7f;
    y = y * this.rowHeightPixels - this.scrollY;
    
    return {
      x, y, h,
      w: Math.max(w, this.EVENT_WIDTH_MIN),
    };
  }
  
  renderPendingSelection(context, fullw, fullh, selection) {
    context.fillStyle = "#08f";
    context.globalAlpha = 0.7;
    context.fillRect(selection.x, selection.y, selection.w, selection.h);
    context.globalAlpha = 1.0;
    context.beginPath();
    context.moveTo(selection.x, selection.y);
    context.lineTo(selection.x, selection.y + selection.h);
    context.lineTo(selection.x + selection.w, selection.y + selection.h);
    context.lineTo(selection.x + selection.w, selection.y);
    context.closePath();
    context.strokeStyle = "#00f";
    context.lineWidth = 2;
    context.stroke();
    context.lineWidth = 1;
  }
  
  /* Select events by visibility.
   **********************************************************************/
  
  bucketEventsForDisplay(visible, hidden, viewWidth) {
    if (!this.chartUi.song) return;
    const leftTick = (this.scrollX * this.chartUi.song.division) / this.qnoteWidthPixels;
    const rightTick = ((this.scrollX + viewWidth) * this.chartUi.song.division) / this.qnoteWidthPixels;
    // Unfortunately, I think we can't binary-search by left time, because there could be a Note On at time zero that spans the whole song.
    for (const event of this.chartUi.song.events) {
      // First timestamp beyond our right edge, we're done.
      if (event.time > rightTick) break;
      // End of event, including duration, left of our view, skip it.
      const endTime = event.time + (event.duration || 0);
      if (endTime < leftTick) continue;
      
      // There shouldn't be any Note Off events in our song; it should be "combined". But if we find any, ignore them.
      if (event.opcode === 0x80) continue;
      
      if (this.eventIsVisible(event, this.visibility)) {
        visible.push(event);
      } else {
        hidden.push(event);
      }
    }
  }
  
  eventIsVisible(event, visibility) {
    if (visibility.trackid) {
      if (!visibility.trackid.has(event.trackid)) return false;
    }
    if (visibility.chid) {
      if (!visibility.chid.has(event.chid)) return false;
    }
    if (visibility.opcode) {
      if (!visibility.opcode.has(event.opcode)) return false;
    }
    if (visibility.event && visibility.event.length) {
      let ok = false;
      for (const filter of visibility.event) {
        if (filter.opcode !== event.opcode) continue;
        if ((typeof(filter.a) === "number") && (filter.a !== event.a)) ;
        else if ((typeof(filter.b) === "number") && (filter.b !== event.b)) ;
        else { ok = true; break; }
      }
      if (!ok) return false;
    }
    return true;
  }
}
