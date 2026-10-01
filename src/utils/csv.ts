export const CSV_DELIMITERS_TEMPLATE = [',', '\t', ';'] as const;

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
