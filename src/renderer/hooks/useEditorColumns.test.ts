/**
 * Tests for useEditorColumns hook
 */

import { renderHook, act } from '@testing-library/react'
import { useEditorColumns } from './useEditorColumns'
import type { FileTab, EditorColumn } from '@/types/editor-columns'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
})

describe('useEditorColumns', () => {
  beforeEach(() => {
    localStorage.clear()
    // Note: Module-level counters (columnCounter, tabCounter) can't be reset
    // in Vitest without vi.resetModules(), but this doesn't affect test correctness
  })

  describe('initialization', () => {
    it('should create single default column on mount', () => {
      const { result } = renderHook(() => useEditorColumns())

      expect(result.current.state.columns).toHaveLength(1)
      expect(result.current.state.activeColumnId).toBeTruthy()
    })

    it('should load persisted layout if available', () => {
      const persistedLayout = {
        columns: [
          {
            id: 'col-1',
            tabs: [
              {
                id: 'tab-1',
                filePath: '/test/file.ts',
                title: 'file.ts',
                isActive: true,
                isModified: false,
              },
            ],
            activeTabId: 'tab-1',
            splitRatio: null,
          },
        ],
        activeColumnId: 'col-1',
      }

      localStorage.setItem('aiterminal-editor-layout', JSON.stringify(persistedLayout))

      const { result } = renderHook(() => useEditorColumns())

      expect(result.current.state.columns).toHaveLength(1)
      expect(result.current.state.columns[0].tabs).toHaveLength(1)
      expect(result.current.state.columns[0].tabs[0].filePath).toBe('/test/file.ts')
    })
  })

  describe('addColumn', () => {
    it('should add new column', () => {
      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.addColumn()
      })

      expect(result.current.state.columns).toHaveLength(2)
      expect(result.current.state.activeColumnId).toBeTruthy()
    })

    it('should not exceed maximum columns', () => {
      const { result } = renderHook(() => useEditorColumns())

      // Add up to MAX_COLUMNS
      act(() => {
        result.current.addColumn()
        result.current.addColumn()
        result.current.addColumn() // Now at 4
      })

      expect(result.current.state.columns).toHaveLength(4)

      // Try to add 5th column
      act(() => {
        result.current.addColumn()
      })

      expect(result.current.state.columns).toHaveLength(4)
    })
  })

  describe('removeColumn', () => {
    it('should remove column', () => {
      const { result } = renderHook(() => useEditorColumns())

      // Add second column
      act(() => {
        result.current.addColumn()
      })

      const columnIdToRemove = result.current.state.columns[1].id

      act(() => {
        result.current.removeColumn(columnIdToRemove)
      })

      expect(result.current.state.columns).toHaveLength(1)
    })

    it('should not remove last column', () => {
      const { result } = renderHook(() => useEditorColumns())

      const initialColumnId = result.current.state.activeColumnId

      act(() => {
        result.current.removeColumn(initialColumnId!)
      })

      expect(result.current.state.columns).toHaveLength(1)
    })

    it('should activate another column when removing active', () => {
      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.addColumn()
      })

      const activeId = result.current.state.activeColumnId

      act(() => {
        result.current.removeColumn(activeId!)
      })

      expect(result.current.state.activeColumnId).toBeTruthy()
    })
  })

  describe('addTab', () => {
    it('should add tab to column', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      expect(column?.tabs).toHaveLength(1)
      expect(column?.tabs[0].filePath).toBe('/test/file.ts')
      expect(column?.tabs[0].title).toBe('file.ts')
      expect(column?.tabs[0].isActive).toBe(true)
    })

    it('should activate existing tab if file already open', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      expect(column?.tabs).toHaveLength(1)
    })

    it('should detect language from file extension', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/script.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      expect(column?.tabs[0].language).toBe('typescript')
    })
  })

  describe('closeTab', () => {
    it('should close tab', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file1.ts')
        result.current.addTab(columnId, '/test/file2.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const tabId = column?.tabs[0].id

      act(() => {
        result.current.closeTab(columnId, tabId!)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.tabs).toHaveLength(1)
    })

    it('should activate another tab when closing active', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file1.ts')
        result.current.addTab(columnId, '/test/file2.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const activeTabId = column?.activeTabId

      act(() => {
        result.current.closeTab(columnId, activeTabId!)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.activeTabId).toBeTruthy()
    })

    it('should set activeTabId to null when closing last tab', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const tabId = column?.tabs[0].id

      act(() => {
        result.current.closeTab(columnId, tabId!)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.tabs).toHaveLength(0)
      expect(updatedColumn?.activeTabId).toBeNull()
    })
  })

  describe('setActiveTab', () => {
    it('should set active tab in column', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file1.ts')
        result.current.addTab(columnId, '/test/file2.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const firstTabId = column?.tabs[0].id

      act(() => {
        result.current.setActiveTab(columnId, firstTabId!)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.tabs[0].isActive).toBe(true)
      expect(updatedColumn?.activeTabId).toBe(firstTabId)
    })
  })

  describe('moveTab', () => {
    it('should move tab between columns', () => {
      const { result } = renderHook(() => useEditorColumns())

      // Create two columns
      act(() => {
        result.current.addColumn()
      })

      const firstColumnId = result.current.state.columns[0].id
      const secondColumnId = result.current.state.columns[1].id

      // Add tab to first column
      act(() => {
        result.current.addTab(firstColumnId, '/test/file.ts')
      })

      const firstColumn = result.current.state.columns.find((c) => c.id === firstColumnId)
      const tabId = firstColumn?.tabs[0].id

      // Move to second column
      act(() => {
        result.current.moveTab(tabId!, firstColumnId, secondColumnId)
      })

      const updatedFirstColumn = result.current.state.columns.find((c) => c.id === firstColumnId)
      const updatedSecondColumn = result.current.state.columns.find((c) => c.id === secondColumnId)

      expect(updatedFirstColumn?.tabs).toHaveLength(0)
      expect(updatedSecondColumn?.tabs).toHaveLength(1)
      expect(updatedSecondColumn?.tabs[0].filePath).toBe('/test/file.ts')
    })

    it('should not move tab to same column', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const tabId = column?.tabs[0].id

      act(() => {
        result.current.moveTab(tabId!, columnId, columnId)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.tabs).toHaveLength(1)
    })
  })

  describe('setActiveColumn', () => {
    it('should set active column', () => {
      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.addColumn()
      })

      const firstColumnId = result.current.state.columns[0].id
      const secondColumnId = result.current.state.columns[1].id

      expect(result.current.state.activeColumnId).toBe(secondColumnId)

      act(() => {
        result.current.setActiveColumn(firstColumnId)
      })

      expect(result.current.state.activeColumnId).toBe(firstColumnId)
    })
  })

  describe('setSplitRatio', () => {
    it('should set column split ratio', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.setSplitRatio(columnId, 0.6)
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      expect(column?.splitRatio).toBe(0.6)
    })

    it('should reject invalid split ratio', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.setSplitRatio(columnId, 1.5)
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      expect(column?.splitRatio).toBeNull()
    })
  })

  describe('setTabModified', () => {
    it('should set tab modified state', () => {
      const { result } = renderHook(() => useEditorColumns())
      const columnId = result.current.state.columns[0].id

      act(() => {
        result.current.addTab(columnId, '/test/file.ts')
      })

      const column = result.current.state.columns.find((c) => c.id === columnId)
      const tabId = column?.tabs[0].id

      act(() => {
        result.current.setTabModified(columnId, tabId!, true)
      })

      const updatedColumn = result.current.state.columns.find((c) => c.id === columnId)
      expect(updatedColumn?.tabs[0].isModified).toBe(true)
    })
  })

  describe('layout persistence', () => {
    it('should save layout to localStorage', () => {
      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.addColumn()
      })

      act(() => {
        result.current.saveLayout()
      })

      const stored = localStorage.getItem('aiterminal-editor-layout')
      expect(stored).toBeTruthy()

      const layout = JSON.parse(stored!)
      expect(layout.columns).toHaveLength(2)
    })

    it('should load layout from localStorage', () => {
      const persistedLayout = {
        columns: [
          {
            id: 'col-1',
            tabs: [
              {
                id: 'tab-1',
                filePath: '/test/file.ts',
                title: 'file.ts',
                isActive: true,
                isModified: false,
              },
            ],
            activeTabId: 'tab-1',
            splitRatio: null,
          },
        ],
        activeColumnId: 'col-1',
      }

      localStorage.setItem('aiterminal-editor-layout', JSON.stringify(persistedLayout))

      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.loadLayout()
      })

      expect(result.current.state.columns).toHaveLength(1)
      expect(result.current.state.columns[0].tabs[0].filePath).toBe('/test/file.ts')
    })

    it('should clear layout from localStorage', () => {
      localStorage.setItem('aiterminal-editor-layout', 'some-data')

      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.clearLayout()
      })

      expect(localStorage.getItem('aiterminal-editor-layout')).toBeNull()
    })
  })

  describe('keyboard shortcuts', () => {
    it('should add column on Cmd+\\', () => {
      const { result } = renderHook(() => useEditorColumns())

      const event = new KeyboardEvent('keydown', {
        key: '\\',
        metaKey: true,
      })

      act(() => {
        window.dispatchEvent(event)
      })

      expect(result.current.state.columns).toHaveLength(2)
    })

    it('should remove active column on Cmd+Shift+W', () => {
      const { result } = renderHook(() => useEditorColumns())

      // Add second column
      act(() => {
        result.current.addColumn()
      })

      const event = new KeyboardEvent('keydown', {
        key: 'w',
        metaKey: true,
        shiftKey: true,
      })

      act(() => {
        window.dispatchEvent(event)
      })

      expect(result.current.state.columns).toHaveLength(1)
    })

    it('should focus column on Cmd+1/2/3/4', () => {
      const { result } = renderHook(() => useEditorColumns())

      act(() => {
        result.current.addColumn()
      })

      const firstColumnId = result.current.state.columns[0].id

      const event = new KeyboardEvent('keydown', {
        key: '1',
        metaKey: true,
      })

      act(() => {
        window.dispatchEvent(event)
      })

      expect(result.current.state.activeColumnId).toBe(firstColumnId)
    })
  })
})
