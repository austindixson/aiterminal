import { describe, it, expect } from 'vitest'
import { detectLanguage, tokenize, highlightLine } from './syntax-highlighter'

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe('detectLanguage', () => {
  it('maps .ts to typescript', () => {
    expect(detectLanguage('index.ts')).toBe('typescript')
  })

  it('maps .tsx to tsx', () => {
    expect(detectLanguage('App.tsx')).toBe('tsx')
  })

  it('maps .js to javascript', () => {
    expect(detectLanguage('main.js')).toBe('javascript')
  })

  it('maps .jsx to jsx', () => {
    expect(detectLanguage('App.jsx')).toBe('jsx')
  })

  it('maps .py to python', () => {
    expect(detectLanguage('script.py')).toBe('python')
  })

  it('maps .rs to rust', () => {
    expect(detectLanguage('main.rs')).toBe('rust')
  })

  it('maps .go to go', () => {
    expect(detectLanguage('main.go')).toBe('go')
  })

  it('maps .json to json', () => {
    expect(detectLanguage('package.json')).toBe('json')
  })

  it('maps .css to css', () => {
    expect(detectLanguage('styles.css')).toBe('css')
  })

  it('maps .md to markdown', () => {
    expect(detectLanguage('README.md')).toBe('markdown')
  })

  it('maps .sh to bash', () => {
    expect(detectLanguage('deploy.sh')).toBe('bash')
  })

  it('maps .html to html', () => {
    expect(detectLanguage('index.html')).toBe('html')
  })

  it('returns plain for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBe('plain')
  })

  it('returns plain for files with no extension', () => {
    expect(detectLanguage('Makefile')).toBe('plain')
  })

  it('is case-insensitive for extensions', () => {
    expect(detectLanguage('README.MD')).toBe('markdown')
    expect(detectLanguage('script.PY')).toBe('python')
  })
})

// ---------------------------------------------------------------------------
// tokenize — TypeScript
// ---------------------------------------------------------------------------

describe('tokenize — TypeScript keywords', () => {
  it('tokenizes const as a keyword', () => {
    const tokens = tokenize('const x = 1', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('const'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes let as a keyword', () => {
    const tokens = tokenize('let y = 2', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('let'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes function as a keyword', () => {
    const tokens = tokenize('function foo() {}', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('function'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes if as a keyword', () => {
    const tokens = tokenize('if (true) {}', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('if'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes return as a keyword', () => {
    const tokens = tokenize('return value', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('return'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes import as a keyword', () => {
    const tokens = tokenize('import { foo } from "bar"', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('import'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes export as a keyword', () => {
    const tokens = tokenize('export default App', 'typescript')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('export'))
    expect(keywordToken).toBeDefined()
  })
})

describe('tokenize — TypeScript strings', () => {
  it('tokenizes double-quoted strings', () => {
    const tokens = tokenize('const x = "hello"', 'typescript')
    const stringToken = tokens.find(t => t.type === 'string' && t.value.includes('hello'))
    expect(stringToken).toBeDefined()
  })

  it('tokenizes single-quoted strings', () => {
    const tokens = tokenize("const x = 'hello'", 'typescript')
    const stringToken = tokens.find(t => t.type === 'string' && t.value.includes('hello'))
    expect(stringToken).toBeDefined()
  })

  it('tokenizes template literal strings', () => {
    const tokens = tokenize('const x = `hello ${name}`', 'typescript')
    const stringToken = tokens.find(t => t.type === 'string' && t.value.includes('hello'))
    expect(stringToken).toBeDefined()
  })
})

describe('tokenize — TypeScript comments', () => {
  it('tokenizes single-line comments', () => {
    const tokens = tokenize('// this is a comment', 'typescript')
    const commentToken = tokens.find(t => t.type === 'comment')
    expect(commentToken).toBeDefined()
    expect(commentToken!.value).toContain('this is a comment')
  })

  it('tokenizes multi-line comment opening', () => {
    const tokens = tokenize('/* multi-line comment */', 'typescript')
    const commentToken = tokens.find(t => t.type === 'comment')
    expect(commentToken).toBeDefined()
    expect(commentToken!.value).toContain('multi-line comment')
  })
})

describe('tokenize — TypeScript numbers', () => {
  it('tokenizes integer numbers', () => {
    const tokens = tokenize('const x = 42', 'typescript')
    const numberToken = tokens.find(t => t.type === 'number' && t.value.includes('42'))
    expect(numberToken).toBeDefined()
  })

  it('tokenizes decimal numbers', () => {
    const tokens = tokenize('const pi = 3.14', 'typescript')
    const numberToken = tokens.find(t => t.type === 'number' && t.value.includes('3.14'))
    expect(numberToken).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// tokenize — JSON
// ---------------------------------------------------------------------------

describe('tokenize — JSON', () => {
  it('tokenizes JSON string values', () => {
    const tokens = tokenize('"name": "hello"', 'json')
    const stringTokens = tokens.filter(t => t.type === 'string')
    expect(stringTokens.length).toBeGreaterThanOrEqual(1)
  })

  it('tokenizes JSON numbers', () => {
    const tokens = tokenize('"count": 42', 'json')
    const numberToken = tokens.find(t => t.type === 'number' && t.value.includes('42'))
    expect(numberToken).toBeDefined()
  })

  it('tokenizes JSON booleans as keywords', () => {
    const tokens = tokenize('"active": true', 'json')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('true'))
    expect(keywordToken).toBeDefined()
  })

  it('tokenizes JSON null as keyword', () => {
    const tokens = tokenize('"value": null', 'json')
    const keywordToken = tokens.find(t => t.type === 'keyword' && t.value.includes('null'))
    expect(keywordToken).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// tokenize — returns SyntaxToken array
// ---------------------------------------------------------------------------

describe('tokenize — return type', () => {
  it('returns an array of SyntaxToken objects', () => {
    const tokens = tokenize('const x = 1', 'typescript')
    expect(Array.isArray(tokens)).toBe(true)
    expect(tokens.length).toBeGreaterThan(0)

    for (const token of tokens) {
      expect(token).toHaveProperty('type')
      expect(token).toHaveProperty('value')
      expect(typeof token.type).toBe('string')
      expect(typeof token.value).toBe('string')
    }
  })

  it('reconstructed values cover the entire input', () => {
    const input = 'const x = 42'
    const tokens = tokenize(input, 'typescript')
    const reconstructed = tokens.map(t => t.value).join('')
    expect(reconstructed).toBe(input)
  })

  it('returns a single plain token for plain language', () => {
    const tokens = tokenize('just some text', 'plain')
    expect(tokens).toEqual([{ type: 'plain', value: 'just some text' }])
  })
})

// ---------------------------------------------------------------------------
// highlightLine
// ---------------------------------------------------------------------------

describe('highlightLine', () => {
  it('returns a single plain token for an empty line', () => {
    const tokens = highlightLine('', 'typescript')
    expect(tokens).toEqual([{ type: 'plain', value: '' }])
  })

  it('returns tokenized output for mixed content', () => {
    const tokens = highlightLine('const x = 42', 'typescript')
    expect(tokens.length).toBeGreaterThan(1)
    // Should have keyword, plain, and number tokens
    const types = new Set(tokens.map(t => t.type))
    expect(types.has('keyword')).toBe(true)
    expect(types.has('number')).toBe(true)
  })

  it('preserves token order matching left-to-right in the line', () => {
    const tokens = highlightLine('const x = "hello"', 'typescript')
    const values = tokens.map(t => t.value).join('')
    expect(values).toBe('const x = "hello"')
  })

  it('returns plain tokens for plain language', () => {
    const tokens = highlightLine('no syntax here', 'plain')
    expect(tokens).toEqual([{ type: 'plain', value: 'no syntax here' }])
  })
})
