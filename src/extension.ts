import * as vscode from 'vscode';
import { dbTypes, registerPanel, restoreCommand, sqlLikeArgs, SqlLikeArgs } from './panel';

export interface TextTransformation {
    transform(input: string): string;
}

abstract class BaseTransformation implements TextTransformation {
    abstract transform(input: string): string;

    /**
     * Removes quotes from a line of text and trims whitespace.
     * @param {string} line - The line of text to sanitize.
     * @returns {string} - The sanitized line.
     */
    protected sanitizeLine(line: string): string {
        // An index walk, not /^['"]+|['"]+$/g: that regex is quadratic on a long run of quotes inside a line.
        const isQuote = (char: string) => char === "'" || char === '"';
        let start = 0;
        let end = line.length;
        while (start < end && isQuote(line[start])) {
            start++;
        }
        while (end > start && isQuote(line[end - 1])) {
            end--;
        }
        return line.slice(start, end).trim();
    }

    protected cleanItem(line: string): string {
        return this.sanitizeLine(line.trim().replace(/,\s*$/, '').trim());
    }

    protected cleanLines(input: string, list = this.oneLineList(input)): string[] {
        return (list ?? input.split(/\r?\n/)).map(line => this.cleanItem(line)).filter(line => line.trim() !== '');
    }

    // A single comma-separated line, such as the output of the comma commands, is read as its values.
    protected oneLineList(input: string): string[] | undefined {
        const lines = input.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length !== 1) {
            return undefined;
        }
        const line = lines[0];
        // Only a comma followed by a blank, the separator commands 2 and 3 write, ends a value, so 1,000 stays one value.
        const spans: [number, number][] = [];
        let end = 0;
        for (const token of this.tokens(line)) {
            const start = line.indexOf(token, end);
            end = start + token.length;
            if (spans.length > 0 && token[0] !== ' ' && token[0] !== '\t') {
                spans[spans.length - 1][1] = end;
            } else {
                spans.push([start, end]);
            }
        }
        const values = spans.map(([from, to]) => line.slice(from, to).trim()).filter(value => value !== '');
        return values.length > 1 ? values : undefined;
    }

    protected joinLikeInput(list: string[] | undefined, values: string[]): string {
        if (!list) {
            return values.join('\n');
        }
        const quote = ["'", '"'].find(char => list.every(value => value.length > 1 && value.startsWith(char) && value.endsWith(char)));
        if (quote) {
            return values.map(value => `${quote}${value}${quote}`).join(', ');
        }
        // A value that holds the separator is quoted, so the line reads back as the same values.
        return values.map(value => /,[ \t]/.test(value) ? (value.includes("'") ? `"${value}"` : `'${value}'`) : value).join(', ');
    }

    // The same tokens as input.match(/[ \t]*(["']).*?\1(?=[ \t]*(?:,|\r?\n|$))|[^,\r\n]+/g), in linear time: that regex is quadratic on unclosed quotes.
    protected tokens(input: string): string[] {
        const n = input.length;
        const isBlank = (char: string) => char === ' ' || char === '\t';
        const isStop = (char: string) => char === ',' || char === '\r' || char === '\n';
        // closer[quote][i]: the first quote at or after i that is followed by blanks and then a comma, a line break or the end, without crossing a line break.
        const closer: Record<string, number[]> = { "'": new Array<number>(n + 1).fill(-1), '"': new Array<number>(n + 1).fill(-1) };
        let blankEnd = n;
        for (let i = n - 1; i >= 0; i--) {
            const char = input[i];
            const next = input[blankEnd];
            const closes = blankEnd === n || next === ',' || next === '\n' || (next === '\r' && input[blankEnd + 1] === '\n');
            const breaksLine = char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';
            for (const quote of ["'", '"']) {
                closer[quote][i] = breaksLine ? -1 : char === quote && closes ? i : closer[quote][i + 1];
            }
            if (!isBlank(char)) {
                blankEnd = i;
            }
        }

        const items: string[] = [];
        let start = 0;
        while (start < n) {
            if (isStop(input[start])) {
                start++;
                continue;
            }
            let quoteAt = start;
            while (quoteAt < n && isBlank(input[quoteAt])) {
                quoteAt++;
            }
            const quote = input[quoteAt];
            let end = (quote === "'" || quote === '"' ? closer[quote][quoteAt + 1] : -1) + 1;
            if (end === 0) {
                end = start;
                while (end < n && !isStop(input[end])) {
                    end++;
                }
            }
            items.push(input.slice(start, end));
            start = end;
        }
        return items;
    }
}

const naturalOrder = new Intl.Collator(undefined, { numeric: true }).compare;

export class OrderAndCleanListTransformation extends BaseTransformation {
    /**
     * Transforms the input text by ordering and cleaning the list.
     * @param {string} input - The input text containing the list.
     * @returns {string} - The ordered and cleaned list.
     */
    transform(input: string): string {
        const list = this.oneLineList(input);
        const lines = this.cleanLines(input, list);

        return this.joinLikeInput(list, lines.sort(naturalOrder));
    }
}

export class ToCommaSeparatedTransformation extends BaseTransformation {
    /**
     * Transforms the input text into a comma-separated line.
     * @param {string} input - The input text containing the list.
     * @returns {string} - The comma-separated line.
     */
    transform(input: string): string {
        const transformedLines = this.cleanLines(input);

        return transformedLines.join(', ');
    }
}

export class ToQuotedCommaSeparatedTransformation extends BaseTransformation {
    /**
     * Transforms the input text into a quoted, comma-separated line.
     * @param {string} input - The input text containing the list.
     * @returns {string} - The quoted, comma-separated line.
     */
    transform(input: string): string {
        const transformedLines = this.cleanLines(input)
            .map(line => `'${line}'`);
        return transformedLines.join(', ');
    }
}

export class CommaSeparatedToLinesTransformation extends BaseTransformation {
    /**
     * Transforms the input text from a comma-separated string into individual lines.
     * @param {string} input - The input text containing the comma-separated values.
     * @returns {string} - The text with values separated by new lines.
     */
    transform(input: string): string {
        const isAlreadyLineSeparated = input.split(/\r?\n/).every(line =>
            line.match(/^([^'",\r\n]+,?)$/)
        );

        if (isAlreadyLineSeparated) {
            return input;
        }

        return this.tokens(input).map(item => item.trim()).filter(item => item !== '').join('\n');
    }
}

export class ToSqlLikeTransformation extends BaseTransformation {
    private columnKey: string;
    private dbType: SqlLikeArgs['dbType'];
    private conjunction: 'AND' | 'OR';

    /**
     * Initializes a new instance of the ToSqlLikeTransformation class with the ability to specify the logical conjunction for the LIKE clauses.
     * @param {string} columnKey - The SQL column key to be used in the LIKE clause.
     * @param {SqlLikeArgs['dbType']} dbType - The type of database (affects column name quoting).
     * @param {'AND' | 'OR'} conjunction - The logical conjunction ('AND' or 'OR') to use between LIKE clauses.
     */
    constructor(columnKey: string, dbType: SqlLikeArgs['dbType'] = 'mysql', conjunction: 'AND' | 'OR' = 'OR') {
        super();
        this.columnKey = columnKey;
        this.dbType = dbType;
        this.conjunction = conjunction;
    }

    /**
     * Transforms the input text into a series of SQL LIKE clauses concatenated by the specified logical conjunction.
     * @param {string} input - The input text containing the list of strings to be used in the LIKE clauses.
     * @returns {string} - The resulting SQL LIKE clause string, with each condition concatenated by the specified conjunction.
     */
    transform(input: string): string {
        const column = this.quoteColumnName(this.columnKey);
        return this.cleanLines(input)
            .map(value => {
                // `\` is a trigger because MySQL and PostgreSQL read it as the LIKE escape when no ESCAPE clause is given
                if (!(this.dbType === 'sqlserver' ? /[%_[]/ : /[%_\\]/).test(value)) {
                    return `${column} LIKE '%${this.escapeValue(value)}%'`;
                }
                const marked = value.replace(/!/g, '!!').replace(this.dbType === 'sqlserver' ? /[%_[]/g : /[%_]/g, '!$&');
                return `${column} LIKE '%${this.escapeValue(marked)}%' ESCAPE '!'`;
            })
            .join(` ${this.conjunction}\n`);
    }

    private escapeValue(value: string): string {
        // MySQL reads a backslash as an escape inside string literals unless NO_BACKSLASH_ESCAPES is set
        const escaped = this.dbType === 'mysql' ? value.replace(/\\/g, '\\\\') : value;
        return escaped.replace(/'/g, "''");
    }

    /**
     * Quotes the column name according to the specified database type.
     * @param {string} columnName - The column name to quote.
     * @returns {string} - The quoted column name appropriate for the specified database type.
     */
    private quoteColumnName(columnName: string): string {
        switch (this.dbType) {
            case 'mysql':
                return `\`${columnName.replace(/`/g, '``')}\``;
            case 'sqlserver':
                return `[${columnName.replace(/]/g, ']]')}]`;
            case 'pgsql':
            case 'other':
                return `"${columnName.replace(/"/g, '""')}"`;
        }
    }
}

export class RemoveDuplicatesOnListTransformation extends BaseTransformation {
    private removedCount = 0;
    private uniqueCount = 0;
    private emptyDroppedFlag = false;
    private duplicateValues: string[] = [];

    get removed(): number {
        return this.removedCount;
    }

    get unique(): number {
        return this.uniqueCount;
    }

    get emptyDropped(): boolean {
        return this.emptyDroppedFlag;
    }

    get duplicates(): readonly string[] {
        return this.duplicateValues;
    }

    /**
     * Transforms the input string by removing duplicate lines.
     * @param {string} input - The input string containing potential duplicate lines.
     * @returns {string} A string with duplicates removed, preserving the order of appearance.
     */
    transform(input: string): string {
        const list = this.oneLineList(input);
        const lines = this.cleanLines(input, list);
        const counts = new Map<string, number>();
        for (const line of lines) {
            counts.set(line, (counts.get(line) ?? 0) + 1);
        }
        this.removedCount = lines.length - counts.size;
        this.uniqueCount = counts.size;
        this.duplicateValues = Array.from(counts).filter(([, count]) => count > 1).map(([value]) => value);
        const rawLines = input.split(/\r?\n/);
        // the empty line after a final line break is not a dropped line, or almost every whole-document run would report one
        const rawCount = rawLines.length - (rawLines.at(-1) === '' ? 1 : 0);
        // a one-line list has more values than lines, so only a blank line around it counts
        this.emptyDroppedFlag = list ? rawCount > 1 : rawCount > lines.length;
        return this.joinLikeInput(list, Array.from(counts.keys()));
    }
}

export function duplicateSummary({ removed, unique, emptyDropped, duplicates }: RemoveDuplicatesOnListTransformation): string {
    // the toast turns [text](command:...) into a clickable link, and the values come from the file
    const list = duplicates.join(', ').replaceAll('](', '] (');
    return `Removed ${removed} ${removed === 1 ? 'duplicate' : 'duplicates'}, ${unique} ${unique === 1 ? 'unique value' : 'unique values'} left${emptyDropped ? ', empty lines dropped' : ''} | Duplicates: ${list}`;
}

/**
 * Applies a given text transformation to the currently selected text in the editor, or the whole document if nothing is selected.
 * @param {TextTransformation} transformation - The text transformation to apply.
 */
function transformText(transformation: TextTransformation): Thenable<boolean> | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const document = editor.document;
        const text = editor.selection.isEmpty ? document.getText() : document.getText(editor.selection);
        const transformedText = transformation.transform(text);
        return editor.edit(editBuilder => {
            const range = editor.selection.isEmpty
                ? new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
                : editor.selection;
            editBuilder.replace(range, transformedText);
        });
    }
}

async function sqlLike(arg?: unknown): Promise<ToSqlLikeTransformation | undefined> {
    // Any extension or keybinding can pass an argument, so it is checked here and not only in the pane.
    if (arg !== undefined) {
        const args = sqlLikeArgs(arg);
        if (!args) {
            void vscode.window.showErrorMessage('Invalid SQL LIKE arguments: expected a column (1-128 characters, no control characters), a dbType of mysql, sqlserver, pgsql or other, and a conjunction of AND or OR.');
            return;
        }
        return new ToSqlLikeTransformation(args.column, args.dbType, args.conjunction);
    }
    const columnKey = await vscode.window.showInputBox({ prompt: "Enter the SQL column key for the LIKE query" });
    if (columnKey === undefined) {
        return;
    }
    const dbType = await vscode.window.showQuickPick(dbTypes, { placeHolder: 'Select the database type' }) as SqlLikeArgs['dbType'] | undefined;
    if (dbType === undefined) {
        return;
    }
    const conjunction = await vscode.window.showQuickPick(['AND', 'OR'], { placeHolder: 'Choose how to concatenate the conditions (AND/OR)' }) as 'AND' | 'OR' | undefined;
    if (conjunction === undefined) {
        return;
    }

    if (!columnKey) {
        void vscode.window.showErrorMessage('You must provide a column key, select a valid database type, and choose a conjunction for the SQL LIKE command.');
        return;
    }
    return new ToSqlLikeTransformation(columnKey, dbType, conjunction);
}

const commands: [string, (arg?: unknown) => TextTransformation | undefined | Promise<TextTransformation | undefined>][] = [
    ['extension.orderAndCleanList', () => new OrderAndCleanListTransformation()],
    ['extension.toQuotedCommaSeparated', () => new ToQuotedCommaSeparatedTransformation()],
    ['extension.toCommaSeparated', () => new ToCommaSeparatedTransformation()],
    ['extension.fromCommaSeparatedToLines', () => new CommaSeparatedToLinesTransformation()],
    ['extension.listToSqlLike', sqlLike],
    ['extension.removeDuplicatesOnList', () => new RemoveDuplicatesOnListTransformation()],
];

export function activate(context: vscode.ExtensionContext) {
    const snapshots = new Map<string, { text: string; version: number }>();
    for (const [id, factory] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, async (arg?: unknown) => {
            const transformation = await factory(arg);
            const document = vscode.window.activeTextEditor?.document;
            const entry = document && snapshots.get(document.uri.toString());
            const chainStart = transformation && (entry && entry.version === document?.version ? entry.text : document?.getText());
            const applied = transformation && await transformText(transformation);
            if (applied === true && document && chainStart !== undefined) {
                snapshots.set(document.uri.toString(), { text: chainStart, version: document.version });
            }
            if (applied === true && transformation instanceof RemoveDuplicatesOnListTransformation && transformation.removed > 0
                && vscode.workspace.getConfiguration('listTransformation').get('removeDuplicates.showSummary') === true) {
                // not awaited: the command resolves when the edit lands, not when the toast closes
                void vscode.window.showInformationMessage(duplicateSummary(transformation));
            }
            return applied;
        }));
    }
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => snapshots.delete(document.uri.toString())));
    context.subscriptions.push(vscode.commands.registerCommand(restoreCommand, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            void vscode.window.showInformationMessage('Nothing to restore.');
            return;
        }
        const { document } = editor;
        const key = document.uri.toString();
        const entry = snapshots.get(key);
        if (!entry || document.getText() === entry.text) {
            snapshots.delete(key);
            void vscode.window.showInformationMessage('Nothing to restore.');
            return;
        }
        if (document.version !== entry.version && await vscode.window.showWarningMessage('The document was edited after the last transformation. Restore the original list?',
            { modal: true, detail: 'Your edits since then will be lost. Undo brings them back.' }, 'Restore') !== 'Restore') {
            return;
        }
        const restored = await editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), entry.text);
        });
        if (restored) {
            snapshots.delete(key);
        }
        return restored;
    }));

    const manifest = context.extension.packageJSON as { contributes: { commands: { command: string; title: string }[] } };
    const titles = new Map(manifest.contributes.commands.map(({ command, title }) => [command, title]));
    registerPanel(context, commands.map(([id]) => [id, titles.get(id) ?? id] as const));
}

export function deactivate() { }