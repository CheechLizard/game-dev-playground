# Live game inspection over MCP

The game serves a read-only MCP endpoint at **http://127.0.0.1:49321/mcp**.
It starts with the application, stays available while the game or editor is
paused, and stops when the application closes. It reads the active world and
weapon graphs from memory, including edits that have not been saved.

In **F1 → Debug → Live inspection**, use **Allow local inspection** to switch
it off, **Inspection port** to change its port, and **Check inspection
connection** to display its address or a startup error. If another instance
already owns the port, the second instance does not take it over. Change its
port or toggle inspection off/on after closing the first instance.

Capture runs keep the server disabled so an automated screenshot cannot
accidentally become the instance an assistant inspects.

## Connect

Run the game from the review checkout, currently
`~/Dev/game-dev-playground/main`, then register the endpoint:

```sh
codex mcp add game-dev-playground --url http://127.0.0.1:49321/mcp
codex mcp get game-dev-playground
```

Reload the MCP connection in the client after adding it. Codex documents the
shared connection settings in its [MCP guide](https://developers.openai.com/codex/mcp).
Other MCP clients can use the same Streamable HTTP URL.

For a direct read without waiting for a client to reload its tool list:

```sh
python3 tools/inspect.py config
python3 tools/inspect.py config --prefix audio.
python3 tools/inspect.py runtime
python3 tools/inspect.py events --limit 100
python3 tools/inspect.py events --after 120 --limit 100
```

`--url` selects a different local instance. `--expect-source /absolute/checkout`
rejects a response from a different build. This client uses Python's standard
library and makes normal MCP requests; it does not read saved configuration as
a substitute for live state.

## Available reads

| Tool | Result |
|---|---|
| `get_active_config` | Current global settings, profile name, mode, pause state, selected module, and every equipped weapon graph. Optional `prefix` filters global setting keys only. |
| `get_runtime_state` | Battery charge/capacity/refill, hot/cold triggers, strike counters and runtime generations, live colliders, player position/aim, and up to 100 targets. |
| `get_recent_events` | Ordered strike and sound events, with optional `after` cursor and `limit` (1–500, default 100). |

Every result identifies the serving process with `instance.source`, `session`,
`startedAt` and `url`. Check these and `world.mode` before attributing data to
the user's running setup. The configuration explicitly labels weapon graphs
as `live_memory`; it does not require the bench's Save button.

The same data is available through the MCP resources
`playground://active-config`, `playground://runtime` and `playground://events`.

## Reading the event history

Each run retains its latest 2,048 events. Entries have a monotonic `id`, run
`time`, and, where applicable, `strike`, `group`, `striker`, `sequence`, weapon
`generation`, age and remaining charge. A rebuild starts a new runtime
generation. The run's `epoch` changes on restart; reset `after` when it changes.
`dropped` reports when a requested cursor predates retained history. `hasMore`
and `cursor` support pagination without duplicates.

| Event | Meaning |
|---|---|
| `strike_start` | A funded collider was created. This alone does not mean it survived until rendering. |
| `hit` | A v2 strike registered contact. Payload damage may still be unaffordable. |
| `damage` | Funded damage reached combat feedback; includes payload, target position and whether it killed the target. |
| `complete` | The v2 strike group completed, with reason and hit count. `miss: true` means zero hits, making it eligible for a Miss trigger. |
| `strike_end` | An individual v2 collider ended; reason includes energy, duration, release, or rebuild. |
| `sound_queued` | A sound was requested. `causeEvent` links to its originating start or damage event. |
| `sound_played` | The audio adapter started a source. Includes sound type and volume; `queuedEvent` links to its queue entry. It does not prove the physical audio device was audible. |
| `sound_suppressed` | The request was not played; reason distinguishes target/sound cooldown, voice/queue limits, disabled audio, mute, reset or inactive playback. |
| `sound_stopped` | A sustained hum was stopped; includes its contributor strike IDs and reason. |
| `weapon_rebuild` / `feedback_reset` | Boundaries caused by re-arming, resetting or switching a weapon. |

In particular, a collider can start, exhaust and complete with zero hits before
the next rendered frame, while its already queued **shot** sound still plays.
That history contains `strike_start → sound_queued → complete → strike_end →
sound_played` with matching strike IDs. The sound's cause remains
`strike_start`; a Miss trigger did not itself make that sound. This server adds
observability without changing those sound or energy rules. Full lifecycle
tracing is for v2 strikes; legacy attacks also expose launch and damage audio.

## Implementation and verification

The server uses LÖVE's bundled LuaSocket, with nonblocking reads/writes and
bounded clients, request sizes, work per update, and three-second connection
deadlines. It binds IPv4 loopback only and checks Host and Origin headers.
It offers no setting writes, game controls, arbitrary code execution or file
access. Other processes on this computer can read the endpoint while enabled.

The implementation supports the MCP 2025-03-26, 2025-06-18 and 2025-11-25
protocol versions with stateless JSON responses over
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
GET returns 405 because server-initiated SSE is not offered. Clients send JSON
POSTs with Content-Length; chunked request bodies are rejected. Notifications
receive 202. All tools declare read-only annotations.

`luajit tools/test.lua` covers the protocol, local-origin restrictions, split
network reads/writes, client timeouts, bounded event cursors, unsaved graph
reads, and same-tick beam exhaustion correlated with actual audio playback.
Use `tools/inspect.py` against a running LÖVE instance to verify the full path.
