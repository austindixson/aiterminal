# 🎯 How to Use Agent Mode (Quick Start)

## Step 1: Find the Toggle
Look at the **top of the AITerminal window** (titlebar).

You should see something like:
```
AITerminal  [🎭 Agent Mode] [📁] [💬] [📍] [🎨]
```

## Step 2: Enable Agent Mode
Click **"Agent Mode"** toggle - it will turn blue when enabled

## Step 3: Show Your Anime Girl
Click **"🎭 Show Avatar"** button that appears

A 3D avatar will load below (takes 2-3 seconds):
- **Mei (blue)** - Dev intern
- **Sora (green)** - Research intern
- **Hana (orange)** - Content intern

## Step 4: Try a Task!

In the terminal, type a natural language task:

**For Mei (Dev):**
```
Add a fibonacci function to my code
```

**For Sora (Research):**
```
What are the best React hooks patterns?
```

**For Hana (Content):**
```
Write a tweet announcing a new feature
```

**For Handoff (Research → Dev):**
```
Research how to implement dark mode, then write the code
```

---

## What You'll See

1. **Task routes** to correct intern automatically
2. **Avatar expression changes** based on what intern is doing
3. **Real-time output** streams in the terminal
4. **Everything is saved** to transcript database automatically

---

## Tips

- **Avatar takes 2-3 seconds** to load first time (loading from CDN)
- **Expressions change** as the intern works (thinking → talking → happy)
- **Try multiple tasks** to see different interns
- **Toggle avatar off** if it's using too much memory

---

## Troubleshooting

**Don't see Agent Mode?**
- Press `Cmd+R` to reload the app
- Check for errors in DevTools: `Cmd+Option+I`

**Avatar not loading?**
- Check internet connection (VRM loads from CDN)
- Try toggling off/on
- Check console for WebGL errors

**Nothing happens when you type a task?**
- Make sure Agent Mode is enabled (toggle is blue)
- Try a different phrasing
- Check terminal is focused

---

## Status Indicators

When Agent Mode is running:
- **● Working** - Intern is actively working
- **○ Idle** - Ready for new task

The avatar will show:
- **🤔 Ohh** - Thinking/working
- **😮 Aah** - Generating output
- **😊 Happy** - Task complete!

---

**🎉 Ready to try! Enable Agent Mode and type a task!**
