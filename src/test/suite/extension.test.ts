import * as assert from 'assert';
import { OrderAndCleanListTransformation, ToCommaSeparatedTransformation, ToQuotedCommaSeparatedTransformation, CommaSeparatedToLinesTransformation, ToSqlLikeTransformation, RemoveDuplicatesOnListTransformation } from '../../extension'; 

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
});

