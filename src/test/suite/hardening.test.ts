import * as assert from 'assert';
import { CommaSeparatedToLinesTransformation, OrderAndCleanListTransformation } from '../../extension';

class Probe extends OrderAndCleanListTransformation {
    sanitize(line: string): string {
        return this.sanitizeLine(line);
    }
}

class CsvProbe extends CommaSeparatedToLinesTransformation {
    split(input: string): string[] {
        return this.tokens(input);
    }
}

function randomStrings(seed: number, count: number, maxLength: number, alphabet: string): string[] {
    let state = seed;
    const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) >>> 16;
    return Array.from({ length: count }, () => Array.from({ length: next() % (maxLength + 1) }, () => alphabet[next() % alphabet.length]).join(''));
}

const oldSanitizeLine = (line: string) => line.replace(/^['"]+|['"]+$/g, '').trim();

const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

const oldTokens = (input: string) => input.match(/[ \t]*(["']).*?\1(?=[ \t]*(?:,|\r?\n|$))|[^,\r\n]+/g) ?? [];

const tokenCorpus = [
    "New York, Los Angeles, 'San Francisco, CA', \"x, y\"",
    'a\nb, c\nd',
    'it\'s\n"quoted" word',
    '', ',', "'", "''", '" a " , b', "'a'\r\nb", "'a'\rb", "'a\u2028', b", "'a\u2029b'", "'a\u2028,b'", "'a\u2029,b'", "'a' \t", "'a'b', c", "\t'a'\t,\t'b'",
    ...[5, 30].flatMap(n => [
        rep("'", n - 1) + 'x',
        "'" + rep('a', n - 1),
        rep("'a,", n),
        rep('"a,', n),
        rep(' \t', n - 1) + 'x',
        rep("'a,", n - 1) + 'x',
        rep(" 'a,", n - 1) + 'x',
        rep("'a',", n - 2) + "'a",
        rep("don't, won't, ", n),
    ]),
];

const sanitizeCorpus = ['', "'", '"', "''", '"\'"', "'a'", '"a"', "'a", "a'", ' a ', " 'a' ", "'a' ", "'a'b'", "it's", "'it''s'", "x'''x", "'\"a\"'", "'' a ''", "\t'a'\t"];

suite('Hardening Test Suite', () => {
    test('H3: sanitizeLine gives the same output as the old regex', () => {
        const probe = new Probe();
        for (const line of [...sanitizeCorpus, ...randomStrings(1, 2000, 12, '\'"a ,\t')]) {
            assert.strictEqual(probe.sanitize(line), oldSanitizeLine(line), JSON.stringify(line));
        }
    });

    test('H4: the CSV tokenizer gives the same tokens as the old regex', () => {
        const probe = new CsvProbe();
        for (const input of [...tokenCorpus, ...randomStrings(2, 3000, 16, '\'"a ,\t\r\n')]) {
            assert.deepStrictEqual(probe.split(input), oldTokens(input), JSON.stringify(input));
        }
    });

    for (const [name, transformation, input] of [
        ['Order and Clean on a line of 1e5 quotes', new OrderAndCleanListTransformation(), 'x' + "'".repeat(1e5) + 'x'],
        ['CSV to lines on 5e4 unclosed quoted items', new CommaSeparatedToLinesTransformation(), "'a,".repeat(5e4)],
    ] as const) {
        test(`H5: ${name} finishes in under 300 ms`, () => {
            const start = performance.now();
            transformation.transform(input);
            const ms = performance.now() - start;
            assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
        });
    }
});
