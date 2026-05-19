# Real-Time Cross-Flow Moderation

When an admin rejects a post, every viewer's feed should remove it
immediately — not on next refresh, not eventually. The cross-flow we
test against:

```
┌───────────────┐                                ┌───────────────┐
│ Admin (Tab A) │                                │ User (Tab B)  │
│ /allworld     │                                │ /feed         │
└──────┬────────┘                                └──────┬────────┘
       │                                                │
       │  PUT /admin/content/posts/:id/status           │
       │     { status: "rejected", reason }             │
       │ ────────────────────────────────────►          │
       │                                                │
       │  201 OK + audit log entry chained              │
       │ ◄────────────────────────────────────          │
       │                                                │
       │            Socket.IO emits 'post:hidden'        │
       │            to all connected clients             │
       │            ────────────────────────────►        │
       │                                                │
       │                                Redux slice removes
       │                                post.id from feed,
       │                                triggers re-render
       │                                                │
       │                                          User sees the
       │                                          post disappear
       │                                          within ~50ms
```

## What's in the snippet

The `emit-on-status-change.ts` file shows the API-side handler that
takes a status update, persists it, writes an audit-log entry, and
fans the change out over Socket.IO. Sanitized — auth middleware,
validation, and the audit-log call are stubbed.

The `client-listener.ts` file is the client-side hook that subscribes
to the relevant events and dispatches Redux actions to remove the post
from the feed cache.

## Why it's not just "the client polls"

Polling at 30-second intervals is the fallback, not the primary path.
The reasons:

1. **Moderator credibility.** If a moderator hides a hateful post and
   the original author sees it for another 30 seconds, that's 30 more
   screenshots in the wild. Real-time matters operationally.
2. **Cost at scale.** 100K users polling every 30s is 3,300 requests/s
   of pure "nothing changed". One Socket.IO connection per user that
   emits only on actual events is dramatically cheaper.
3. **Battery on mobile.** A polling SPA grills phone batteries. WebSockets
   stay open via the OS-level keepalive and are far cheaper.

## Failure modes we explicitly handle

| Failure | Response |
|---|---|
| Socket disconnect (network) | Auto-reconnect with exponential backoff (Socket.IO default), client refetches feed on reconnect |
| Socket message lost during reconnect | Reconnect handler triggers a feed refetch; missed `post:hidden` is reconciled |
| Server restart | Active connections re-handshake on next request, no manual intervention |
| User has the post detail page open | Detail subscription also receives `post:hidden`, shows "This post is no longer available" |
| Race: emit before commit | Emit is dispatched *after* the DB commit + audit-log entry, never before |

## What we explicitly don't do

- Push the entire post object on update. The event payload is just
  `{ postId, status }`. The client treats it as a hint to refetch /
  invalidate, not as the source of truth.
- Persist Socket.IO sessions to Redis. Connections are ephemeral; if
  the API restarts, clients reconnect. State of truth is always the DB.
- Try to deliver "exactly once". Idempotent client handlers + the
  `since=<timestamp>` reconcile query do the work.
