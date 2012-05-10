#!/usr/bin/env node


//TODO: Selectively load app modules based on what kind of server this is...
const crawler = require('./app/crawler/daemon.js');
const httpd = require('./app/http/server.js');

