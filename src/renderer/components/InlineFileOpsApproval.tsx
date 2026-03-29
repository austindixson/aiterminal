import React, { useState, useEffect } from 'react';
import type { FileOperation } from '../../types/agent';

interface InlineFileOpsApprovalProps {
  operations: ReadonlyArray<FileOperation>;
  onApprove: () => void;
  onReject: () => void;
}

const OP_ICONS: Record<string, string> = {
  create: '📄',
  edit: '✏️',
  delete: '🗑️',
  read: '📖',
};

const OP_COLORS: Record<string, string> = {
  create: '#50fa7b',
  edit: '#f1fa8c',
  delete: '#ff5555',
  read: '#8be9fd',
};

/**
 * Inline diff view for a single search/replace edit.
 */
const DiffBlock: React.FC<{ op: FileOperation; wide: boolean }> = ({ op, wide }) => {
  const searchLines = (op.searchText || '').split('\n');
  const replaceLines = (op.replaceText || '').split('\n');

  return (
    <div style={diffStyles.container}>
      <div style={diffStyles.header}>
        <span style={diffStyles.fileName}>{op.filePath}</span>
        <span style={diffStyles.lineCount}>
          -{searchLines.length} +{replaceLines.length}
        </span>
      </div>
      {wide ? (
        /* Split view — side by side when wide */
        <div style={{ display: 'flex', ...diffStyles.code }}>
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            {searchLines.map((line, i) => (
              <div key={`s-${i}`} style={diffStyles.removedLine}>
                <span style={diffStyles.linePrefix}>-</span>
                <span>{line || ' '}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            {replaceLines.map((line, i) => (
              <div key={`r-${i}`} style={diffStyles.addedLine}>
                <span style={diffStyles.linePrefix}>+</span>
                <span>{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Unified view — stacked when narrow */
        <div style={diffStyles.code}>
          {searchLines.map((line, i) => (
            <div key={`s-${i}`} style={diffStyles.removedLine}>
              <span style={diffStyles.linePrefix}>-</span>
              <span>{line || ' '}</span>
            </div>
          ))}
          {replaceLines.map((line, i) => (
            <div key={`r-${i}`} style={diffStyles.addedLine}>
              <span style={diffStyles.linePrefix}>+</span>
              <span>{line || ' '}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Full file create/replace preview.
 */
const FilePreviewBlock: React.FC<{ op: FileOperation }> = ({ op }) => {
  const [expanded, setExpanded] = useState(false);
  const content = op.content || '';
  const lines = content.split('\n');
  const previewLines = expanded ? lines : lines.slice(0, 8);
  const hasMore = lines.length > 8;

  return (
    <div style={diffStyles.container}>
      <div style={diffStyles.header}>
        <span style={{ ...diffStyles.fileName, color: op.type === 'create' ? '#50fa7b' : '#f1fa8c' }}>
          {op.type === 'create' ? '+ ' : ''}{op.filePath}
        </span>
        <span style={diffStyles.lineCount}>{lines.length} lines</span>
      </div>
      <div style={diffStyles.code}>
        {previewLines.map((line, i) => (
          <div key={i} style={op.type === 'create' ? diffStyles.addedLine : diffStyles.neutralLine}>
            <span style={diffStyles.lineNum}>{i + 1}</span>
            <span>{line || ' '}</span>
          </div>
        ))}
        {hasMore && !expanded && (
          <div
            style={diffStyles.expandBtn}
            onClick={() => setExpanded(true)}
          >
            ▼ Show {lines.length - 8} more lines
          </div>
        )}
      </div>
    </div>
  );
};

export const InlineFileOpsApproval: React.FC<InlineFileOpsApprovalProps> = ({
  operations,
  onApprove,
  onReject,
}) => {
  // Hoist responsive state — single listener shared by all DiffBlocks
  const [wide, setWide] = useState(window.innerWidth > 800);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWide(window.innerWidth > 800), 100);
    };
    window.addEventListener('resize', handler);
    return () => { window.removeEventListener('resize', handler); clearTimeout(timer); };
  }, []);

  if (operations.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Proposed changes</span>
        <span style={styles.count}>{operations.length}</span>
      </div>

      {/* Diff/preview for each operation */}
      <div style={styles.list}>
        {operations.map((op) => (
          <div key={op.id}>
            {op.type === 'edit' && op.searchText != null ? (
              <DiffBlock op={op} wide={wide} />
            ) : op.type === 'create' || (op.type === 'edit' && op.content) ? (
              <FilePreviewBlock op={op} />
            ) : (
              <div style={styles.item}>
                <span style={{ ...styles.badge, color: OP_COLORS[op.type] || '#f8f8f2' }}>
                  {OP_ICONS[op.type] || '📁'} {op.type}
                </span>
                <span style={styles.path}>{op.filePath}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        <button onClick={onApprove} style={styles.approveBtn}>
          Apply All
        </button>
        <button onClick={onReject} style={styles.rejectBtn}>
          Dismiss
        </button>
      </div>
    </div>
  );
};

const diffStyles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(20, 20, 30, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '6px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  fileName: {
    fontFamily: "'SF Mono', 'Cascadia Code', monospace",
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: 600,
  },
  lineCount: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  code: {
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace",
    fontSize: '12px',
    lineHeight: '1.5',
    overflow: 'auto',
    maxHeight: '300px',
  },
  removedLine: {
    display: 'flex',
    background: 'rgba(255, 50, 50, 0.1)',
    color: '#ff6b6b',
    padding: '0 10px',
    whiteSpace: 'pre' as const,
  },
  addedLine: {
    display: 'flex',
    background: 'rgba(80, 250, 123, 0.1)',
    color: '#50fa7b',
    padding: '0 10px',
    whiteSpace: 'pre' as const,
  },
  neutralLine: {
    display: 'flex',
    padding: '0 10px',
    whiteSpace: 'pre' as const,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  linePrefix: {
    width: '16px',
    flexShrink: 0,
    fontWeight: 700,
    userSelect: 'none' as const,
  },
  lineNum: {
    width: '30px',
    flexShrink: 0,
    textAlign: 'right' as const,
    paddingRight: '8px',
    color: 'rgba(255, 255, 255, 0.2)',
    userSelect: 'none' as const,
  },
  expandBtn: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'rgba(99, 102, 241, 0.8)',
    cursor: 'pointer',
    textAlign: 'center' as const,
    background: 'rgba(99, 102, 241, 0.05)',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(40, 42, 54, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    margin: '8px 0',
    backdropFilter: 'blur(10px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  count: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#bd93f9',
    background: 'rgba(189, 147, 249, 0.15)',
    padding: '1px 6px',
    borderRadius: '10px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginBottom: '10px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    padding: '4px 0',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    minWidth: '60px',
  },
  path: {
    fontFamily: "'SF Mono', 'Cascadia Code', monospace",
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  approveBtn: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(80, 250, 123, 0.3)',
    background: 'rgba(80, 250, 123, 0.15)',
    color: '#50fa7b',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  rejectBtn: {
    flex: 1,
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
