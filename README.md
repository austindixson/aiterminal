# AITerminal

> AI-powered terminal built with Electron, React, and xterm.js

AITerminal is a modern terminal emulator that seamlessly integrates AI assistance into your workflow. It combines the power of a full-featured terminal with intelligent agent capabilities, voice interaction, and 3D VRM avatars.

## ✨ Features

- **Full Terminal Emulator** - Powered by xterm.js with PTY sessions
- **AI-Native Chat** - OpenRouter integration with multiple model support
- **Agent Loops** - Autonomous task execution with tool calling
- **Voice Interaction** - ElevenLabs TTS with VRM avatar lip-sync
- **3D VRM Avatars** - Interactive character companions (Sora, Mei, Hana)
- **Multi-Session** - Parallel terminal tabs with independent contexts
- **File Tree** - Built-in project navigation
- **Theme System** - 5 built-in terminal themes (Dracula, Gruvbox, Nord, etc.)
- **Markdown Rendering** - Rich formatted AI responses
- **Diff Editor** - Visual file comparison and editing

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Build for distribution
npm run build:electron
```

## 📁 Project Structure

```
aiterminal/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   ├── renderer/       # React UI (Vite + xterm.js)
│   ├── ai/             # OpenRouter client & streaming
│   ├── shell/          # NL/shell routing logic
│   ├── themes/         # Terminal theme definitions
│   ├── file-tree/      # Directory traversal
│   ├── integrations/   # Ecosystem bridges (lossless, dietmcp, etc.)
│   ├── types/          # Shared TypeScript types
│   └── test/           # Vitest setup
├── e2e/                # Playwright end-to-end tests
└── tests/              # Rust integration tests (daemon)
```

## 🎨 Key Technologies

| Layer | Technology |
|-------|-----------|
| **Desktop Framework** | Electron 34 |
| **UI Framework** | React 18 |
| **Build Tool** | Vite 6 |
| **Terminal** | xterm.js + node-pty |
| **3D Graphics** | Three.js + @pixiv/three-vrm |
| **AI Backend** | OpenRouter API |
| **Voice** | ElevenLabs TTS |
| **Database** | better-sqlite3 |
| **Testing** | Vitest + Playwright |

## 🔧 Configuration

Create a `.env` file:

```bash
# Required
OPENROUTER_API_KEY=your_key_here

# Optional (enables features)
AITERMINAL_LOSSLESS_ROOT=/path/to/lossless-claude
AITERMINAL_DIETMCP_BIN=/path/to/dietmcp
AITERMINAL_KOKORO=1  # Enable Kokoro TTS
```

## 🧪 Testing

```bash
# Unit tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# E2E tests (requires dev server running)
npm run test:e2e
```

## 📚 Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Ecosystem Integrations](./docs/ECOSYSTEM.md)
- [Agent Loop System](./docs/AGENT_LOOP.md)
- [VRM Avatar System](./docs/VRM_AVATARS.md)
- [Contributing Guide](./docs/CONTRIBUTING.md)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Attributions

AITerminal incorporates open-source software from many excellent projects. See [ATTRIBUTION.md](./ATTRIBUTION.md) for complete acknowledgments.

---

**Built with** ❤️ **by the AITerminal team**

Special thanks to:
- [Cursor](https://cursor.sh/) - AI-first code editor inspiration
- [Warp](https://www.warp.dev/) - Modern terminal UX
- [Claude Code](https://claude.ai/code) - Agentic workflows
- [VSCode](https://code.visualstudio.com/) - Electron architecture patterns
