import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	// A throw in the executor rejects the promise with that error.
	return new Promise((c, e) => {
		for (const file of fs.globSync("**/*.test.js", { cwd: testsRoot })) {
			mocha.addFile(path.resolve(testsRoot, file));
		}
		// Run the mocha test
		mocha.run(failures => {
			if (failures > 0) {
				e(new Error(`${failures} tests failed.`));
			} else {
				c();
			}
		});
	});
}
