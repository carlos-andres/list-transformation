import * as assert from 'assert';
import { OrderAndCleanListTransformation, ToCommaSeparatedTransformation, ToQuotedCommaSeparatedTransformation, CommaSeparatedToLinesTransformation, ToSqlLikeTransformation, RemoveDuplicatesOnListTransformation, duplicateSummary } from '../../extension'; 

suite('Extension Test Suite', () => {
    test('OrderAndCleanListTransformation should order and clean a list', () => {
        const transformation = new OrderAndCleanListTransformation();
        const input = 'banana\napple\n\norange';
        const expected = 'apple\nbanana\norange';
        assert.strictEqual(transformation.transform(input), expected);
    });

    test('ToCommaSeparatedTransformation should transform list to comma separated line', () => {
        const transformation = new ToCommaSeparatedTransformation();
        const input = 'banana\napple\norange';
        const expected = 'banana, apple, orange';
        assert.strictEqual(transformation.transform(input), expected);
    });

    test('ToQuotedCommaSeparatedTransformation should transform list to quoted, comma separated line', () => {
        const transformation = new ToQuotedCommaSeparatedTransformation();
        const input = 'banana\napple\norange';
        const expected = '\'banana\', \'apple\', \'orange\'';
        assert.strictEqual(transformation.transform(input), expected);
    });

    test('CommaSeparatedToLinesTransformation should transform comma separated string into lines', () => {
        const transformation = new CommaSeparatedToLinesTransformation();
        const input = 'banana, apple, orange';
        const expected = 'banana\napple\norange';
        assert.strictEqual(transformation.transform(input), expected);
    });

    test('A04: ToCommaSeparatedTransformation skips whitespace-only lines', () => {
        assert.strictEqual(new ToCommaSeparatedTransformation().transform('a\n   \nb'), 'a, b');
    });

    test('A04: ToQuotedCommaSeparatedTransformation skips whitespace-only lines', () => {
        assert.strictEqual(new ToQuotedCommaSeparatedTransformation().transform('a\n   \nb'), "'a', 'b'");
    });

    test('A01: CommaSeparatedToLinesTransformation keeps items with spaces and mixed lines', () => {
        const transformation = new CommaSeparatedToLinesTransformation();
        assert.strictEqual(transformation.transform('New York, Los Angeles'), 'New York\nLos Angeles');
        assert.strictEqual(transformation.transform('a, b c, d'), 'a\nb c\nd');
        assert.strictEqual(transformation.transform('a\nb, c'), 'a\nb\nc');
    });

    test('CommaSeparatedToLinesTransformation keeps line-separated input and quoted items', () => {
        const transformation = new CommaSeparatedToLinesTransformation();
        assert.strictEqual(transformation.transform('a,\nb,'), 'a,\nb,');
        assert.strictEqual(transformation.transform('"a, b", c'), '"a, b"\nc');
        assert.strictEqual(transformation.transform("'a', 'b'"), "'a'\n'b'");
    });

	test('ToSqlLikeTransformation should transform list to SQL LIKE clauses', () => {
		const transformation = new ToSqlLikeTransformation('fruit', 'mysql', 'OR');
		const input = 'banana\napple\norange';
		const expected = "`fruit` LIKE '%banana%' OR\n`fruit` LIKE '%apple%' OR\n`fruit` LIKE '%orange%'";
		assert.strictEqual(transformation.transform(input), expected);
	});

    test('A02: ToSqlLikeTransformation doubles a backslash for mysql only', () => {
        const input = "a\\'b OR 1=1 --";
        assert.strictEqual(new ToSqlLikeTransformation('col', 'mysql', 'OR').transform(input), "`col` LIKE '%a\\\\''b OR 1=1 --%' ESCAPE '!'");
        assert.strictEqual(new ToSqlLikeTransformation('col', 'sqlserver', 'OR').transform(input), "[col] LIKE '%a\\''b OR 1=1 --%'");
        assert.strictEqual(new ToSqlLikeTransformation('col', 'other', 'OR').transform(input), "\"col\" LIKE '%a\\''b OR 1=1 --%' ESCAPE '!'");
    });

    test('A03: ToSqlLikeTransformation skips whitespace-only lines', () => {
        const output = new ToSqlLikeTransformation('col', 'mysql', 'OR').transform('a\n   \nb');
        assert.ok(!output.includes("LIKE '%%'"), output);
        assert.strictEqual(output, "`col` LIKE '%a%' OR\n`col` LIKE '%b%'");
    });

    test('A05: ToSqlLikeTransformation doubles the backtick in a mysql column', () => {
        assert.strictEqual(new ToSqlLikeTransformation('a`b', 'mysql', 'OR').transform('x'), "`a``b` LIKE '%x%'");
    });

    test('A05: ToSqlLikeTransformation doubles the closing bracket in a sqlserver column', () => {
        assert.strictEqual(new ToSqlLikeTransformation('a]b', 'sqlserver', 'OR').transform('x'), "[a]]b] LIKE '%x%'");
    });

    test('A05: ToSqlLikeTransformation doubles the double quote in an other column', () => {
        assert.strictEqual(new ToSqlLikeTransformation('a"b', 'other', 'OR').transform('x'), '"a""b" LIKE \'%x%\'');
    });

    test('A28: ToSqlLikeTransformation gives pgsql the same output as other', () => {
        const input = "50%_off\nO'Brien\nback\\slash\na\\'b\nhi!5%\nplain\n[x]";
        for (const column of ['col', 'a"b']) {
            for (const conjunction of ['AND', 'OR'] as const) {
                const other = new ToSqlLikeTransformation(column, 'other', conjunction).transform(input);
                assert.strictEqual(new ToSqlLikeTransformation(column, 'pgsql', conjunction).transform(input), other);
            }
        }
        assert.strictEqual(new ToSqlLikeTransformation('a"b', 'pgsql', 'OR').transform("50%_off\nO'Brien\nback\\slash"),
            "\"a\"\"b\" LIKE '%50!%!_off%' ESCAPE '!' OR\n\"a\"\"b\" LIKE '%O''Brien%' OR\n\"a\"\"b\" LIKE '%back\\slash%' ESCAPE '!'");
    });

    test('RemoveDuplicatesOnListTransformation should remove duplicate lines', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        const input = 'apple\norange\nbanana\napple\nbanana\ngrape';
        const expected = 'apple\norange\nbanana\ngrape'; // The expected result after removing duplicates.
        const actual = transformation.transform(input);
        assert.strictEqual(actual, expected);
    });

    test('RemoveDuplicatesOnListTransformation counts cleaned duplicates, not blank or lone-comma lines', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform("apple\n\n,\napple,\n'apple'\nbanana"), 'apple\nbanana');
        assert.strictEqual(transformation.removed, 2);
        assert.strictEqual(transformation.unique, 2);
    });

    test('RemoveDuplicatesOnListTransformation counts 0 removed on an all-unique list', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform('a\nb\nc'), 'a\nb\nc');
        assert.strictEqual(transformation.removed, 0);
        assert.strictEqual(transformation.unique, 3);
    });

    test('RemoveDuplicatesOnListTransformation counts nothing on blank and lone-comma lines', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform('\n  \n,\n'), '');
        assert.strictEqual(transformation.removed, 0);
        assert.strictEqual(transformation.unique, 0);
        assert.strictEqual(transformation.emptyDropped, true);
    });

    test('RemoveDuplicatesOnListTransformation drops nothing on an empty input', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform(''), '');
        assert.strictEqual(transformation.removed, 0);
        assert.strictEqual(transformation.emptyDropped, false);
    });

    for (const [input, text] of [
        ['a\nb\nc\na', 'Removed 1 duplicate, 3 unique values left | Duplicates: a'],
        ['a\na\na\na', 'Removed 3 duplicates, 1 unique value left | Duplicates: a'],
        ["apple\n\n,\napple,\n'apple'\nbanana", 'Removed 2 duplicates, 2 unique values left, empty lines dropped | Duplicates: apple'],
        ['a\na\n', 'Removed 1 duplicate, 1 unique value left | Duplicates: a'],
        ['a\r\na\r\n', 'Removed 1 duplicate, 1 unique value left | Duplicates: a'],
        ['a\n\na', 'Removed 1 duplicate, 1 unique value left, empty lines dropped | Duplicates: a'],
        ['a\n   \na', 'Removed 1 duplicate, 1 unique value left, empty lines dropped | Duplicates: a'],
        ['b\na\na\nb', 'Removed 2 duplicates, 2 unique values left | Duplicates: b, a'],
        ['[x](command:a)\n[x](command:a)', 'Removed 1 duplicate, 1 unique value left | Duplicates: [x] (command:a)'],
    ] as const) {
        test(`FR-018: Remove Duplicates on ${JSON.stringify(input)} reads "${text}"`, () => {
            const transformation = new RemoveDuplicatesOnListTransformation();
            transformation.transform(input);
            assert.strictEqual(duplicateSummary(transformation), text);
        });
    }

    test('FR-017: the duplicates of the FR-003 input are apple', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        transformation.transform("apple\n\n,\napple,\n'apple'\nbanana");
        assert.deepStrictEqual(transformation.duplicates, ['apple']);
    });

    test('FR-017: a value seen 4 times is listed once', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        transformation.transform('a\na\nb\na\na');
        assert.deepStrictEqual(transformation.duplicates, ['a']);
    });

    test('FR-017: the duplicates keep the order of their first occurrence', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        transformation.transform('c\nb\na\na\nb\nc');
        assert.deepStrictEqual(transformation.duplicates, ['c', 'b', 'a']);
    });

    test('FR-017: a value without a duplicate is not listed', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        transformation.transform('a\nb\nc\nb');
        assert.deepStrictEqual(transformation.duplicates, ['b']);
        transformation.transform('a\nb\nc');
        assert.deepStrictEqual(transformation.duplicates, []);
    });

    const Q = "'apple', 'apple', 'apple', 'banana', 'item 10', 'item 2', 'item 2', 'cherry'";
    const C = 'apple, apple, apple, banana, item 10, item 2, item 2, cherry';
    const D = '"apple", "apple", "banana"';
    const like = ['apple', 'apple', 'apple', 'banana', 'item 10', 'item 2', 'item 2', 'cherry'].map(value => `\`data\` LIKE '%${value}%'`).join(' AND\n');
    const one = {
        1: () => new OrderAndCleanListTransformation(),
        2: () => new ToQuotedCommaSeparatedTransformation(),
        3: () => new ToCommaSeparatedTransformation(),
        5: () => new ToSqlLikeTransformation('data', 'mysql', 'AND'),
        6: () => new RemoveDuplicatesOnListTransformation(),
    };
    for (const [name, input, command, expected] of [
        ['Q', Q, 1, "'apple', 'apple', 'apple', 'banana', 'cherry', 'item 2', 'item 2', 'item 10'"],
        ['Q', Q, 2, Q],
        ['Q', Q, 3, C],
        ['Q', Q, 5, like],
        ['Q', Q, 6, "'apple', 'banana', 'item 10', 'item 2', 'cherry'"],
        ['C', C, 1, 'apple, apple, apple, banana, cherry, item 2, item 2, item 10'],
        ['C', C, 2, Q],
        ['C', C, 3, C],
        ['C', C, 5, like],
        ['C', C, 6, 'apple, banana, item 10, item 2, cherry'],
        ['D', D, 1, D],
        ['D', D, 2, "'apple', 'apple', 'banana'"],
        ['D', D, 3, 'apple, apple, banana'],
        ['D', D, 6, '"apple", "banana"'],
        ['mixed quotes', "'a', b, 'a'", 6, 'a, b'],
        ['Smith, John', 'Smith, John', 6, 'Smith, John'],
        ['Smith, John', 'Smith, John', 1, 'John, Smith'],
        ["'Smith, John'", "'Smith, John'", 1, 'Smith, John'],
        ["'a, b', c, c", "'a, b', c, c", 6, "'a, b', c"],
        [`"it's, ok", c, c`, `"it's, ok", c, c`, 6, `"it's, ok", c`],
        ['1,000', '1,000', 1, '1,000'],
        ['1,000, 2,000, 1,000', '1,000, 2,000, 1,000', 6, '1,000, 2,000'],
    ] as const) {
        test(`FR-024: command ${command} on the one-line list ${name} gives ${JSON.stringify(expected)}`, () => {
            assert.strictEqual(one[command]().transform(input), expected);
        });
    }

    test('FR-025: Remove Duplicates counts the values of the one-line list Q', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        transformation.transform(Q);
        assert.strictEqual(duplicateSummary(transformation), 'Removed 3 duplicates, 5 unique values left | Duplicates: apple, item 2');
    });

    test('FR-024: a line with only a trailing comma is not a one-line list', () => {
        for (const command of [1, 2, 3, 6] as const) {
            assert.strictEqual(one[command]().transform('a,'), command === 2 ? "'a'" : 'a');
        }
    });

    test('FR-024: a multi-line list that holds an "a, b" line keeps that line as one value', () => {
        assert.strictEqual(one[1]().transform('c\na, b\nc'), 'a, b\nc\nc');
        assert.strictEqual(one[2]().transform('c\na, b'), "'c', 'a, b'");
        assert.strictEqual(one[6]().transform('c\na, b\nc'), 'c\na, b');
    });

    test('FR-025: a whole document with a final line break is a one-line list', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform(`${Q}\n`), "'apple', 'banana', 'item 10', 'item 2', 'cherry'");
        assert.strictEqual(transformation.emptyDropped, false);
        assert.strictEqual(one[1]().transform(`${C}\r\n`), 'apple, apple, apple, banana, cherry, item 2, item 2, item 10');
    });

    test('FR-024: values joined by a comma without a blank keep their v0.6.0 output', () => {
        assert.strictEqual(one[1]().transform('a,b,c'), 'a,b,c');
        assert.strictEqual(one[2]().transform('a,b,c'), "'a,b,c'");
        assert.strictEqual(one[3]().transform('a,b,c'), 'a,b,c');
        assert.strictEqual(one[5]().transform('a,b,c'), "`data` LIKE '%a,b,c%'");
        assert.strictEqual(one[6]().transform('a,b,c'), 'a,b,c');
        assert.strictEqual(one[6]().transform("'a','b'"), "a','b");
    });

    test('FR-025: blank lines around the one line are ignored and reported as dropped', () => {
        const transformation = new RemoveDuplicatesOnListTransformation();
        assert.strictEqual(transformation.transform(`\n${Q}\n\n`), "'apple', 'banana', 'item 10', 'item 2', 'cherry'");
        assert.strictEqual(duplicateSummary(transformation), 'Removed 3 duplicates, 5 unique values left, empty lines dropped | Duplicates: apple, item 2');
        assert.strictEqual(one[1]().transform(` \t\n${C}\n`), 'apple, apple, apple, banana, cherry, item 2, item 2, item 10');
    });
});

