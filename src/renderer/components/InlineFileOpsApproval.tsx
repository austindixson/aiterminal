import React from 'react';
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

export const InlineFileOpsApproval: React.FC<InlineFileOpsApprovalProps> = ({
  operations,
  onApprove,
  onReject,
}) => {
  if (operations.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Proposed file operations</span>
        <span style={styles.count}>{operations.length}</span>
      </div>
      <div style={styles.list}>
        {operations.map((op) => (
          <div key={op.id} style={styles.item}>
            <span style={{ ...styles.badge, color: OP_COLORS[op.type] || '#f8f8f2' }}>
              {OP_ICONS[op.type] || '📁'} {op.type}
            </span>
            <span style={styles.path}>{op.filePath}</span>
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
