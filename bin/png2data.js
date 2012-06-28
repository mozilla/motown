#!/usr/bin/env node

var 
fs = require('fs'),
path = require('path');


function displayUsageAndQuit(){
  console.log(process.argv);
  var execPath = "./" + path.relative(process.cwd(), __filename);
  
	console.log("Usage (OS X):\n\t" + execPath + " <path to png> | pbcopy");

	process.exit(0);
}

if (process.argv.length != 3){
	displayUsageAndQuit();
}


var filePath = process.argv.pop();

var buffer = fs.readFileSync(filePath);
process.stdout.write('data:image/png;base64,');
process.stdout.write(buffer.toString('base64'));
