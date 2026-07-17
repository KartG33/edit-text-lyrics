import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSymbols,
  applyCommand,
  applyChain,
  commandGroups,
  removeSymbolToken,
  transforms,
} from '../src/lib/transforms.js';

test('Every visible command is registered and returns text', () => {
  const commandIds = commandGroups.flatMap((group) => group.commands.map((command) => command.id));
  const source = '  [Verse 1: Soft]\nhello,world  !\n\n- first\n- second  ';

  assert.equal(new Set(commandIds).size, commandIds.length);
  for (const commandId of commandIds) {
    const result = applyCommand(commandId, source);
    assert.equal(typeof result, 'string', `${commandId} must return a string`);
  }
});

test('Cleanup: spaces and edges preserve line breaks', () => {
  assert.equal(transforms.spaces('  one\t\t two\n three  '), ' one two\n three ');
  assert.equal(transforms.edges('  one  \n\ttwo\t'), 'one\ntwo');
});

test('Cleanup: sentence capitalizes the first letter after sentence punctuation', () => {
  assert.equal(
    transforms.sentence('hello. «привет!» how are you? fine'),
    'Hello. «Привет!» How are you? Fine',
  );
});

test('Cleanup: punctuation before treats repeated punctuation as one run', () => {
  assert.equal(transforms.punctuationBefore('Wait  ! What , now ?'), 'Wait! What, now?');
});

test('Cleanup: Space, normalizes spaces after commas only', () => {
  assert.equal(transforms.punctuationAfter('Привет,мир'), 'Привет, мир');
  assert.equal(transforms.punctuationAfter('Привет,   мир'), 'Привет, мир');
  assert.equal(transforms.punctuationAfter('Привет, мир'), 'Привет, мир');
  assert.equal(transforms.punctuationAfter('Привет,\nмир'), 'Привет,\nмир');
  assert.equal(transforms.punctuationAfter('Привет,   \nмир'), 'Привет,   \nмир');
});

test('Cleanup: Space, leaves structured values and other punctuation unchanged', () => {
  const source = [
    'Версия 3.14',
    'Время 12:30',
    'https://example.com/path?x=1',
    'mail@example.com',
    'song.mp3',
    'Точки. Двоеточия: точки с запятой; вопросы? и восклицания!',
  ].join('\n');

  assert.equal(transforms.punctuationAfter(source), source);
});

test('Format commands normalize empty lines and inline lists', () => {
  assert.equal(transforms.lineOne('a\n\n\n\n\nb'), 'a\n\n\nb');
  assert.equal(transforms.lineX('a\n  \n\nb'), 'a\nb');
  assert.equal(transforms.inline(' one \n\n two '), 'one two');
  assert.equal(transforms.inlineComma(' one \n\n two '), 'one, two');
});

test('Suno commands clean, space and split lyrics structure', () => {
  const source = '[Verse 1: Melodic]\nfirst line\n[Chorus]\nhook';
  assert.equal(transforms.sunoClean(source), '[Verse 1]\nfirst line\n[Chorus]\nhook');
  assert.equal(
    transforms.sunoSpace('[Verse 1]\nfirst line\n[Chorus]\nhook'),
    '[Verse 1]\n\nfirst line\n\n[Chorus]\n\nhook',
  );
  assert.equal(transforms.sunoUpper('[Verse 1]\nfirst line'), '[Verse 1]\nFirst line');
  assert.equal(transforms.sunoLyrics(source), 'first line\nhook');
  assert.equal(transforms.sunoStructure(source), '[Verse 1: Melodic]\n[Chorus]');
});

test('Presets apply commands strictly in chain order', () => {
  assert.equal(applyChain(['edges', 'upper'], ' one \n two '), 'ONE\nTWO');
});

test('Symbol Analyzer recognizes overlapping tokens independently', () => {
  const source = '# ## ### #### - -- --- ---- . ...';
  assert.deepEqual(
    analyzeSymbols(source).map(({ token, count }) => [token, count]),
    [
      ['.', 1], ['-', 1], ['#', 1], ['##', 1], ['--', 1], ['###', 1], ['---', 1], ['...', 1], ['####', 1], ['----', 1],
    ],
  );
});

test('Removing a short token leaves longer forms untouched', () => {
  assert.equal(removeSymbolToken('# ## ### ####', '#'), ' ## ### ####');
  assert.equal(removeSymbolToken('- -- --- ----', '--'), '-  --- ----');
  assert.equal(removeSymbolToken('\" \"\" \"\"\"', '\"'), ' \"\" \"\"\"');
});
