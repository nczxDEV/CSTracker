import { parseMatchroomInput } from '../matchroom.util';

describe('parseMatchroomInput', () => {
  it('extracts the match ID from a plain matchroom URL', () => {
    expect(
      parseMatchroomInput('https://www.faceit.com/en/cs2/room/1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff'),
    ).toBe('1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff');
  });

  it('extracts the match ID when the URL has a trailing path segment', () => {
    expect(
      parseMatchroomInput('https://www.faceit.com/en/cs2/room/1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff/scoreboard'),
    ).toBe('1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff');
  });

  it('extracts the match ID when the URL has a query string', () => {
    expect(
      parseMatchroomInput('https://www.faceit.com/de/csgo/room/1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff?tab=overview'),
    ).toBe('1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff');
  });

  it('works with different language segments and the legacy csgo slug', () => {
    expect(
      parseMatchroomInput('https://www.faceit.com/fr/csgo/room/1-abcdefff-1111-2222-3333-444455556666'),
    ).toBe('1-abcdefff-1111-2222-3333-444455556666');
  });

  it('falls back to treating the input as a raw match ID when it is not a matchroom URL', () => {
    expect(parseMatchroomInput('1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff')).toBe(
      '1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(parseMatchroomInput('  1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff  ')).toBe(
      '1-2acd9f19-aaaa-bbbb-cccc-ddddeeeeffff',
    );
  });
});
