# Context Analyzer Hook

The `useContextAnalyzer` hook provides intelligent pattern detection for Claude Code logs, helping identify troubleshooting patterns, user confusion, and suggesting solutions.

## Overview

Analyzes Claude Code message logs to detect:
- **Error patterns**: Command failures, permission issues, syntax errors, etc.
- **Stuck detection**: Repeated errors indicating the user is stuck
- **Achievements**: Successful completions, passing tests, builds
- **Confusion topics**: Questions and areas where the user needs help
- **Contextual suggestions**: Actionable recommendations based on detected patterns
- **Sentiment analysis**: Overall mood of the session (positive/neutral/concerned)

## API

```typescript
interface AnalysisResult {
  hasErrors: boolean;
  errorPatterns: string[];
  isStuck: boolean;
  stuckSeverity: 'none' | 'stuck' | 'very_stuck';
  achievements: string[];
  confusionTopics: string[];
  suggestions: string[];
  sentiment: 'positive' | 'neutral' | 'concerned';
  confidence: number;
  messageCount: number;
  timeRange?: {
    start: number;
    end: number;
    durationMs: number;
  };
}

interface UseContextAnalyzerReturn {
  analyzeLog: (messages: ClaudeCodeMessage[]) => AnalysisResult;
  getLastAnalysis: () => AnalysisResult | null;
}
```

## Usage Example

```typescript
import { useContextAnalyzer } from './hooks/useContextAnalyzer';
import { useEffect, useState } from 'react';

function TroubleshootingView() {
  const { analyzeLog, getLastAnalysis } = useContextAnalyzer();
  const [logMessages, setLogMessages] = useState<ClaudeCodeMessage[]>([]);

  useEffect(() => {
    // Fetch Claude Code logs
    window.electronAPI.getClaudeCodeLog(100).then(({ messages }) => {
      if (messages) {
        setLogMessages(messages);
        const analysis = analyzeLog(messages);
        console.log('Analysis:', analysis);
      }
    });
  }, []);

  const analysis = getLastAnalysis();

  if (!analysis) return <div>Loading...</div>;

  return (
    <div>
      <h2>Session Analysis</h2>

      {/* Error Status */}
      {analysis.hasErrors && (
        <div className="alert alert-error">
          <h3>Errors Detected</h3>
          <ul>
            {analysis.errorPatterns.map((pattern) => (
              <li key={pattern}>{pattern}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stuck Status */}
      {analysis.isStuck && (
        <div className={`alert ${analysis.stuckSeverity === 'very_stuck' ? 'alert-critical' : 'alert-warning'}`}>
          <h3>User appears {analysis.stuckSeverity === 'very_stuck' ? 'very stuck' : 'stuck'}</h3>
          <p>Same error repeated multiple times</p>
        </div>
      )}

      {/* Achievements */}
      {analysis.achievements.length > 0 && (
        <div className="alert alert-success">
          <h3>Progress Made</h3>
          <ul>
            {analysis.achievements.map((achievement) => (
              <li key={achievement}>{achievement}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Confusion Topics */}
      {analysis.confusionTopics.length > 0 && (
        <div className="alert alert-info">
          <h3>Topics to Clarify</h3>
          <ul>
            {analysis.confusionTopics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {analysis.suggestions.length > 0 && (
        <div className="suggestions">
          <h3>Suggested Actions</h3>
          <ul>
            {analysis.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sentiment & Confidence */}
      <div className="meta">
        <p>Sentiment: {analysis.sentiment}</p>
        <p>Confidence: {Math.round(analysis.confidence * 100)}%</p>
        <p>Messages analyzed: {analysis.messageCount}</p>
        {analysis.timeRange && (
          <p>Duration: {Math.round(analysis.timeRange.durationMs / 1000)}s</p>
        )}
      </div>
    </div>
  );
}
```

## Detected Error Patterns

The hook detects these common error categories:

### Command Errors
- `command not found` - Suggests checking PATH, installing packages
- `permission denied` - Suggests sudo, checking ownership

### Code Errors
- `undefined is not a function` - Suggests checking imports, variable names
- `module not found` - Suggests npm install, checking import paths
- `syntax error` - Suggests checking brackets, quotes, keywords
- `type error` - Suggests reviewing TypeScript definitions

### Build/Test Errors
- `test failure` - Suggests reviewing test expectations
- `build error` - Suggests clearing cache, checking dependencies

### Network/Infrastructure
- `network error` - Suggests checking connection, server status
- `port in use` - Suggests killing process, using different port
- `out of memory` - Suggests increasing Node.js memory limit

### File System
- `file not found` - Suggests verifying paths, checking working directory

## Detected Achievements

Positive indicators:
- `tests passing` - ✓, passed, passing
- `fix applied` - fixed, resolved, patched
- `build successful` - built successfully, compilation complete
- `task completed` - completed, done, finished
- `deployment successful` - deployed, published

## Stuck Detection

- **Stuck**: Same error repeated 3-5 times consecutively
- **Very Stuck**: Same error repeated 6+ times consecutively

## Confusion Detection

Identifies topics the user is confused about:
- Questions: "What is X?", "How do I Y?", "Why does Z?"
- Help requests: "help", "stuck", "confused", "don't understand"
- Explanation requests: "explain", "clarify", "elaborate"

## Contextual Suggestions

The hook generates intelligent suggestions based on:
- **Error patterns**: Maps specific errors to relevant solutions
- **Tool usage**: Detects heavy bash usage, file reading patterns
- **Test activity**: Suggests verbose mode, test isolation
- **Build errors**: Suggests cache clearing, dependency checks
- **Repeated questions**: Suggests documentation review

## Confidence Score

Confidence (0-1) is calculated based on:
- Message count (more messages = higher confidence)
- Pattern detection (more patterns = higher confidence)

Low confidence (< 0.3) indicates insufficient data for reliable analysis.

## Integration with Log Watcher

For real-time analysis, combine with the log watcher:

```typescript
useEffect(() => {
  // Start watching Claude Code logs
  window.electronAPI.startClaudeCodeLogWatcher();

  const unsubscribe = window.electronAPI.onClaudeCodeLogUpdated(({ messages }) => {
    const analysis = analyzeLog(messages);
    setAnalysis(analysis);
  });

  return () => {
    unsubscribe();
    window.electronAPI.stopClaudeCodeLogWatcher();
  };
}, [analyzeLog]);
```

## Testing

Comprehensive test coverage in `useContextAnalyzer.test.ts`:
- 28 tests covering all detection patterns
- Edge cases: empty content, undefined timestamps, special characters
- Sentiment calculation accuracy
- Confidence scoring validation

Run tests:
```bash
npx vitest run src/renderer/hooks/useContextAnalyzer.test.ts
```
