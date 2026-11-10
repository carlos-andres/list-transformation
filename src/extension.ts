import * as vscode from 'vscode';
import { dbTypes, registerPanel, sqlLikeArgs, SqlLikeArgs } from './panel';

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

    protected cleanLines(input: string): string[] {
        return input.split(/\r?\n/).map(line => this.cleanItem(line)).filter(line => line.trim() !== '');
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
        const lines = this.cleanLines(input);

        return lines.sort(naturalOrder).join('\n');
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
    
    /**
     * Transforms the input string by removing duplicate lines.
     * @param {string} input - The input string containing potential duplicate lines.
     * @returns {string} A string with duplicates removed, preserving the order of appearance.
     */
    transform(input: string): string {
        const uniqueLines = new Set(this.cleanLines(input));
        return Array.from(uniqueLines).join('\n');
    }
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
    for (const [id, factory] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, async (arg?: unknown) => {
            const transformation = await factory(arg);
            return transformation && transformText(transformation);
        }));
    }

    const manifest = context.extension.packageJSON as { contributes: { commands: { command: string; title: string }[] } };
    const titles = new Map(manifest.contributes.commands.map(({ command, title }) => [command, title]));
    registerPanel(context, commands.map(([id]) => [id, titles.get(id) ?? id] as const));
}

export function deactivate() { }