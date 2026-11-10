const vscode = acquireVsCodeApi();
const buttons = [...document.querySelectorAll('button[data-command]')];
const numberKeys = document.body.dataset.numberKeys === 'true';

const form = document.getElementById('sql-form');
const formToggle = buttons.find(button => button.getAttribute('aria-controls') === 'sql-form');
const column = document.getElementById('sql-column');
const error = document.getElementById('sql-error');

buttons.forEach((button, index) => {
    button.tabIndex = index === 0 ? 0 : -1;
    button.addEventListener('click', () => {
        if (button === formToggle) {
            setFormOpen(form.hidden);
        } else {
            vscode.postMessage({ command: button.dataset.command });
        }
    });
});

const checked = name => form.querySelector(`input[name="${name}"]:checked`)?.value;
const state = vscode.getState() ?? {};
column.value = typeof state.column === 'string' ? state.column : '';
for (const name of ['dbType', 'conjunction']) {
    // matched by value, not by a selector: the saved value could hold a quote
    const saved = [...form.querySelectorAll(`input[name="${name}"]`)].find(radio => radio.value === state[name]);
    if (saved) {
        saved.checked = true;
    }
}

const values = () => ({ column: column.value, dbType: checked('dbType'), conjunction: checked('conjunction') });
const run = () => {
    const name = column.value.trim();
    // the same characters sqlLikeArgs rejects in src/panel.ts, so Run never posts a message the extension drops
    error.textContent = name === '' ? 'Enter a column name' : /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(name) ? 'The column has a hidden character' : '';
    if (error.textContent) {
        column.focus();
        return;
    }
    vscode.postMessage({ command: formToggle.dataset.command, args: values() });
};

form.addEventListener('input', () => vscode.setState(values()));
column.addEventListener('input', () => {
    error.textContent = '';
});
column.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        run();
    }
});
document.getElementById('sql-run').addEventListener('click', run);

function setFormOpen(open) {
    form.hidden = !open;
    formToggle.setAttribute('aria-expanded', String(open));
    if (open) {
        column.focus();
    }
}

document.addEventListener('focusin', event => {
    if (buttons.includes(event.target)) {
        for (const button of buttons) {
            button.tabIndex = button === event.target ? 0 : -1;
        }
    }
});

function focusAt(index) {
    buttons[(index + buttons.length) % buttons.length].focus();
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !form.hidden) {
        event.preventDefault();
        setFormOpen(false);
        formToggle.focus();
        return;
    }
    // the form's fields keep digits and arrows for themselves
    if (form.contains(event.target)) {
        return;
    }
    const current = buttons.indexOf(document.activeElement);
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (digit) {
        const button = buttons[digit[1] - 1];
        if (numberKeys && button && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            // a held key would otherwise run the transformation once per repeat
            if (!event.repeat) {
                button.click();
            }
        }
        return;
    }
    switch (event.key) {
        case 'ArrowDown':
            focusAt(current + 1);
            break;
        case 'ArrowUp':
            focusAt(Math.max(current, 0) - 1);
            break;
        case 'Home':
            focusAt(0);
            break;
        case 'End':
            focusAt(buttons.length - 1);
            break;
        default:
            return;
    }
    event.preventDefault();
});
