/* UndoService.js
 * Maintains old copies of an entire Song, to undo to.
 * For now I'm doing just a single level of undo.
 */
 
export class UndoService {
  static getDependencies() {
    return [];
  }
  constructor() {
    this.song = null;
  }
  
  push(song) {
    this.song = song.copy();
  }
  
  /* Returns and removes the existing undo state.
   * Optionally sets your song as the new undo state, so the user can toggle between two states.
   */
  pop(song) {
    const ret = this.song;
    this.song = song ? song.copy() : null;
    return ret;
  }
}

UndoService.singleton = true;
