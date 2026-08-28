export const LANGUAGES = [
  { id: 'plaintext', label: 'Plain text' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'bash', label: 'Bash / Shell' },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]['id'];

export function isLanguage(id: string): boolean {
  return LANGUAGES.some((l) => l.id === id);
}

/** Map our language ids to highlight.js grammar names. */
export function hljsLanguage(id: string): string | null {
  switch (id) {
    case 'plaintext':
      return null;
    case 'html':
      return 'xml';
    default:
      return id;
  }
}
