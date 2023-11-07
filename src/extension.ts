import * as vscode from 'vscode';

export interface TextTransformation {
    transform(input: string): string;
}

class BaseTransformation implements TextTransformation {
    /**
     * Performs the text transformation.
     * @param {string} input - The input text to transform.
     * @throws Will throw an error if the method is not implemented.
     */
    transform(input: string): string {
        throw new Error('Method not implemented.');
    }

    /**
     * Removes quotes from a line of text and trims whitespace.
     * @param {string} line - The line of text to sanitize.
     * @returns {string} - The sanitized line.
     */
    protected sanitizeLine(line: string): string {
        return line.replace(/^['"]+|['"]+$/g, '').trim();
    }
}

export class OrderAndCleanListTransformation extends BaseTransformation {
    /**
     * Transforms the input text by ordering and cleaning the list.
     * @param {string} input - The input text containing the list.
     * @param {'ASC' | 'DESC'} order - The order direction, ascending or descending.
     * @returns {string} - The ordered and cleaned list.
     */
    transform(input: string, order: 'ASC' | 'DESC' = 'ASC'): string {
        const lines = input
            .split(/\r?\n/)
            .filter(line => line.trim() !== '')
            .map(line => this.sanitizeLine(line));

        const sortedLines = lines.sort();
        if (order === 'DESC') {
            sortedLines.reverse();
        }

        return sortedLines.join('\n');
    }
}

export class ToCommaSeparatedTransformation extends BaseTransformation {
    /**
     * Transforms the input text into a comma-separated line.
     * @param {string} input - The input text containing the list.
     * @returns {string} - The comma-separated line.
     */
    transform(input: string): string {
        const transformedLines = input
            .split(/\r?\n/)
            .filter(line => line)
            .map(line => this.sanitizeLine(line).replace(/,\s*$/, ''));

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
        const transformedLines = input
            .split(/\r?\n/)
            .filter(line => line)
            .map(line => `'${this.sanitizeLine(line).replace(/,\s*$/, '')}'`);
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

        const items = input.match(/(".*?"|'.*?'|[^"',\s]+)(?=\s*,|\s*$)/g);
        if (!items) {
            return '';
        }
        return items.map(item => item.trim()).join('\n');
    }
}

export class ToSqlLikeTransformation extends BaseTransformation {
    private columnKey: string;
    private dbType: 'mysql' | 'sqlserver' | 'other';
    private conjunction: 'AND' | 'OR';

    /**
     * Initializes a new instance of the ToSqlLikeTransformation class with the ability to specify the logical conjunction for the LIKE clauses.
     * @param {string} columnKey - The SQL column key to be used in the LIKE clause.
     * @param {'mysql' | 'sqlserver' | 'other'} dbType - The type of database (affects column name quoting).
     * @param {'AND' | 'OR'} conjunction - The logical conjunction ('AND' or 'OR') to use between LIKE clauses.
     */
    constructor(columnKey: string, dbType: 'mysql' | 'sqlserver' | 'other' = 'mysql', conjunction: 'AND' | 'OR' = 'OR') {
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
        return input.split(/\r?\n/)
            .filter(line => line)
            .map(line => line.replace(/,\s*$/, ''))
            .map(cleanedLine => `${this.quoteColumnName(this.columnKey)} LIKE '%${this.sanitizeLine(cleanedLine).replace(/'/g, "''")}%'`)
            .join(` ${this.conjunction}\n`);
    }

    /**
     * Quotes the column name according to the specified database type.
     * @param {string} columnName - The column name to quote.
     * @returns {string} - The quoted column name appropriate for the specified database type.
     */
    private quoteColumnName(columnName: string): string {
        switch (this.dbType) {
            case 'mysql':
                return `\`${columnName}\``;
            case 'sqlserver':
                return `[${columnName}]`;
            case 'other':
                return `"${columnName}"`;
            default:
                throw new Error(`Unsupported database type: ${this.dbType}`);
        }
    }
}


/**
 * Applies a given text transformation to the currently selected text in the editor, or the whole document if nothing is selected.
 * @param {TextTransformation} transformation - The text transformation to apply.
 */
function transformText(transformation: TextTransformation): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const document = editor.document;
        const text = editor.selection.isEmpty ? document.getText() : document.getText(editor.selection);
        const transformedText = transformation.transform(text);
        editor.edit(editBuilder => {
            const range = editor.selection.isEmpty
                ? new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
                : editor.selection;
            editBuilder.replace(range, transformedText);
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposableCommands: vscode.Disposable[] = [];
    disposableCommands.push(vscode.commands.registerCommand('extension.orderAndCleanList', () => {
        transformText(new OrderAndCleanListTransformation());
    }));
    disposableCommands.push(vscode.commands.registerCommand('extension.toQuotedCommaSeparated', () => {
        transformText(new ToQuotedCommaSeparatedTransformation());
    }));
    disposableCommands.push(vscode.commands.registerCommand('extension.toCommaSeparated', () => {
        transformText(new ToCommaSeparatedTransformation());
    }));
    disposableCommands.push(vscode.commands.registerCommand('extension.fromCommaSeparatedToLines', () => {
        transformText(new CommaSeparatedToLinesTransformation());
    }));

    disposableCommands.push(vscode.commands.registerCommand('extension.listToSqlLike', async () => {
        const columnKey = await vscode.window.showInputBox({ prompt: "Enter the SQL column key for the LIKE query" });
        const dbType = await vscode.window.showQuickPick(['mysql', 'sqlserver', 'other'], { placeHolder: 'Select the database type' }) as 'mysql' | 'sqlserver' | 'other' | undefined;
        const conjunction = await vscode.window.showQuickPick(['AND', 'OR'], { placeHolder: 'Choose how to concatenate the conditions (AND/OR)' }) as 'AND' | 'OR' | undefined;

        if (columnKey && dbType && conjunction) {
            transformText(new ToSqlLikeTransformation(columnKey, dbType, conjunction));
        } else {
            vscode.window.showErrorMessage('You must provide a column key, select a valid database type, and choose a conjunction for the SQL LIKE command.');
        }
    }));

    context.subscriptions.push(...disposableCommands);
}

export function deactivate() { }