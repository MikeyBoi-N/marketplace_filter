import { describe, expect, it } from 'vitest';
import { compileTerm, termMatches } from './keywords';

const matches = (term: string, text: string) => termMatches(compileTerm(term)!, text);

describe('keyword terms', () => {
  it('matches whole words case-insensitively', () => {
    expect(matches('case', 'iPhone CASE included')).toBe(true);
    expect(matches('case', 'glass showcase')).toBe(false);
  });

  it('supports prefix wildcards', () => {
    expect(matches('part*', 'sold for parts')).toBe(true);
    expect(matches('part*', 'counterpart')).toBe(false);
  });

  it('supports alternatives and quoted phrases', () => {
    expect(matches('ps5 | xbox', 'Xbox Series X')).toBe(true);
    expect(matches('"for repair"', 'needs work, for   repair')).toBe(true);
    expect(matches('"for repair"', 'repair kit for sale')).toBe(false);
  });

  it('treats regex characters literally', () => {
    expect(matches('c++', 'learn c++ book')).toBe(true);
    expect(matches('a.b', 'axb')).toBe(false);
  });

  it('ignores empty terms', () => {
    expect(compileTerm('  ')).toBeNull();
    expect(compileTerm(' | ')).toBeNull();
  });
});
