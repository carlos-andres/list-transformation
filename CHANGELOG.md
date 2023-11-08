# Changelog

All notable changes to the "List Transformation" extension will be documented in this file.

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
