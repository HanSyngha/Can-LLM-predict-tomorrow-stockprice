/**
 * Lightweight markdown to HTML renderer.
 * Supports: headers, bold, italic, lists, inline code, tables, horizontal rules, paragraphs.
 */
export function renderMarkdown(text: string): string {
  // First, extract and render tables
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Detect markdown table: line with pipes, followed by separator line with dashes
    if (
      i + 1 < lines.length &&
      lines[i]!.includes('|') &&
      /^\|?[\s-:|]+\|/.test(lines[i + 1]!)
    ) {
      // Parse table
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      result.push(renderTable(tableLines));
      continue;
    }
    result.push(lines[i]!);
    i++;
  }

  return result.join('\n')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="my-3 border-slate-200 dark:border-slate-700"/>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 class="font-bold text-sm mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold text-base mt-4 mb-2">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold text-lg mt-4 mb-2">$1</h2>')
    // Inline formatting
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm">$1</code>')
    // Paragraphs (double newline) - but NOT after block elements
    .replace(/\n\n/g, '</p><p class="mt-2">')
    // Single newlines within paragraphs only (skip after block-level elements)
    .replace(/(?<!<\/(?:table|h[2-4]|li|hr|p)>)\n(?!<)/g, '<br/>');
}

function renderTable(lines: string[]): string {
  const parseRow = (line: string): string[] =>
    line.split('|').map(cell => cell.trim()).filter((_, i, arr) => i > 0 && i < arr.length - (line.endsWith('|') ? 1 : 0));

  if (lines.length < 2) return lines.join('\n');

  const headers = parseRow(lines[0]!);
  // Skip separator line (index 1)
  const bodyRows = lines.slice(2).map(parseRow);

  let html = '<div class="overflow-x-auto my-2"><table class="w-full text-xs border-collapse">';
  html += '<thead><tr>';
  for (const h of headers) {
    html += `<th class="px-2 py-1 text-left font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">${h}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    html += '<tr class="border-b border-slate-100 dark:border-slate-800">';
    for (let c = 0; c < headers.length; c++) {
      html += `<td class="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap">${row[c] ?? ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}
