#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


//TODO: Selectively load app modules based on what kind of server this is...
const 
feedDaemon = require('./app/feeds/daemon.js'),
serializer = require('./app/serializer.js'),
IrcBot     = require('./app/irc/bot.js'),
httpd      = require('./app/http/server.js');

var bot = new IrcBot();
bot.connect();