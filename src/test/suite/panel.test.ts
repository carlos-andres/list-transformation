import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { allowedCommand, paneLabel, panelHtml, restoreCommand, showSummaryMessage, sqlLikeArgs, sqlLikeMessage } from '../../panel';

const ids = [
    'extension.orderAndCleanList',
    'extension.toQuotedCommaSeparated',
    'extension.toCommaSeparated',
    'extension.fromCommaSeparatedToLines',
    'extension.listToSqlLike',
    'extension.removeDuplicatesOnList',
];

const buttons = ids.map(id => [id, `LIST: ${id}`] as const);
const webview = { cspSource: 'vscode-test:', asWebviewUri: (uri: vscode.Uri) => uri };
const render = (list: readonly (readonly [string, string])[], numberKeys: unknown, showSummary: unknown = true) => panelHtml(webview, vscode.Uri.file('/media'), list, numberKeys, showSummary);

class Message {
    command = 'extension.orderAndCleanList';
}

const rejected: [string, unknown][] = [
    ['an unknown ID', { command: 'workbench.action.closeAllEditors' }],
    ['a non-string command', { command: 42 }],
    ['a message with an extra field', { command: 'extension.orderAndCleanList', args: ['x'] }],
    ['null', null],
    ['an array', ['extension.orderAndCleanList']],
    ['a non-plain object', new Message()],
];

class Args {
    column = 'col';
    dbType = 'mysql';
    conjunction = 'OR';
}

const validArgs = { column: 'col', dbType: 'mysql', conjunction: 'OR' };

const rejectedArgs: [string, unknown][] = [
    ['a missing key', { column: 'col', dbType: 'mysql' }],
    ['an extra key', { ...validArgs, extra: true }],
    ['a non-plain object', new Args()],
    ['null', null],
    ['a non-string column', { ...validArgs, column: 42 }],
    ['an empty column', { ...validArgs, column: '' }],
    ['a whitespace-only column', { ...validArgs, column: ' \t ' }],
    ['a 129-character column', { ...validArgs, column: 'c'.repeat(129) }],
    ['a column with a newline', { ...validArgs, column: 'a\nb' }],
    ['a column with DEL', { ...validArgs, column: 'a\x7fb' }],
    ['a column with an inner tab', { ...validArgs, column: 'a\tb' }],
    ['a column with U+2028', { ...validArgs, column: 'a b' }],
    ['a column with U+202E', { ...validArgs, column: 'a‮b' }],
    ['a column with a zero-width space', { ...validArgs, column: 'a​b' }],
    ['an unknown dbType', { ...validArgs, dbType: 'oracle' }],
    ['a lowercase conjunction', { ...validArgs, conjunction: 'and' }],
];

const rejectedMessages: [string, unknown][] = [
    ['args on another ID', { command: 'extension.orderAndCleanList', args: validArgs }],
    ['an extra top-level key', { command: 'extension.listToSqlLike', args: validArgs, extra: 1 }],
    ['invalid args', { command: 'extension.listToSqlLike', args: { ...validArgs, dbType: 'oracle' } }],
    ['no args', { command: 'extension.listToSqlLike' }],
];

class Toggle {
    showSummary = true;
}

const rejectedToggles: [string, unknown][] = [
    ['an extra key', { showSummary: true, extra: 1 }],
    ['a missing key', {}],
    ['a non-boolean value', { showSummary: 'true' }],
    ['a non-plain object', new Toggle()],
    ['an array', [true]],
    ['null', null],
];

suite('Panel Test Suite', function () {
    this.timeout(10000);

    for (const id of ids) {
        test(`allowedCommand accepts ${id}`, () => {
            assert.strictEqual(allowedCommand({ command: id }, ids), id);
        });
    }

    for (const [name, message] of rejected) {
        test(`allowedCommand rejects ${name}`, () => {
            assert.strictEqual(allowedCommand(message, ids), undefined);
        });
    }

    for (const dbType of ['mysql', 'sqlserver', 'pgsql', 'other']) {
        for (const conjunction of ['AND', 'OR']) {
            test(`sqlLikeArgs accepts ${dbType} with ${conjunction}`, () => {
                const args = { column: 'c'.repeat(128), dbType, conjunction };
                assert.deepStrictEqual(sqlLikeArgs(args), args);
            });
        }
    }

    test('sqlLikeArgs trims the column, so a pasted tab or a trailing space names the same column', () => {
        assert.deepStrictEqual(sqlLikeArgs({ ...validArgs, column: ' col\t' }), validArgs);
    });

    for (const [name, value] of rejectedArgs) {
        test(`sqlLikeArgs rejects ${name}`, () => {
            assert.strictEqual(sqlLikeArgs(value), undefined);
        });
    }

    test('sqlLikeMessage accepts listToSqlLike with valid args', () => {
        assert.deepStrictEqual(sqlLikeMessage({ command: 'extension.listToSqlLike', args: validArgs }), validArgs);
    });

    for (const [name, message] of rejectedMessages) {
        test(`sqlLikeMessage rejects ${name}`, () => {
            assert.strictEqual(sqlLikeMessage(message), undefined);
        });
    }

    test('panelHtml renders the SQL LIKE form under row 5, closed, with the CSP unchanged', () => {
        const html = render(buttons, true);
        assert.match(html, /data-command="extension\.listToSqlLike" aria-keyshortcuts="5" aria-expanded="false" aria-controls="sql-form">.*?<\/button>\s*<div class="sql-form" id="sql-form" hidden>/);
        assert.match(html, /<label class="field" for="sql-column">Column<\/label>\s*<input type="text" class="field-input" id="sql-column" maxlength="128"/);
        assert.deepStrictEqual([...html.matchAll(/<input type="radio" name="dbType" value="(\w+)"/g)].map(([, value]) => value), ['mysql', 'sqlserver', 'pgsql', 'other']);
        assert.deepStrictEqual([...html.matchAll(/<input type="radio" name="conjunction" value="(\w+)"/g)].map(([, value]) => value), ['AND', 'OR']);
        assert.deepStrictEqual([...html.matchAll(/value="(\w+)" checked/g)].map(([, value]) => value), ['mysql', 'OR']);
        assert.ok(html.includes('<legend>Database</legend>') && html.includes('<legend>Join</legend>'));
        assert.ok(html.includes('<button type="button" class="run" id="sql-run">Run</button><span class="sql-hint">Esc closes</span>'));
        assert.ok(html.includes('<p class="sql-error" id="sql-error" aria-live="polite"></p>'));
        assert.ok(!/\son\w+=|style=|https?:/.test(html));
        assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src vscode-test:; script-src 'nonce-[A-Za-z0-9+/]{22}=='; form-action 'none'; base-uri 'none';">/);
    });

    test('the pane is shown by listTransformation.panel.enabled, which defaults to true', () => {
        const manifest = vscode.extensions.getExtension('calo.list-transformation')?.packageJSON as { contributes: { views: Record<string, { id: string; when: string }[]> } };
        const view = manifest.contributes.views.listTransformation.find(({ id }) => id === 'listTransformation.panel');
        assert.strictEqual(view?.when, 'config.listTransformation.panel.enabled');
        assert.strictEqual(vscode.workspace.getConfiguration('listTransformation').inspect<boolean>('panel.enabled')?.defaultValue, true);
    });

    test('paneLabel strips the LIST: prefix', () => {
        assert.strictEqual(paneLabel('LIST: Remove Duplicates'), 'Remove Duplicates');
    });

    test('paneLabel leaves an unprefixed title unchanged', () => {
        assert.strictEqual(paneLabel('Remove Duplicates'), 'Remove Duplicates');
    });

    test('the manifest puts the List container in the activity bar, with its icon and numberKeys on by default', () => {
        const extension = vscode.extensions.getExtension('calo.list-transformation');
        const manifest = extension?.packageJSON as { contributes: { viewsContainers: Record<string, { id: string; title: string; icon: string }[] | undefined> } };
        const container = manifest.contributes.viewsContainers.activitybar?.find(({ id }) => id === 'listTransformation');
        assert.strictEqual(container?.title, 'List');
        assert.strictEqual(manifest.contributes.viewsContainers.secondarySidebar, undefined);
        assert.ok(fs.existsSync(path.join(extension?.extensionPath ?? '', container?.icon ?? '')));
        assert.strictEqual(vscode.workspace.getConfiguration('listTransformation').inspect<boolean>('panel.numberKeys')?.defaultValue, true);
    });

    test('panelHtml with number keys on renders 6 numbered buttons, the hint and the CSP', () => {
        const html = render(buttons, true);
        assert.deepStrictEqual([...html.matchAll(/data-command="([^"]+)"/g)].map(([, id]) => id), ids);
        assert.deepStrictEqual([...html.matchAll(/<kbd class="key">(\d)<\/kbd>/g)].map(([, n]) => n), ['1', '2', '3', '4', '5', '6']);
        assert.ok(!html.includes('LIST: '));
        assert.ok(html.includes('<p class="hint">Press 1–6 to run, ↑ ↓ to move, Enter to run</p>'));
        assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src vscode-test:; script-src 'nonce-[A-Za-z0-9+/]{22}=='; form-action 'none'; base-uri 'none';">/);
    });

    test('panelHtml with number keys off renders no kbd and no hint', () => {
        const html = render(buttons, false);
        assert.strictEqual((html.match(/<button [^>]*data-command=/g) ?? []).length, 6);
        assert.ok(!html.includes('<kbd'));
        assert.ok(!html.includes('aria-keyshortcuts'));
        assert.ok(!html.includes('Press 1'));
    });

    test('panelHtml renders a non-boolean numberKeys setting as number keys off', () => {
        for (const value of ['true', 1, {}]) {
            const html = render(buttons, value);
            assert.ok(html.includes('data-number-keys="false"'));
            assert.ok(!html.includes('<kbd'));
            assert.ok(!html.includes('aria-keyshortcuts'));
            assert.ok(!html.includes('Press 1'));
        }
    });

    test('panelHtml renders the Enable duplicate notifications checkbox after the list and before the key hint', () => {
        const html = render(buttons, true, true);
        assert.match(html, /<\/ol>\s*<button type="button" id="restore">Restore original<\/button>\s*<p class="hint"><label class="choice"><input type="checkbox" id="show-summary" checked>Enable duplicate notifications<\/label><\/p>\s*<p class="hint">Press 1/);
    });

    test('FR-022: panelHtml renders Restore original after the list and before the checkbox, without data-command', () => {
        for (const numberKeys of [true, false]) {
            const html = render(buttons, numberKeys);
            const button = '<button type="button" id="restore">Restore original</button>';
            assert.strictEqual(html.split(button).length, 2);
            assert.ok(html.indexOf('</ol>') < html.indexOf(button) && html.indexOf(button) < html.indexOf('id="show-summary"'));
            assert.deepStrictEqual([...html.matchAll(/data-command="([^"]+)"/g)].map(([, id]) => id), ids);
        }
    });

    test('FR-022: allowedCommand accepts the exact restore message with the ids registerPanel uses', () => {
        assert.strictEqual(restoreCommand, 'extension.restoreOriginalList');
        assert.strictEqual(allowedCommand({ command: 'extension.restoreOriginalList' }, [...ids, restoreCommand]), 'extension.restoreOriginalList');
    });

    test('FR-022: allowedCommand rejects the restore message with an extra key', () => {
        assert.strictEqual(allowedCommand({ command: 'extension.restoreOriginalList', extra: 1 }, [...ids, restoreCommand]), undefined);
    });

    test('panelHtml renders the checkbox with number keys off too', () => {
        assert.ok(render(buttons, false, true).includes('<input type="checkbox" id="show-summary" checked>Enable duplicate notifications'));
    });

    test('panelHtml checks the checkbox only for exactly true', () => {
        for (const value of [false, 'true', 1, {}, null]) {
            const html = render(buttons, true, value);
            assert.ok(html.includes('<input type="checkbox" id="show-summary">Enable duplicate notifications'));
            assert.ok(!html.includes('checkbox" id="show-summary" checked'));
        }
    });

    for (const value of [true, false]) {
        test(`showSummaryMessage accepts {showSummary: ${value}}`, () => {
            assert.strictEqual(showSummaryMessage({ showSummary: value }), value);
        });
    }

    for (const [name, message] of rejectedToggles) {
        test(`showSummaryMessage rejects ${name}`, () => {
            assert.strictEqual(showSummaryMessage(message), undefined);
        });
    }

    test('panelHtml escapes labels and attributes', () => {
        const html = render([['a"b', 'LIST: <b>&\'']], true);
        assert.ok(html.includes('data-command="a&quot;b"'));
        assert.ok(html.includes('<span class="label">&lt;b&gt;&amp;&#39;</span>'));
    });

    test('H3: after the pane takes focus, a command still edits the active editor', async () => {
        const document = await vscode.workspace.openTextDocument({ content: "cherry\napple\n'banana'" });
        await vscode.window.showTextDocument(document);
        try {
            await vscode.commands.executeCommand('listTransformation.panel.focus');
            await new Promise(resolve => setTimeout(resolve, 500));
            assert.strictEqual(vscode.window.activeTextEditor?.document, document);

            await vscode.commands.executeCommand('extension.orderAndCleanList');
            assert.strictEqual(document.getText(), 'apple\nbanana\ncherry');
        } finally {
            // closeAllEditors would prompt to save the dirty untitled document, so revert it first.
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });
});
