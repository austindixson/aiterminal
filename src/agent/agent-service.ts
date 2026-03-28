/**
 * Agent Service — core logic for parsing AI agent responses,
 * building context-rich prompts, creating plans, and applying
 * file operations via IPC.
 *
 * All functions are pure where possible; side effects are isolated
 * to `applyOperation` which delegates to Electron IPC.
 */

import type { FileOperation, AgentPlan } from '@/types/agent'

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let operationCounter = 0

function generateId(prefix: string): string {
  operationCounter += 1
  return `${prefix}-${Date.now()}-${operationCounter}`
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_CONTENT_LENGTH = 5000
const TRUNCATION_MARKER = '\n... [truncated]'

// ---------------------------------------------------------------------------
// parseAgentResponse
// ---------------------------------------------------------------------------

/**
 * Extracts file operations from an AI response that uses tagged format:
 *   [FILE:path]content[/FILE]   → create operation
 *   [EDIT:path]content[/EDIT]   → edit operation
 *   [DELETE:path]               → delete operation
 *
 * Returns an array of FileOperation objects, all with status 'pending'.
 * Malformed tags are skipped gracefully.
 */
export function parseAgentResponse(
  aiContent: string,
): ReadonlyArray<FileOperation> {
  const operations: FileOperation[] = []

  // Parse [FILE:path]...[/FILE] tags
  const fileRegex = /\[FILE:([^\]]+)\]([\s\S]*?)\[\/FILE\]/g
  let match: RegExpExecArray | null = null

  while ((match = fileRegex.exec(aiContent)) !== null) {
    const filePath = match[1].trim()
    const content = match[2].trim()

    if (filePath.length === 0) continue

    operations.push({
      id: generateId('op'),
      type: 'create',
      filePath,
      content,
      description: `Create ${filePath}`,
      status: 'pending',
    })
  }

  // Parse [EDIT:path]...[/EDIT] tags
  const editRegex = /\[EDIT:([^\]]+)\]([\s\S]*?)\[\/EDIT\]/g

  while ((match = editRegex.exec(aiContent)) !== null) {
    const filePath = match[1].trim()
    const content = match[2].trim()

    if (filePath.length === 0) continue

    operations.push({
      id: generateId('op'),
      type: 'edit',
      filePath,
      content,
      description: `Edit ${filePath}`,
      status: 'pending',
    })
  }

  // Parse [READ:path] tags (AI requesting to read a file)
  const readRegex = /\[READ:([^\]]+)\]/g

  while ((match = readRegex.exec(aiContent)) !== null) {
    const filePath = match[1].trim()
    if (filePath.length === 0) continue

    operations.push({
      id: generateId('op'),
      type: 'read',
      filePath,
      description: `Read ${filePath}`,
      status: 'pending',
    })
  }

  // Parse [DELETE:path] tags
  const deleteRegex = /\[DELETE:([^\]]+)\]/g

  while ((match = deleteRegex.exec(aiContent)) !== null) {
    const filePath = match[1].trim()

    if (filePath.length === 0) continue

    // Skip if this delete path was already captured as part of a FILE/EDIT closing tag
    // (e.g., [DELETE:path] should not match [/DELETE] style closings)
    operations.push({
      id: generateId('op'),
      type: 'delete',
      filePath,
      description: `Delete ${filePath}`,
      status: 'pending',
    })
  }

  // Sort operations by their position in the original text for stable ordering
  return sortByPosition(aiContent, operations)
}

/**
 * Sorts operations by their first appearance position in the AI content.
 */
function sortByPosition(
  aiContent: string,
  operations: readonly FileOperation[],
): ReadonlyArray<FileOperation> {
  const positionMap = new Map<string, number>()

  for (const op of operations) {
    const tag =
      op.type === 'delete'
        ? `[DELETE:${op.filePath}]`
        : op.type === 'edit'
          ? `[EDIT:${op.filePath}]`
          : `[FILE:${op.filePath}]`
    const pos = aiContent.indexOf(tag)
    positionMap.set(op.id, pos >= 0 ? pos : Infinity)
  }

  return [...operations].sort(
    (a, b) => (positionMap.get(a.id) ?? Infinity) - (positionMap.get(b.id) ?? Infinity),
  )
}

// ---------------------------------------------------------------------------
// buildAgentPrompt
// ---------------------------------------------------------------------------

/**
 * Builds a context-rich prompt for the AI agent that includes:
 * - System instructions for the [FILE]/[EDIT]/[DELETE] tag format
 * - Provided file contents (truncated if too large)
 * - The user's request
 */
export function buildAgentPrompt(
  userRequest: string,
  fileContents: ReadonlyArray<{ readonly path: string; readonly content: string }>,
): string {
  const instructions = `You are an AI coding agent. When you need to create, edit, or delete files, use these tags:

To create a new file:
[FILE:path/to/file.ts]
file content here
[/FILE]

To edit an existing file (provide full new content):
[EDIT:path/to/file.ts]
updated file content here
[/EDIT]

To delete a file:
[DELETE:path/to/file.ts]

Always use these tags so the system can parse your response into file operations.`

  const fileSection =
    fileContents.length > 0
      ? fileContents
          .map((f) => {
            const truncated =
              f.content.length > MAX_FILE_CONTENT_LENGTH
                ? f.content.slice(0, MAX_FILE_CONTENT_LENGTH) + TRUNCATION_MARKER
                : f.content
            return `--- ${f.path} ---\n${truncated}`
          })
          .join('\n\n')
      : ''

  const parts = [instructions]

  if (fileSection.length > 0) {
    parts.push(`\nRelevant files:\n${fileSection}`)
  }

  parts.push(`\nUser request: ${userRequest}`)

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// createPlan
// ---------------------------------------------------------------------------

/**
 * Creates an immutable AgentPlan from a description and list of operations.
 * All operations are ensured to have 'pending' status.
 * The plan starts with 'awaiting_approval' status.
 */
export function createPlan(
  description: string,
  operations: ReadonlyArray<FileOperation>,
): AgentPlan {
  const pendingOps = operations.map((op) => ({
    ...op,
    status: 'pending' as const,
  }))

  return {
    id: generateId('plan'),
    description,
    operations: pendingOps,
    status: 'awaiting_approval',
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// applyOperation
// ---------------------------------------------------------------------------

/**
 * Applies a single file operation via the Electron IPC bridge.
 *
 * - create/edit: calls writeFile(path, content)
 * - delete: calls deleteFile(path)
 *
 * Returns a result object with success/error status.
 */
export async function applyOperation(
  op: FileOperation,
): Promise<{ readonly success: boolean; readonly error?: string }> {
  try {
    const api = window.electronAPI

    switch (op.type) {
      case 'create':
      case 'edit':
        await api.writeFile(op.filePath, op.content ?? '')
        return { success: true }

      case 'delete':
        await api.deleteFile(op.filePath)
        return { success: true }

      case 'read': {
        const result = await api.readFile(op.filePath)
        if (result.error) return { success: false, error: result.error }
        return { success: true }
      }

      default:
        return { success: false, error: `Unknown operation type: ${(op as FileOperation).type}` }
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error applying operation'
    return { success: false, error: message }
  }
}
