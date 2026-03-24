export interface FileEntry {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
  readonly isHidden: boolean
  readonly size: number
  readonly extension: string | null
  readonly children?: ReadonlyArray<FileEntry>
}

export interface FileTreeState {
  readonly cwd: string
  readonly entries: ReadonlyArray<FileEntry>
  readonly expandedPaths: ReadonlySet<string>
  readonly selectedPath: string | null
  readonly isVisible: boolean
  readonly showHidden: boolean
}
