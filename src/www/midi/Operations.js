/* Operations.js
 * Enumeration of actions we can take on a Song, and alternate views we can show.
 */
 
export class Operations {
  static getDependencies() {
    return [];
  }
  constructor() {
  }
  
  /* [{label, name}...] for content that should go in the toolbar menu.
   */
  listOperationsForDisplay() {
    return [
      { label: "New Song", name: "newSong" },
      { label: "Channel Headers", name: "channelHeaders" },
      { label: "Mynth Channel Headers", name: "mynthChannelHeaders" },
      { label: "Events", name: "events" },
      { label: "Quantize Time", name: "quantizeTime" },
      { label: "Division", name: "division" },
      { label: "Tempo", name: "tempo" },
      { label: "Zero Time", name: "zeroTime" },
    ];
  }
}

Operations.singleton = true;

