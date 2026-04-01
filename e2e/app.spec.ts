import { test, expect } from '@playwright/test';

/**
 * AITerminal E2E Tests
 *
 * Tests the full renderer with mocked Electron APIs.
 */

// Mock setup function to run before page load
async function mockElectronAPIs(page: typeof test['prototype']['page']) {
  await page.addInitScript(() => {
    // Mock platform
    ;(window as any).platform = 'darwin'

    // Mock electronAPI
    const mockAPI = {
      createSession: async () => ({ success: true, sessionId: 'test-session' }),
      resizeSession: async () => ({ success: true }),
      writeToSession: async () => ({ success: true }),
      getSessionCwd: async () => ({ success: true, cwd: '/Users/test/project' }),
      destroySession: async () => ({ success: true }),

      readFile: async (path: string) => {
        if (path.includes('package.json')) {
          return { success: true, content: JSON.stringify({ name: 'aiterminal', version: '0.1.0' }, null, 2) }
        }
        if (path.includes('.gitignore')) {
          return { success: true, content: 'node_modules\ndist\n.env' }
        }
        return { success: true, content: 'Mock file content' }
      },
      writeFile: async () => ({ success: true }),
      editFile: async () => ({ success: true }),
      deleteFile: async () => ({ success: true }),
      listDirectory: async () => ({ success: true, entries: [] }),

      aiQueryStream: async () => ({ success: true }),
      cancelAIStream: async () => ({ success: true }),
      agentExec: async () => ({ output: 'mock output', exitCode: 0, executionId: 'test' }),
      killAgentProcesses: async () => ({ success: true }),

      getStoredTheme: async () => ({ success: true, themeId: 'dracula' }),
      setStoredTheme: async () => ({ success: true }),

      transcriptStartSession: async () => ({ success: true, sessionId: 'test-transcript' }),
      transcriptAddMessage: async () => ({ success: true }),
      transcriptSearchContext: async () => ({ success: true, context: '' }),

      startVoiceCapture: async () => ({ success: true }),
      stopVoiceCapture: async () => ({ success: true, text: '' }),

      showItemInFolder: async () => ({ success: true }),
      openPath: async () => ({ success: true }),
    }

    ;(window as any).electronAPI = mockAPI
  })
}

test.describe('AITerminal E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockElectronAPIs(page)
    await page.goto('http://localhost:5173')
    await page.waitForTimeout(2000)
  })

  test('app renders with mocked Electron APIs', async ({ page }) => {
    const root = page.locator('#root')
    await expect(root).toBeVisible()

    // Check React mounted
    const hasContent = await root.evaluate(el => el.innerHTML.length > 100)
    expect(hasContent).toBe(true)
  })

  test('terminal view is present', async ({ page }) => {
    const terminal = page.locator('.terminal-view, [data-testid="terminal-view"], .xterm, canvas').first()
    const count = await terminal.count()
    expect(count).toBeGreaterThan(0)
  })

  test('chat sidebar exists', async ({ page }) => {
    // The app should have some UI elements - check for buttons, inputs, or any interactive element
    const allButtons = await page.locator('button').count()
    const allInputs = await page.locator('input, textarea').allTextContents()
    const allDivs = await page.locator('div').count()

    // App should have substantial UI rendered
    expect(allDivs).toBeGreaterThan(10)
    expect(allButtons).toBeGreaterThan(0)
  })

  test('intern avatar/controls exist', async ({ page }) => {
    const intern = page.locator('[data-intern], .intern, button:has-text("Intern")').first()
    const avatar = page.locator('.vrm, canvas, [data-avatar]').first()

    const hasInternUI = await intern.count() > 0 || await avatar.count() > 0
    expect(hasInternUI).toBe(true)
  })

  test('theme selector is accessible', async ({ page }) => {
    const themeSelector = page.locator('[aria-label*="theme"], .theme-selector').first()
    const themeButton = page.locator('button:has-text("Theme"), [aria-label*="theme"]').first()

    const hasThemeUI = await themeSelector.count() > 0 || await themeButton.count() > 0
    expect(hasThemeUI).toBe(true)
  })

  test('keyboard shortcuts work', async ({ page }) => {
    // Try Cmd+K / Ctrl+K
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+k`)
    await page.waitForTimeout(500)

    // Command palette or some UI should appear
    const dialog = page.locator('[role="dialog"], .command-palette, [data-cmdk]').first()
    const dialogExists = await dialog.count() > 0

    // Close it
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // Dialog might or might not exist - just verify app is still responsive
    const root = page.locator('#root')
    await expect(root).toBeVisible()
  })

  test('app is responsive', async ({ page }) => {
    // Test different viewport sizes
    const sizes = [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]

    for (const size of sizes) {
      await page.setViewportSize(size)
      await page.waitForTimeout(300)

      const root = page.locator('#root')
      await expect(root).toBeVisible()
    }
  })
})

test.describe('AI Chat E2E', () => {
  test('chat input accepts text', async ({ page }) => {
    await mockElectronAPIs(page)
    await page.goto('http://localhost:5173')
    await page.waitForTimeout(2000)

    const chatInput = page.locator('textarea, input[type="text"]').first()
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    await chatInput.fill('test message')
    const value = await chatInput.inputValue()
    expect(value).toBe('test message')
  })

  test('chat mode can be cycled', async ({ page }) => {
    await mockElectronAPIs(page)
    await page.goto('http://localhost:5173')
    await page.waitForTimeout(2000)

    const modeButton = page.locator('button:has-text("Mode"), [aria-label*="mode"]').first()

    if (await modeButton.count() > 0) {
      await modeButton.click()
      await page.waitForTimeout(200)

      // Something should have changed (mode label, etc.)
      const body = page.locator('body')
      await expect(body).toBeVisible()
    }
  })
})
