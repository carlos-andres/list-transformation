import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
	// The folder containing the Extension Manifest package.json
	// Passed to `--extensionDevelopmentPath`
	const extensionDevelopmentPath = path.resolve(__dirname, '../../');

	// The path to test runner
	// Passed to --extensionTestsPath
	const extensionTestsPath = path.resolve(__dirname, './suite/index');

	const editors = [
		{ name: 'VSCodium', vscodeExecutablePath: process.env.VSCODIUM_PATH || '/Applications/VSCodium.app/Contents/MacOS/VSCodium' },
		// engines.vscode floor, downloaded into .vscode-test
		{ name: 'VS Code 1.125.0', version: '1.125.0' },
	];
	const failed: string[] = [];
	for (const { name, ...editor } of editors) {
		console.log(`Running tests in ${name}`);
		try {
			await runTests({ ...editor, extensionDevelopmentPath, extensionTestsPath });
		} catch (err) {
			console.error(`Failed to run tests in ${name}`, err);
			failed.push(name);
		}
	}
	if (failed.length) {
		console.error(`Tests failed in: ${failed.join(', ')}`);
		process.exit(1);
	}
}

void main();
