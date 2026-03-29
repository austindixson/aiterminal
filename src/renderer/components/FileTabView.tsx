import { useState, useRef, useEffect, useCallback } from 'react';
import type { FC } from 'react';

interface FileTabViewProps {
  filePath: string;
  content: string;
  language: string | null;
  isActive?: boolean;
  onSave?: (filePath: string, content: string) => void;
}

/**
 * Editable code editor rendered inside a terminal tab slot.
 * Textarea with synced line numbers, Cmd+S save, and modified indicator.
 */
export const FileTabView: FC<FileTabViewProps> = ({ filePath, content, language, isActive = true, onSave }) => {
  const [value, setValue] = useState(content);
  const [modified, setModified] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Reset when file changes
  useEffect(() => {
    setValue(content);
    setModified(false);
  }, [content, filePath]);

  const lineCount = value.split('\n').length;

  // Sync scroll between textarea and line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    setModified(true);
    setSaved(false);
  };

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(filePath, value);
      setModified(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [onSave, filePath, value]);

  // Cmd+S to save — only when this tab is active
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isActive]);

  // Handle Tab key for indentation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = value.substring(0, start) + '  ' + value.substring(end);
      setValue(newVal);
      setModified(true);
      // Restore cursor position
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#1a1a2e',
      color: '#e0e0e0',
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: '13px',
      overflow: 'hidden',
    }}>
      {/* File header */}
      <div style={{
        padding: '6px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <span style={{ opacity: 0.5, fontSize: '12px' }}>📄</span>
        <span style={{ fontSize: '12px', opacity: 0.7 }}>{filePath}</span>
        {modified && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#f59e0b', flexShrink: 0,
          }} title="Unsaved changes" />
        )}
        {saved && (
          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>Saved</span>
        )}
        {language && (
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '4px',
            background: 'rgba(99,102,241,0.2)',
            color: 'rgba(99,102,241,0.9)',
            fontWeight: 600,
          }}>
            {language}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '10px', opacity: 0.4 }}>
          {lineCount} lines
        </span>
        {onSave && (
          <button
            onClick={handleSave}
            disabled={!modified}
            style={{
              background: modified ? 'rgba(99,102,241,0.3)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: modified ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: '10px',
              padding: '2px 8px',
              cursor: modified ? 'pointer' : 'default',
            }}
            title="Save (Cmd+S)"
          >
            Save
          </button>
        )}
      </div>

      {/* Editor area: line numbers + textarea */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          style={{
            width: '50px',
            flexShrink: 0,
            overflow: 'hidden',
            padding: '8px 0',
            textAlign: 'right',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '13px',
            lineHeight: '1.5',
            userSelect: 'none',
            background: 'rgba(0,0,0,0.15)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ padding: '0 10px 0 0', height: '19.5px' }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Editable textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            color: '#e0e0e0',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: '13px',
            lineHeight: '1.5',
            padding: '8px 14px',
            tabSize: 2,
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflow: 'auto',
          }}
        />
      </div>
    </div>
  );
};
