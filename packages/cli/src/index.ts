#!/usr/bin/env node
import { CliError, describeError } from "./io.js";
import { run } from "./main.js";

run(process.argv.slice(2), { print: (l) => console.log(l) })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(`error: ${e instanceof CliError ? e.message : describeError(e)}`);
    process.exitCode = 1;
  });
