const normalizeNewlines = (text) => text.replace(/\r\n?/g, '\n');

const structuredValuePattern = /(?:https?:\/\/|www\.)[^\s<>"']+|[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+|\b\d+(?:[.,]\d+)+\b|\b[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+\b/giu;

const findStructuredValueRanges = (text) => [...text.matchAll(structuredValuePattern)]
  .map((match) => {
    const start = match.index;
    let end = start + match[0].length;

    if (/^(?:https?:\/\/|www\.)/iu.test(match[0])) {
      const trailingPunctuation = match[0].match(/[.,;:!?]+$/u)?.[0];
      if (trailingPunctuation) end -= trailingPunctuation.length;
    }

    return { start, end };
  })
  .filter(({ start, end }) => end > start);

export const transforms = {
  spaces: (text) => text.replace(/[\t ]+/g, ' '),

  edges: (text) => text.replace(/^[\t ]+|[\t ]+$/gm, ''),

  upper: (text) => text.toLocaleUpperCase(),

  lower: (text) => text.toLocaleLowerCase(),

  sentence: (text) => {
    let startsSentence = true;
    const protectedRanges = findStructuredValueRanges(text);
    let rangeIndex = 0;
    let offset = 0;
    let result = '';

    for (const character of text) {
      while (protectedRanges[rangeIndex] && offset >= protectedRanges[rangeIndex].end) {
        rangeIndex += 1;
      }

      const range = protectedRanges[rangeIndex];
      const insideStructuredValue = range && offset >= range.start && offset < range.end;

      if (insideStructuredValue) {
        if (offset === range.start && startsSentence && /\p{L}/u.test(text.slice(range.start, range.end))) {
          startsSentence = false;
        }
        result += character;
        offset += character.length;
        continue;
      }

      if (startsSentence && /\p{L}/u.test(character)) {
        startsSentence = false;
        result += character.toLocaleUpperCase();
      } else {
        if (/[.!?]/u.test(character)) startsSentence = true;
        result += character;
      }

      offset += character.length;
    }

    return result;
  },

  punctuationBefore: (text) => text.replace(/[\t ]+([.,;:!?])/g, '$1'),

  punctuationAfter: (text) => text.replace(/,[\t ]*(?=\S)/g, ', '),

  lineOne: (text) => {
    const lines = normalizeNewlines(text).split('\n');
    const result = [];
    let emptyRun = 0;

    lines.forEach((line) => {
      if (line.trim() === '') {
        emptyRun += 1;
        if (emptyRun <= 2) result.push(line);
      } else {
        emptyRun = 0;
        result.push(line);
      }
    });

    return result.join('\n');
  },

  lineX: (text) => normalizeNewlines(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n'),

  inline: (text) => normalizeNewlines(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' '),

  inlineComma: (text) => {
    const lines = normalizeNewlines(text)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return lines
      .map((line, index) => (index < lines.length - 1 && !line.endsWith(',') ? `${line},` : line))
      .join(' ');
  },

  sunoClean: (text) => text.replace(/\[([^\]\r\n:]+):[^\]\r\n]*\]/g, (_, tag) => `[${tag.trim()}]`),

  sunoSpace: (text) => {
    const lines = normalizeNewlines(text).split('\n');
    const isTag = (line) => /^\s*\[[^\]\r\n]+\]\s*$/.test(line);
    const result = [];

    lines.forEach((line, index) => {
      if (!isTag(line)) {
        result.push(line);
        return;
      }

      if (result.length && result[result.length - 1].trim() !== '') result.push('');
      result.push(line);
      if (index < lines.length - 1 && lines[index + 1].trim() !== '') result.push('');
    });

    return result.join('\n');
  },

  sunoUpper: (text) => normalizeNewlines(text)
    .split('\n')
    .map((line) => {
      if (/^\s*\[[^\]\r\n]+\]\s*$/.test(line)) return line;
      return line.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
    })
    .join('\n'),

  sunoLyrics: (text) => normalizeNewlines(text)
    .split('\n')
    .map((line) => line.replace(/\s*\[[^\]\r\n]*\]\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n'),

  sunoStructure: (text) => (text.match(/\[[^\]\r\n]+\]/g) || []).join('\n'),

  sunoTrim: (text) => normalizeNewlines(text)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n'),
};

export const commandGroups = [
  {
    id: 'cleanup',
    label: 'Cleanup',
    commands: [
      { id: 'spaces', label: 'Spaces', description: 'Лишние пробелы и табы → один пробел' },
      { id: 'edges', label: 'Edges', description: 'Убрать пробелы по краям строк' },
      { id: 'upper', label: 'Upper', description: 'Весь текст в ВЕРХНЕМ регистре' },
      { id: 'lower', label: 'Lower', description: 'Весь текст в нижнем регистре' },
      { id: 'sentence', label: 'Sentence', description: 'Заглавная буква в начале предложений' },
      { id: 'punctuationBefore', label: ',Space', description: 'Убрать пробел перед пунктуацией' },
      { id: 'punctuationAfter', label: 'Space,', description: 'Добавить пробел после запятой' },
    ],
  },
  {
    id: 'format',
    label: 'Format',
    commands: [
      { id: 'lineOne', label: 'Line 1', description: 'Оставить максимум две пустые строки' },
      { id: 'lineX', label: 'Line X', description: 'Удалить все пустые строки' },
      { id: 'inline', label: 'Inline', description: 'Собрать строки через пробел' },
      { id: 'inlineComma', label: 'Inline ,', description: 'Собрать строки через запятую' },
    ],
  },
  {
    id: 'suno',
    label: 'Suno',
    commands: [
      { id: 'sunoClean', label: 'Suno Clean', description: 'Очистить уточнения внутри тегов' },
      { id: 'sunoSpace', label: 'Suno Space', description: 'Пустая строка вокруг каждого тега' },
      { id: 'sunoUpper', label: 'Suno Upper', description: 'Заглавная буква в начале строк' },
      { id: 'sunoLyrics', label: 'Suno Lyrics', description: 'Оставить только текст лирики' },
      { id: 'sunoStructure', label: 'Suno Structure', description: 'Оставить только теги структуры' },
      { id: 'sunoTrim', label: 'Suno Trim', description: 'Удалить все пустые строки' },
    ],
  },
];

export const commandById = Object.fromEntries(
  commandGroups.flatMap((group) => group.commands).map((command) => [command.id, command]),
);

export const applyCommand = (id, text) => transforms[id]?.(text) ?? text;

export const applyChain = (ids, text) => ids.reduce(
  (currentText, commandId) => applyCommand(commandId, currentText),
  text,
);

export const symbolTokens = [
  '.', ',', ';', ':', '!', '?', '/', '|', '—', '-', "'", '"', '[', ']', '(', ')', '*', '#', '@', '%', '^', '~', '\\', '_', '>',
  '##', '**', '__', '--', '//', '[[', ']]', '((', '))', '::', '!!', '??', "''", '""',
  '###', '***', '---', '...', '"""', "'''", '///',
  '####', '****', '----',
];

const tokenOrder = [...symbolTokens].sort((a, b) => b.length - a.length);

export const tokenizeSymbols = (text) => {
  const found = [];

  for (let index = 0; index < text.length;) {
    const token = tokenOrder.find((candidate) => text.startsWith(candidate, index));

    if (token) {
      found.push({ token, index });
      index += token.length;
    } else {
      index += 1;
    }
  }

  return found;
};

export const analyzeSymbols = (text) => {
  const counts = new Map();
  tokenizeSymbols(text).forEach(({ token }) => counts.set(token, (counts.get(token) || 0) + 1));

  return symbolTokens
    .filter((token) => counts.has(token))
    .map((token) => ({ token, count: counts.get(token) }));
};

export const removeSymbolToken = (text, target) => {
  const matches = tokenizeSymbols(text);
  if (!matches.length) return text;

  let cursor = 0;
  let result = '';

  matches.forEach(({ token, index }) => {
    result += text.slice(cursor, index);
    if (token !== target) result += token;
    cursor = index + token.length;
  });

  return result + text.slice(cursor);
};
