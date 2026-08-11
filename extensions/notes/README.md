# Notes for bb

Notes is a fast capture and retrieval system inside bb.

Each note gets a local day. A note can also link to a bb thread and project.
Use tags for topic groups. Use full-text search to find text across all notes.

## Main paths

- Use the Quick note card on the bb home page.
- Open Notes from the bb sidebar.
- Open Thread notes from a thread header or side panel.
- Use Save as note on a message or selected message text.
- Use `bb note add "text" --tag idea` from a terminal.

## Command examples

```sh
bb note add "Check the retry state machine" --tag follow-up
bb note today
bb note search "retry state"
bb note list --day 2026-08-11
bb note list --thread thr_123
bb note show note_123
bb note archive note_123
```

The command links a new note to the current bb thread and project when that
context exists.

## Storage

The plugin stores notes in its bb plugin database. The data remains after a
reload or an app restart.
