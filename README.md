# List Transformation Extension for VSCode

This Visual Studio Code extension offers a suite of list transformation commands, ideal for developers who frequently work with lists of strings. It is particularly useful in preparing data for database operations or scripting data processing tasks.
This project is the basis and we can add in the future more commands or other utils 

## Features

- **Order and Clean List**: Sort and remove duplicates from a list, preparing clean, orderly data.
- **Convert to Comma-Separated Values**: Transform a list into a single line of comma-separated values.
- **Convert to Quoted Comma-Separated Values**: Convert a list into a single line of comma-separated values, with each item enclosed in quotes.
- **Convert Comma-Separated Values to Lines**: Turn a string of comma-separated values into individual lines.
- **Convert List to SQL LIKE Clauses**: Create SQL `LIKE` clauses from a list, facilitating database searches.

## Installation

1. Launch Visual Studio Code.
2. Open the Extensions sidebar by clicking the square icon on the Activity Bar or by using the shortcut `Ctrl+Shift+X`.
3. Search for `List Transformation`.
4. Click on the `Install` button to install the extension.

## Usage

Use the Command Palette `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to access the following commands:

- **LIST: Order and Clean List**: Arrange a list in a clean, ordered format.
- **LIST: Convert to Comma Separated Values**: Take multiple lines and join them into one line separated by commas.
- **LIST: Convert to Quoted Comma Separated Values**: Convert lines into a comma-separated list, with each item quoted.
- **LIST: Convert Comma Separated Values to Lines**: Split a comma-separated string back into individual lines.
- **LIST: Convert List to SQL LIKE Clauses**: Generate a sequence of SQL LIKE statements from a list of values.

## Examples

Given a list like this:

```
Zebra123
Apple456
Echo789
```

- After using **LIST: Order and Clean List**, you'll get:

```
Apple456
Echo789
Zebra123
```

- After using **LIST: Convert to Comma Separated Values**:

```
Zebra123, Apple456, Echo789
```

- After using **LIST: Convert to Quoted Comma Separated Values**:

```
'Zebra123', 'Apple456', 'Echo789'
```

- Given a comma-separated string, using **LIST: Convert Comma Separated Values to Lines** will result in:

```
Zebra123
Apple456
Echo789
```

- Using **LIST: Convert List to SQL LIKE Clauses** with a column name of `myColumn` would produce:

```
myColumn LIKE '%Zebra123%' OR
myColumn LIKE '%Apple456%' OR
myColumn LIKE '%Echo789%'
```

## Contributing

Contributions are always welcome! Please feel free to submit pull requests or create issues for bugs and feature requests.

## License

This extension is released under the MIT License. See the LICENSE file in the repository for more information.
