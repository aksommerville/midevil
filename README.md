# Midevil

MIDI file editor that runs in a web browser.

## TODO

- [x] Undo.
- [ ] Copy/paste.
- [ ] Encode to base64 or JSON (or other things?) and display for the user to copy out.
- [ ] Open/Save via HTTP GET/PUT.
- [x] EventsModal: Rebuild form when opcode changes.
- [ ] EventsModal: Serial payloads.
- [x] ToolbarUi: Pretty up.
- [x] Spacebar to play/pause. EditorUi manages this, but it requires input focus.
- - I don't think we want to override spacebar in all cases, right? There are modals and buttons and whatnot.
- - ...playing around a little, i guess this is ok. you can click in the chart to focus it, not a big deal.
- [ ] Auto-scroll to playhead? At least make it an option.
- [x] Prevent losing place when changing zoom. (anchor to center of view?) And make the zoom scales more sensible.
- [x] Validate and auto-repair EOT markers at encode
- [ ] VisibilityUi: Comment on track and channel options, is there anything to see for each?
- [x] EventsModal: Display time in MM:SS
- [ ] Find a more elegant way to show Meta, Control, Aftertouch. Don't just print in the chart like notes.
- [ ] Track list in visibility popup needs to update when you add a track.
- [x] Loop range allows negative; it should clamp at zero.
- [x] Special helper modal for Mynth-specific channel setup.
- [ ] Keyboard modifiers mostly don't work on MacOS (Chrome at least), they get interpretted as right click.
- [ ] "now playing" notes can be occluded by "background" notes, unexpectedly
- [x] Opened song after recording two tracks, and the second track timing was all screwed up. like it was losing one tick per bar or something.
- - !!! This is definitely happening, and not just on new tracks !!!
- - i think this might be caused by:
- [x] Does recording capture fractional times? It should quantize to 1 tick. 
- [ ] Playback of fresh notes cuts off while recording
- - Must be the song player notices the thing we've added to its event list and plays that (in addition to the live playthrough)
