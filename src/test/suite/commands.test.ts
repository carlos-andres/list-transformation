import * as assert from 'assert';
import * as vscode from 'vscode';

type Range = [number, number];

// Waits for the document change, not the command: v0.3.0 resolved before its edit landed, and this suite must also run against it (FR-018).
async function runOn(content: string, selection: Range | undefined, command: string): Promise<string> {
    const document = await vscode.workspace.openTextDocument({ content });
    const editor = await vscode.window.showTextDocument(document);
    if (selection) {
        editor.selection = new vscode.Selection(document.positionAt(selection[0]), document.positionAt(selection[1]));
    }
    const changed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error('the document did not change within 2 s'));
        }, 2000);
        const listener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === document) {
                clearTimeout(timer);
                listener.dispose();
                resolve();
            }
        });
    });
    await vscode.commands.executeCommand(command);
    await changed;
    return document.getText();
}

suite('Command Test Suite', function () {
    this.timeout(10000);

    const original = {
        showInputBox: vscode.window.showInputBox,
        showQuickPick: vscode.window.showQuickPick,
        showErrorMessage: vscode.window.showErrorMessage,
    };
    let quickPicks = 0;
    let errors: string[] = [];

    function stubPrompts(columnKey: string | undefined, picks: (string | undefined)[]) {
        quickPicks = 0;
        errors = [];
        Object.assign(vscode.window, {
            showInputBox: () => Promise.resolve(columnKey),
            showQuickPick: () => {
                quickPicks++;
                return Promise.resolve(picks.shift());
            },
            showErrorMessage: (message: string) => {
                errors.push(message);
                return Promise.resolve(undefined);
            },
        });
    }

    teardown(async () => {
        Object.assign(vscode.window, original);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    });

    test('orderAndCleanList on the whole document', async () => {
        const text = await runOn("banana\n'apple'\n\ncherry", undefined, 'extension.orderAndCleanList');
        assert.strictEqual(text, 'apple\nbanana\ncherry');
    });

    test('orderAndCleanList on a selection', async () => {
        const text = await runOn('keep\nb\na\nend', [5, 8], 'extension.orderAndCleanList');
        assert.strictEqual(text, 'keep\na\nb\nend');
    });

    test('removeDuplicatesOnList on the whole document', async () => {
        const text = await runOn('apple\norange\napple\nbanana', undefined, 'extension.removeDuplicatesOnList');
        assert.strictEqual(text, 'apple\norange\nbanana');
    });

    test('removeDuplicatesOnList on a selection', async () => {
        const text = await runOn('x\na\nb\na\nx', [2, 7], 'extension.removeDuplicatesOnList');
        assert.strictEqual(text, 'x\na\nb\nx');
    });

    test('toCommaSeparated on the whole document', async () => {
        const text = await runOn('a\nb,\n"c"', undefined, 'extension.toCommaSeparated');
        assert.strictEqual(text, 'a, b, c');
    });

    test('toCommaSeparated on a selection', async () => {
        const text = await runOn('x\na\nb\ny', [2, 5], 'extension.toCommaSeparated');
        assert.strictEqual(text, 'x\na, b\ny');
    });

    test('toQuotedCommaSeparated on the whole document', async () => {
        const text = await runOn('a\nb,\n"c"', undefined, 'extension.toQuotedCommaSeparated');
        assert.strictEqual(text, "'a', 'b', 'c'");
    });

    test('toQuotedCommaSeparated on a selection', async () => {
        const text = await runOn('x\na\nb\ny', [2, 5], 'extension.toQuotedCommaSeparated');
        assert.strictEqual(text, "x\n'a', 'b'\ny");
    });

    test('fromCommaSeparatedToLines on the whole document', async () => {
        const text = await runOn('a, b,c', undefined, 'extension.fromCommaSeparatedToLines');
        assert.strictEqual(text, 'a\nb\nc');
    });

    test('fromCommaSeparatedToLines on a selection', async () => {
        const text = await runOn('x\na, b\ny', [2, 6], 'extension.fromCommaSeparatedToLines');
        assert.strictEqual(text, 'x\na\nb\ny');
    });

    test('listToSqlLike with mysql and OR on the whole document', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn("a\nit's,\nb", undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%a%' OR\n`col` LIKE '%it''s%' OR\n`col` LIKE '%b%'");
    });

    test('listToSqlLike with sqlserver and AND on a selection', async () => {
        stubPrompts('col', ['sqlserver', 'AND']);
        const text = await runOn('x\na\nb\ny', [2, 5], 'extension.listToSqlLike');
        assert.strictEqual(text, "x\n[col] LIKE '%a%' AND\n[col] LIKE '%b%'\ny");
    });

    test('A10: Escape on the column prompt returns silently', async () => {
        stubPrompts(undefined, ['mysql', 'OR']);
        await vscode.commands.executeCommand('extension.listToSqlLike');
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(quickPicks, 0);
    });

    test('A10: Escape on the database prompt returns silently', async () => {
        stubPrompts('col', [undefined, 'OR']);
        await vscode.commands.executeCommand('extension.listToSqlLike');
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(quickPicks, 1);
    });

    test('A10: Escape on the conjunction prompt returns silently', async () => {
        stubPrompts('col', ['mysql', undefined]);
        await vscode.commands.executeCommand('extension.listToSqlLike');
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(quickPicks, 2);
    });

    test('listToSqlLike with an empty column shows the error', async () => {
        stubPrompts('', ['mysql', 'OR']);
        await vscode.commands.executeCommand('extension.listToSqlLike');
        assert.strictEqual(errors.length, 1);
        assert.match(errors[0], /^You must provide a column key/);
    });

    test('A07: a command resolves after its edit has landed', async () => {
        const document = await vscode.workspace.openTextDocument({ content: 'a\nb' });
        await vscode.window.showTextDocument(document);
        const applied = await vscode.commands.executeCommand('extension.toCommaSeparated');
        assert.strictEqual(applied, true);
        assert.strictEqual(document.getText(), 'a, b');
    });

    test('A22: listToSqlLike drops a line that cleans to empty', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn("a\n,\n''\nb", undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%a%' OR\n`col` LIKE '%b%'");
    });

    test('A22: toCommaSeparated drops a line that cleans to empty', async () => {
        const text = await runOn("a\n,\n''\nb", undefined, 'extension.toCommaSeparated');
        assert.strictEqual(text, 'a, b');
    });

    test('A22: toQuotedCommaSeparated drops a line that cleans to empty', async () => {
        const text = await runOn("a\n,\n''\nb", undefined, 'extension.toQuotedCommaSeparated');
        assert.strictEqual(text, "'a', 'b'");
    });

    test('A22: orderAndCleanList drops a line that cleans to empty', async () => {
        const text = await runOn("b\n''\na", undefined, 'extension.orderAndCleanList');
        assert.strictEqual(text, 'a\nb');
    });

    test('A24: orderAndCleanList drops a line that is only a comma', async () => {
        const text = await runOn("banana\n'apple'\ncherry\n\nbanana\n\"date\"\n,\n''\nelderberry", undefined, 'extension.orderAndCleanList');
        assert.strictEqual(text, 'apple\nbanana\nbanana\ncherry\ndate\nelderberry');
    });

    test('A24: the comma commands strip the quotes of a quoted item with a trailing comma', async () => {
        const input = "'apple',\n\"banana\",\n'cherry'";
        const plain = await runOn(input, undefined, 'extension.toCommaSeparated');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        const quoted = await runOn(input, undefined, 'extension.toQuotedCommaSeparated');
        assert.strictEqual(plain, 'apple, banana, cherry');
        assert.strictEqual(quoted, "'apple', 'banana', 'cherry'");
    });

    test('A24: an indented quoted item with a trailing comma is cleaned', async () => {
        const input = "    'apple',\n    'banana',";
        const plain = await runOn(input, undefined, 'extension.toCommaSeparated');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        const quoted = await runOn(input, undefined, 'extension.toQuotedCommaSeparated');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        const ordered = await runOn(input, undefined, 'extension.orderAndCleanList');
        assert.strictEqual(plain, 'apple, banana');
        assert.strictEqual(quoted, "'apple', 'banana'");
        assert.strictEqual(ordered, 'apple\nbanana');
    });

    test('A24: spaces outside quotes are trimmed before the quotes are stripped', async () => {
        const input = " 'apple' \n\t\"banana\"";
        const plain = await runOn(input, undefined, 'extension.toCommaSeparated');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        const quoted = await runOn(input, undefined, 'extension.toQuotedCommaSeparated');
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        const ordered = await runOn(input, undefined, 'extension.orderAndCleanList');
        assert.strictEqual(plain, 'apple, banana');
        assert.strictEqual(quoted, "'apple', 'banana'");
        assert.strictEqual(ordered, 'apple\nbanana');
    });

    test('A25: removeDuplicatesOnList drops an empty line and a lone comma', async () => {
        const text = await runOn('apple\n\n,\nbanana', undefined, 'extension.removeDuplicatesOnList');
        assert.strictEqual(text, 'apple\nbanana');
    });

    test('A25: removeDuplicatesOnList dedupes items that clean to the same value', async () => {
        const text = await runOn("apple\napple,\n'apple'\nbanana", undefined, 'extension.removeDuplicatesOnList');
        assert.strictEqual(text, 'apple\nbanana');
    });

    test('A26: orderAndCleanList sorts numbers naturally', async () => {
        const text = await runOn('10\n9\n100\n1', undefined, 'extension.orderAndCleanList');
        assert.strictEqual(text, '1\n9\n10\n100');
    });

    test('A26: orderAndCleanList sorts an accented letter with its base letter', async () => {
        const text = await runOn('zebra\nÁrbol', undefined, 'extension.orderAndCleanList');
        assert.strictEqual(text, 'Árbol\nzebra');
    });

    test('A27: listToSqlLike escapes % for mysql', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn('50%', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%50!%%' ESCAPE '!'");
    });

    test('A27: listToSqlLike adds ESCAPE to a mysql value ending in a backslash', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn('a\\', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%a\\\\%' ESCAPE '!'");
    });

    test('A27: listToSqlLike escapes _ and [ for sqlserver', async () => {
        stubPrompts('col', ['sqlserver', 'OR']);
        const text = await runOn('a_b\n[x]', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "[col] LIKE '%a!_b%' ESCAPE '!' OR\n[col] LIKE '%![x]%' ESCAPE '!'");
    });

    test('A27: listToSqlLike adds ESCAPE to an other value with a backslash', async () => {
        stubPrompts('col', ['other', 'OR']);
        const text = await runOn('back\\slash', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "\"col\" LIKE '%back\\slash%' ESCAPE '!'");
    });

    test('A27: listToSqlLike doubles ! before it escapes %', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn('hi!5%', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%hi!!5!%%' ESCAPE '!'");
    });

    test('A27: listToSqlLike leaves a value with no wildcard unchanged', async () => {
        stubPrompts('col', ['mysql', 'OR']);
        const text = await runOn('wow!\napple', undefined, 'extension.listToSqlLike');
        assert.strictEqual(text, "`col` LIKE '%wow!%' OR\n`col` LIKE '%apple%'");
    });

    async function runWithArgs(content: string, args: unknown): Promise<string> {
        const document = await vscode.workspace.openTextDocument({ content });
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('extension.listToSqlLike', args);
        return document.getText();
    }

    for (const [dbType, conjunction] of [['mysql', 'OR'], ['sqlserver', 'AND'], ['pgsql', 'OR'], ['other', 'AND']]) {
        test(`listToSqlLike with ${dbType} and ${conjunction} args gives the prompt output without prompting`, async () => {
            const input = "a\nit's\n50%_off\nback\\slash";
            stubPrompts('my col', [dbType, conjunction]);
            const prompted = await runOn(input, undefined, 'extension.listToSqlLike');
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            stubPrompts(undefined, []);
            const text = await runWithArgs(input, { column: 'my col', dbType, conjunction });
            assert.strictEqual(text, prompted);
            assert.notStrictEqual(text, input);
            assert.strictEqual(quickPicks, 0);
            assert.deepStrictEqual(errors, []);
        });
    }

    for (const args of [{ column: '', dbType: 'mysql', conjunction: 'OR' }, { column: 'col', dbType: 'oracle', conjunction: 'OR' }, { column: 'col', dbType: 'mysql', conjunction: 'OR', extra: 1 }, 'col']) {
        test(`listToSqlLike with invalid args ${JSON.stringify(args)} edits nothing and shows an error`, async () => {
            stubPrompts('col', ['mysql', 'OR']);
            const text = await runWithArgs('a\nb', args);
            assert.strictEqual(text, 'a\nb');
            assert.strictEqual(quickPicks, 0);
            assert.strictEqual(errors.length, 1);
            assert.match(errors[0], /^Invalid SQL LIKE arguments/);
        });
    }

    test('A28: the database prompt offers mysql, sqlserver, pgsql and other', async () => {
        const offered: unknown[] = [];
        stubPrompts('col', ['pgsql', 'OR']);
        const pick = vscode.window.showQuickPick;
        Object.assign(vscode.window, {
            showQuickPick: (items: unknown, options: unknown) => {
                offered.push(items);
                return pick(items as string[], options as vscode.QuickPickOptions);
            },
        });
        const text = await runOn('a"b', undefined, 'extension.listToSqlLike');
        assert.deepStrictEqual(offered, [['mysql', 'sqlserver', 'pgsql', 'other'], ['AND', 'OR']]);
        assert.strictEqual(text, "\"col\" LIKE '%a\"b%'");
    });
});
