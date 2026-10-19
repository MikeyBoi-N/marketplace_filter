/**
 * Keyword terms are matched as whole words, case-insensitively.
 *  - `"for parts"`   exact phrase (quotes optional; spaces match any whitespace)
 *  - `part*`         prefix wildcard: parts, partial, ...
 *  - `ps5 | xbox`    alternatives: either one satisfies the term
 */
export interface CompiledTerm {
  source: string;
  alternatives: RegExp[];
}

export interface CompiledKeywords {
  include: CompiledTerm[];
  exclude: CompiledTerm[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compileAlternative(raw: string): RegExp | null {
  const text = raw.trim().replace(/^"(.*)"$/, '$1').trim().toLowerCase();
  if (!text || text === '*') return null;
  const wildcard = text.endsWith('*');
  const body = escapeRegExp(wildcard ? text.slice(0, -1) : text).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${wildcard ? '' : '(?![\\p{L}\\p{N}])'}`, 'iu');
}

export function compileTerm(source: string): CompiledTerm | null {
  const alternatives = source
    .split('|')
    .map(compileAlternative)
    .filter((r): r is RegExp => r !== null);
  return alternatives.length ? { source: source.trim(), alternatives } : null;
}

export function compileKeywords(include: string[], exclude: string[]): CompiledKeywords {
  const compile = (terms: string[]) => terms.map(compileTerm).filter((t): t is CompiledTerm => t !== null);
  return { include: compile(include), exclude: compile(exclude) };
}

export const termMatches = (term: CompiledTerm, text: string) => term.alternatives.some((r) => r.test(text));
