# Midevil

MIDI file editor that runs in a web browser.

## TODO

- [ ] Undo.
- [ ] Copy/paste.
- [ ] Encode to base64 or JSON (or other things?) and display for the user to copy out.
- [ ] Open/Save via HTTP GET/PUT.
- [ ] EventsModal: Rebuild form when opcode changes.
- [ ] EventsModal: Serial payloads.
- [x] ToolbarUi: Pretty up.
- [x] Spacebar to play/pause. EditorUi manages this, but it requires input focus.
- - I don't think we want to override spacebar in all cases, right? There are modals and buttons and whatnot.
- - ...playing around a little, i guess this is ok. you can click in the chart to focus it, not a big deal.
- [ ] Auto-scroll to playhead? At least make it an option.
- [x] Prevent losing place when changing zoom. (anchor to center of view?) And make the zoom scales more sensible.
- [ ] Validate and auto-repair EOT markers at encode
- [ ] VisibilityUi: Comment on track and channel options, is there anything to see for each?
- [ ] EventsModal: Display time in MM:SS
- [ ] Find a more elegant way to show Meta, Control, Aftertouch. Don't just print in the chart like notes.
