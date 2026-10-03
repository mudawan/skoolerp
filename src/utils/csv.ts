export const parseCsvLine = (
  line: string,
  delimiters: readonly string[] = [','],
): string[] => {
  const clean = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line;
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"' && current.trim() === '') {
      inQuotes = true;
    } else if (delimiters.includes(char)) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

export const CSV_DELIMITER_CANDIDATES = [',', ';', '\t'] as const;

/** Strips a leading UTF-8 byte-order mark, if present. */
export const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * Detects the delimiter used by a CSV header/first line: comma, semicolon or tab,
 * counting only characters outside double quotes. The most frequent wins;
 * ties and lines with none fall back to comma.
 */
export const detectCsvDelimiter = (firstLine: string): string => {
  const line = stripBom(firstLine);
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && ch in counts) {
      counts[ch]++;
    }
  }
  let best = ',';
  let bestCount = counts[','];
  for (const d of [';', '\t']) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return best;
};

export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
