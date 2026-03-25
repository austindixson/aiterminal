# 🧪 AITerminal Agent Loop - Testing Guide

## Status: ✅ READY TO TEST

The development server is running! You should see an Electron window open with the AITerminal interface.

---

## 🎯 Quick Test Checklist

### 1. Verify UI Loads
- ✅ Electron window opens
- ✅ Terminal visible with shell prompt
- ✅ No console errors (press Cmd+Option+I to check)

### 2. Test Agent Mode Toggle
1. Look for "Agent Mode" toggle near the top
2. Click to enable agent mode
3. You should see:
   - Toggle turns blue
   - Status shows "Ready"
   - Avatar toggle button appears (🎭)
4. Click "🎭 Show Avatar" button
5. You should see a 3D avatar panel (may take a few seconds to load)

### 3. Test Agent Execution

**Option A: Simple Development Task**
```
Add a console.log statement to test file creation
```
Expected behavior:
- Task routes to **Mei** (dev intern)
- Avatar shows "thinking" expression (🤔)
- Terminal shows Mei spawning coding agent
- Messages stream in real-time
- Avatar shows "happy" when complete (😊)

**Option B: Research Task**
```
Research the latest React hooks best practices
```
Expected behavior:
- Task routes to **Sora** (research intern)
- Avatar shows Sora's green theme
- Web search results display
- Possibly shows Context7 documentation lookups

**Option C: Content Task**
```
Write a tweet announcing a new feature launch
```
Expected behavior:
- Task routes to **Hana** (content intern)
- Avatar shows Hana's orange theme
- Generates tweet with hashtags
- Shows content optimization steps

### 4. Test Transcript Recording

After running any agent:
1. Open DevTools console (Cmd+Option+I)
2. Run this command:
```javascript
// Check transcript stats
window.electronAPI.transcriptGetStats().then(console.log);
```

Expected output:
```javascript
{
  success: true,
  stats: {
    sessions: 1,
    messages: 5,
    events: 12,
    sizeBytes: 4096
  }
}
```

3. Search the transcript:
```javascript
window.electronAPI.transcriptSearch("console").then(console.log);
```

### 5. Test Avatar Expressions

Watch the avatar as the agent works:
- **Idle**: Neutral face, gentle breathing
- **Working**: "Ohh" expression (thinking face 🤔)
- **Output**: "Aah" expression (talking 😮)
- **Success**: Happy expression (😊)
- **Error**: Sad or angry expression 😢😠

Try different tasks and watch the expressions change!

### 6. Test Handoffs (Advanced)

Try a task that requires both research AND implementation:
```
Research how to implement dark mode toggle, then write the code
```

Expected behavior:
1. Starts with **Sora** (research)
2. Avatar shows Sora
3. After research completes, shows "handoff" event
4. Switches to **Mei** (implementation)
5. Avatar changes to Mei's blue theme
6. Continues with code generation

---

## 🐛 Known Limitations (During Testing)

1. **VRM Models**: Using public sample models
   - Mei, Sora, Hana all use same model for now
   - Custom models can be added later

2. **LLM Integration**: Hana (content) uses placeholder
   - Returns template responses instead of real LLM
   - Can integrate OpenRouter later for real content

3. **Quality Gates**: Not yet implemented
   - Phase 4 feature (optional enhancement)

4. **Web Search**: Sora uses basic implementation
   - Full MCP web search integration needed

---

## 📊 Test Commands for Console

```javascript
// ============ AGENT STATUS ============
// Check agent status
window.electronAPI.agentStatus().then(console.log);

// ============ TRANSCRIPT TESTS ============
// Get database stats
window.electronAPI.transcriptGetStats().then(console.log);

// Search transcripts
window.electronAPI.transcriptSearch("test").then(console.log);

// Get recent sessions
window.electronAPI.transcriptGetRecentSessions(10).then(console.log);

// Get specific session (after running an agent)
window.electronAPI.transcriptGetSession("session-id").then(console.log);

// ============ AVATAR TESTING ============
// Toggle avatar visibility
// (Use the 🎭 button in UI)

// ============ THEME TESTING ============
// List available themes
window.electronAPI.getThemes().then(console.log);

// Change theme
window.electronAPI.setTheme("tokyo-night");
```

---

## 🎭 Avatar Expression Map

| Event | Expression | Scene |
|-------|-----------|-------|
| Idle | 😐 Neutral + breathing | Waiting for work |
| Task starts | 😐 Neutral | Ready |
| Tool executing | 🤔 Ohh (thinking) | Working hard |
| Generating output | 😮 Aah (talking) | Producing results |
| Task completes | 😊 Happy | Success! |
| Error occurs | 😢 Sad / 😠 Angry | Something failed |
| Handoff | 😮 Surprised | Switching interns |

---

## 🔍 Debugging

**If agent doesn't start:**
1. Check Agent Mode is enabled
2. Check console for errors (Cmd+Option+I)
3. Verify OPENROUTER_API_KEY is set in `.env`

**If avatar doesn't load:**
1. Check browser console for WebGL errors
2. Try toggling avatar off/on
3. Check internet connection (VRM loads from CDN)

**If transcripts don't record:**
1. Check if `transcripts.db` file is created
2. Look for database errors in console
3. Try running `transcript:vacuum` via console

---

## 📈 What to Look For

✅ **Success Indicators:**
- Agent routes to correct intern (Mei/Sora/Hana)
- Avatar expressions match events
- Events stream in real-time
- Transcripts are searchable
- UI remains responsive
- No console errors

⚠️ **Expected Behaviors:**
- First agent run may be slower (VRM loading)
- Avatar takes 2-3 seconds to load initially
- Some placeholder outputs (Hana's content)
- Database grows with each run

---

## 🚀 After Testing

**Want to customize?**
1. **Add your VRM models**: Edit `src/renderer/components/InternAvatar.tsx`
2. **Change expressions**: Modify `EVENT_TO_EXPRESSION` mapping
3. **Add more tools**: Edit intern implementations in `src/agent-loop/interns/`

**Want production features?**
1. Implement Phase 4 (quality gates)
2. Add real LLM to Hana
3. Integrate full web search for Sora
4. Add voice output with Kokoro TTS

---

**Ready to test! 🎉**

The AITerminal window should be open. Start by enabling Agent Mode and try a simple task!
