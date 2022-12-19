# Midevil

MIDI file editor that runs in a web browser.

## TODO

- [x] Song playback.
- [x] MIDI input.
- [ ] Undo.
- [ ] Copy/paste.
- [ ] Encode to base64 or JSON (or other things?) and display for the user to copy out.
- [ ] Open/Save via HTTP GET/PUT.
- [ ] EventsModal: Rebuild form when opcode changes.
- [ ] EventsModal: Serial payloads.
- [ ] ToolbarUi: Pretty up.
- [ ] Spacebar to play/pause. EditorUi manages this, but it requires input focus.
- - I don't think we want to override spacebar in all cases, right? There are modals and buttons and whatnot.
- [x] Loop.
- [x] Recording.
- [ ] Auto-scroll to playhead? At least make it an option.
- [ ] Prevent losing place when changing zoom. (anchor to center of view?)
- [x] Metronome.
- [ ] Validate and auto-repair EOT markers at encode
- [ ] VisibilityUi: Comment on track and channel options, is there anything to see for each?
