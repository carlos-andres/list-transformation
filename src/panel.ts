import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

const sqlLikeCommand = 'extension.listToSqlLike';
export const restoreCommand = 'extension.restoreOriginalList';
export const dbTypes = ['mysql', 'sqlserver', 'pgsql', 'other'] as const;
const conjunctions = ['AND', 'OR'] as const;

export interface SqlLikeArgs {
    column: string;
    dbType: typeof dbTypes[number];
    conjunction: typeof conjunctions[number];
}

function isPlainObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
    const keys = Reflect.ownKeys(value);
    return keys.length === expected.length && expected.every(key => keys.includes(key));
}

export function allowedCommand(message: unknown, ids: readonly string[]): string | undefined {
    if (!isPlainObject(message) || !hasExactKeys(message, ['command'])) {
        return;
    }
    const id = (message as { command?: unknown }).command;
    return typeof id === 'string' && ids.includes(id) ? id : undefined;
}

export function sqlLikeArgs(value: unknown): SqlLikeArgs | undefined {
    if (!isPlainObject(value) || !hasExactKeys(value, ['column', 'dbType', 'conjunction'])) {
        return;
    }
    // Read each field once, so a getter cannot hand the check one value and the command another.
    const { column, dbType, conjunction } = value as Record<string, unknown>;
    const name = typeof column === 'string' ? column.trim() : '';
    // Cf and the line separators also count: U+2028 splits the clause in the editor, U+202E reverses how it reads.
    const valid = name !== '' && name.length <= 128 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name)
        && dbTypes.some(type => type === dbType) && conjunctions.some(type => type === conjunction);
    return valid ? { column: name, dbType, conjunction } as SqlLikeArgs : undefined;
}

export function sqlLikeMessage(message: unknown): SqlLikeArgs | undefined {
    if (!isPlainObject(message) || !hasExactKeys(message, ['command', 'args'])) {
        return;
    }
    const { command, args } = message as { command?: unknown; args?: unknown };
    return command === sqlLikeCommand ? sqlLikeArgs(args) : undefined;
}

export function showSummaryMessage(message: unknown): boolean | undefined {
    if (!isPlainObject(message) || !hasExactKeys(message, ['showSummary'])) {
        return;
    }
    const value = (message as { showSummary?: unknown }).showSummary;
    return typeof value === 'boolean' ? value : undefined;
}

export function paneLabel(title: string): string {
    return title.replace(/^LIST: /, '');
}

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => entities[char]);
}

const radios = (name: string, values: readonly string[], checked: string) => values.map(value =>
    `<label class="choice"><input type="radio" name="${name}" value="${value}"${value === checked ? ' checked' : ''}>${value}</label>`).join('');

const sqlLikeForm = `
            <div class="sql-form" id="sql-form" hidden>
                <label class="field" for="sql-column">Column</label>
                <input type="text" class="field-input" id="sql-column" maxlength="128" autocomplete="off" spellcheck="false">
                <fieldset><legend>Database</legend>${radios('dbType', dbTypes, 'mysql')}</fieldset>
                <fieldset><legend>Join</legend>${radios('conjunction', conjunctions, 'OR')}</fieldset>
                <div class="sql-run"><button type="button" class="run" id="sql-run">Run</button><span class="sql-hint">Esc closes</span></div>
                <p class="sql-error" id="sql-error" aria-live="polite"></p>
            </div>`;

export function panelHtml(webview: Pick<vscode.Webview, 'cspSource' | 'asWebviewUri'>, media: vscode.Uri, buttons: readonly (readonly [string, string])[], numberKeysSetting: unknown, showSummarySetting: unknown): string {
    // A workspace settings.json can hold any JSON value here, and it lands in the markup.
    const numberKeys = numberKeysSetting === true;
    const nonce = randomBytes(16).toString('base64');
    const markup = buttons.map(([id, title], index) => {
        const n = index + 1;
        const key = numberKeys ? ` aria-keyshortcuts="${n}"` : '';
        const kbd = numberKeys ? `<kbd class="key">${n}</kbd>` : '';
        const sqlLike = id === sqlLikeCommand;
        const expands = sqlLike ? ' aria-expanded="false" aria-controls="sql-form"' : '';
        return `        <li><button type="button" class="action" data-command="${escapeHtml(id)}"${key}${expands}>${kbd}<span class="label">${escapeHtml(paneLabel(title))}</span></button>${sqlLike ? sqlLikeForm : ''}</li>`;
    }).join('\n');
    const summary = `\n    <p class="hint"><label class="choice"><input type="checkbox" id="show-summary"${showSummarySetting === true ? ' checked' : ''}>Enable duplicate notifications</label></p>`;
    const hint = numberKeys ? `\n    <p class="hint">Press 1–${buttons.length} to run, ↑ ↓ to move, Enter to run</p>` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css')).toString()}">
</head>
<body data-number-keys="${numberKeys}">
    <ol class="actions" aria-label="Transformations">
${markup}
    </ol>
    <button type="button" id="restore">Restore original</button>${summary}${hint}
    <script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js')).toString()}"></script>
</body>
</html>`;
}

export function registerPanel(context: vscode.ExtensionContext, buttons: readonly (readonly [string, string])[]) {
    const ids = [...buttons.map(([id]) => id), restoreCommand];
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('listTransformation.panel', {
        resolveWebviewView(view) {
            const render = () => {
                const config = vscode.workspace.getConfiguration('listTransformation');
                view.webview.html = panelHtml(view.webview, media, buttons, config.get<unknown>('panel.numberKeys', true), config.get<unknown>('removeDuplicates.showSummary', true));
            };
            view.webview.options = { enableScripts: true, localResourceRoots: [media] };
            render();
            const listener = vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('listTransformation')) {
                    render();
                }
            });
            view.onDidDispose(() => {
                listener.dispose();
            });
            view.webview.onDidReceiveMessage((message: unknown) => {
                const id = allowedCommand(message, ids);
                if (id) {
                    void vscode.commands.executeCommand(id);
                    return;
                }
                const args = sqlLikeMessage(message);
                if (args) {
                    void vscode.commands.executeCommand(sqlLikeCommand, args);
                    return;
                }
                const showSummary = showSummaryMessage(message);
                if (showSummary !== undefined) {
                    void vscode.workspace.getConfiguration('listTransformation').update('removeDuplicates.showSummary', showSummary, vscode.ConfigurationTarget.Global)
                        .then(undefined, (error: unknown) => {
                            void vscode.window.showErrorMessage(`Could not save the duplicate notifications setting: ${error instanceof Error ? error.message : String(error)}`);
                            render();
                        });
                }
            });
        },
    }));
}
