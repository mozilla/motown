#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


//TODO: Selectively load app modules based on what kind of server this is...
const rssBot = require('./app/rss/daemon.js');
const serializer = require('./app/serializer.js');
// const ircBot = require('./app/irc/daemon.js');
const httpd = require('./app/http/server.js');
