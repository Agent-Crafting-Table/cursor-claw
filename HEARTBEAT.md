# HEARTBEAT.md - Proactive Checks

_This file defines what your agent checks during scheduled heartbeat runs._
_Keep it empty (or commented out) to skip proactive checks entirely._
_Add tasks below when you want the agent to check something periodically._

---

## Example Tasks

Uncomment and adapt what's useful:

```
# - Check for unread messages that need a response
# - Review today's calendar and flag conflicts
# - Check if any cron jobs have failed recently
# - Look for overdue tasks in your task system
# - Post a morning brief to Discord
```

## Quiet Hours

```
# Don't trigger heartbeat checks between:
# Start: 22:00
# End:   08:00
# Timezone: UTC
```

---

_Heartbeat runs on a schedule defined in your cron jobs. This file tells the agent what to actually do when it wakes up._
