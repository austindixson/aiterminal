/**
 * TroubleshootPopup — wrapper component that adds a "Troubleshoot" pop-out
 * button and manages the expanded TroubleshootView lifecycle.
 *
 * When clicked, it expands the bottom panel to show the TroubleshootView
 * with the initial AI response already loaded as context.
 */

import { useCallback } from 'react'
import type { FC } from 'react'
import type { AIResponse } from '@/ai/types'
import type { SessionContext } from '@/types/troubleshoot'
import { ContextCollector } from '@/troubleshoot/context-collector'
import { useTroubleshoot } from '@/renderer/hooks/useTroubleshoot'
import { TroubleshootView } from './TroubleshootView'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TroubleshootPopupProps {
  readonly initialResponse: AIResponse | null
  readonly sessionContext: SessionContext
  readonly onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TroubleshootPopup: FC<TroubleshootPopupProps> = ({
  initialResponse,
  sessionContext,
  onClose,
}) => {
  // Build a collector pre-loaded with the session context entries
  const collector = ContextCollector.fromEntries(
    sessionContext.recentEntries,
    sessionContext.sessionStartTime,
  )

  const { state, sendMessage, switchTab, open, close } =
    useTroubleshoot(collector)

  const handleOpen = useCallback(() => {
    const initialContent = initialResponse?.content ?? undefined
    open(initialContent)
  }, [initialResponse, open])

  const handleClose = useCallback(() => {
    close()
    onClose()
  }, [close, onClose])

  return (
    <>
      {!state.isOpen && (
        <button
          type="button"
          className="troubleshoot-popup__trigger"
          onClick={handleOpen}
          aria-label="Troubleshoot"
        >
          Troubleshoot
        </button>
      )}
      <TroubleshootView
        state={{
          ...state,
          sessionContext,
        }}
        onSendMessage={sendMessage}
        onSwitchTab={switchTab}
        onClose={handleClose}
      />
    </>
  )
}
