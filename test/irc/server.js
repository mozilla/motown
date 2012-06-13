#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
var 
Server = require('ircdjs/lib/server').Server,
path = require('path');

// TODO: Maybe try to listen on unix socket or JS stream object instead of TCP
var server = new Server();

server.config = { 
  'network':  'motown',
  'hostname': 'localhost',
  'serverDescription': 'A Node IRC daemon',
  'serverName': 'irc.motown.test',
  'port': 6667,
  'motd': 'Message of the day',
  'whoWasLimit': 10000,
  'token': 1,
  'idleTimeout': 60
}

server.debug = true;

process.on('SIGTERM', function() {
  server.close();
});

module.exports = server;
