import * as assert from 'assert';
import { OrderAndCleanListTransformation, ToCommaSeparatedTransformation, ToQuotedCommaSeparatedTransformation, CommaSeparatedToLinesTransformation, ToSqlLikeTransformation } from '../../extension'; // Update the import path according to your project structure.

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

	test('ToSqlLikeTransformation should transform list to SQL LIKE clauses', () => {
		const transformation = new ToSqlLikeTransformation('fruit', 'mysql', 'OR');
		const input = 'banana\napple\norange';
		const expected = "`fruit` LIKE '%banana%' OR\n`fruit` LIKE '%apple%' OR\n`fruit` LIKE '%orange%'";
		assert.strictEqual(transformation.transform(input), expected);
	});
});

