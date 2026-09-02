# KIPA voice module

The module is intentionally isolated from Cinny's regular call UI. It is mounted
from `RoomInput` but the functional panel is loaded as a separate Vite chunk only
for an enabled KIPA room.

## Room activation

The PA bot sets this state event after creating the room:

```json
{
  "type": "io.kiconnect.kipa",
  "state_key": "",
  "content": {
    "enabled": true,
    "pa_user_id": "@pa-example:example.org",
    "protocol": 1
  }
}
```

Cinny additionally requires the configured user to be joined and its complete
Matrix user ID to start with `@pa-`. If `pa_user_id` is omitted, the first joined
`@pa-` member is selected.

## Call protocol

The browser uses the existing `matrix-js-sdk` one-to-one voice call. The KIPA
Matrix client must answer the standard Matrix VoIP events with its `aiortc`
peer:

- `m.call.invite`
- `m.call.answer`
- `m.call.candidates`
- `m.call.hangup`

No KIPA HTTP URL is configured in Cinny. Matrix carries signaling; WebRTC carries
the microphone and generated TTS audio tracks.
