# Changelog

All notable changes to the "List Transformation" extension will be documented in this file.

## [0.6.0] - 2026-11-10

### Added

- A SQL LIKE form in the List pane: row 5 opens it under the row, with a Column field, the database type and the join (AND or OR) as radio buttons, and Run. Enter runs, Esc closes, and the pane remembers the last values. The pane checks the form's message, and the command checks its argument again, before anything runs. The Command Palette command still asks with its 3 prompts
- The `pgsql` database type (A28), in the pane and in the Command Palette. It quotes the column in double quotes and escapes wildcards like `other`, so its output equals `other`. The output of `mysql`, `sqlserver` and `other` is unchanged

### Changed

- The `lint` script fails on any warning (`--max-warnings 0`)

## [0.5.0] - 2026-11-10

### Added

- A List pane, opened from the List icon in the activity bar, with one numbered row per command. It accepts only the 6 command IDs from its rows, the keys 1-6 run a row while it has focus (setting `listTransformation.panel.numberKeys`, default `true`), and the setting `listTransformation.panel.enabled` (default `true`) hides it

### Changed

- Removed the `vscode:prepublish` script, so packaging no longer compiles by itself: run the `compile` script before you package
- `.remember/` (local session notes) is excluded from the extension package
- `pnpm audit` now ignores GHSA-3g3m-2fjr-6pw4 in `glob`, which only mocha pulls in: dev-only, and the test runner never gives `glob` an AbortSignal
- Every command that cleans lines now cleans them the same way: trim the line, drop one trailing comma, trim again, strip the surrounding quotes. This changes the output: `    'apple',`, ` 'apple' ` and `'apple' ,` now give `apple` in Order and Clean List, Convert to Comma Separated Values, Convert to Quoted Comma Separated Values and SQL LIKE, and Order and Clean List no longer keeps a trailing comma
- Remove Duplicates cleans each line the same way and drops the lines that clean to empty. This changes the output: `apple,`, `'apple'` and `apple` count as one item, and an empty line or a lone `,` is no longer kept
- Order and Clean List sorts in natural order. This changes the output: `10, 9, 100, 1` gives `1, 9, 10, 100` instead of `1, 10, 100, 9`, and an accented letter sorts next to its base letter, so `Árbol` comes before `zebra`

### Fixed

- A line that cleans to empty, such as `,` or `''`, is now dropped. This changes the output for such lines: SQL LIKE no longer writes a `LIKE '%%'` clause that matches every row, Convert to Comma Separated Values and Convert to Quoted Comma Separated Values no longer write an empty item, and Order and Clean List no longer writes an empty line
- SQL LIKE escapes the wildcards of a value with `ESCAPE '!'`. This changes the output for a value that contains `%` or `_`, or `[` on SQL Server: `50%` now gives `LIKE '%50!%%' ESCAPE '!'` and no longer matches `x50y`, and `snake_case` no longer matches `snakeXcase`. A value with a backslash now gets `ESCAPE '!'` under MySQL and other, so the backslash stays literal. A `!` in such a value is doubled. Other values are unchanged. BigQuery and Azure Synapse reject `ESCAPE`

### Security

- Stripping quotes and splitting comma-separated values now run in linear time. The regexes they replace took seconds on one crafted line, such as a long run of quotes or many unclosed quoted items, and froze the extension host meanwhile. The output is unchanged, and differential tests compare it with the old regexes
- The pane's Content-Security-Policy adds `form-action 'none'` and `base-uri 'none'`
- The pane turns the number keys on only when `listTransformation.panel.numberKeys` is `true`. Any other value from a settings file turns them off and never reaches the pane's markup

## [0.4.0]

### Changed

- Target Node.js 24 (ES2024) and VS Code `^1.125.0`
- Moved to pnpm 12 with supply-chain settings: lockfile frozen, dependency build scripts blocked, exact versions, and no version younger than 7 days
- ESLint 10 with a flat config and type-aware typescript-eslint 8, with no warnings left
- Tests run in VSCodium and in VS Code 1.125.0 through `@vscode/test-electron` 3.1.0, and each command is now tested through the command itself
- Upgraded mocha to 12 and removed the `glob` dependency (the test runner uses Node's `fs.globSync`)
- Declared support for untrusted (Restricted Mode) and virtual workspaces
- Each command now waits for its edit to be applied before it finishes

### Fixed

- Convert Comma Separated Values to Lines no longer loses words: `New York, Los Angeles` gives `New York` and `Los Angeles`, and a mix of lines and comma-separated values keeps every item
- SQL LIKE for MySQL doubles a backslash in a value, so a value such as `a\'b` can no longer end the string early
- SQL LIKE skips lines that hold only spaces, instead of writing a `LIKE '%%'` clause that matches every row
- Convert to Comma Separated Values and Convert to Quoted Comma Separated Values skip lines that hold only spaces, instead of writing empty items
- SQL LIKE doubles the closing quote of the column name (`` ` `` for MySQL, `]` for SQL Server, `"` for other)
- Pressing Escape on a SQL LIKE prompt now cancels quietly instead of showing an error; an empty column name still shows the error

## [0.3.0]

### Changed

- Updated all dependencies to latest versions
- Upgraded to Node.js 22 LTS support
- Updated TypeScript to 5.9.3
- Updated ESLint and TypeScript ESLint to latest versions
- Added `skipLibCheck` to TypeScript configuration for better compatibility


## [0.2.0]

- `RemoveDuplicatesOnListTransformation` command which removes duplicate lines from a list while maintaining the order.

## [0.1.0]

### Added

- `OrderAndCleanListTransformation` command which orders and cleans a list of items, with support for ascending (default) or descending order.
- `ToCommaSeparatedTransformation` command that converts a list of lines into a single comma-separated line.
- `ToQuotedCommaSeparatedTransformation` command for transforming a list of lines into a single comma-separated line with each item quoted.
- `CommaSeparatedToLinesTransformation` command that turns a comma-separated string into individual lines.
- `ToSqlLikeTransformation` command to create SQL LIKE clauses from a list of strings, with customization options for the column name, database type, and logical conjunction (AND/OR).
- General extension setup with activation and deactivation functions to register and clean up commands.
- Error handling for user input during the SQL LIKE transformation setup.
- Sanitization of inputs to remove quotes and trailing whitespace.

### Fixed

- Ensured consistent error messages when required input for SQL LIKE command is not provided.
- Included comprehensive input validation for all transformations to prevent unexpected behavior.

---

Note: This is the initial release of the "List Transformation" extension, encapsulating various text transformations for developers working with lists and SQL queries within VS Code.
