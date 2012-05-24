/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../../../lib/configuration');


/*
 * GET home page.
 */
exports.sidebar = function(req, res){
  res.render('social/sidebar', { user: req.user, layout: false });
};

exports.worker = function(req, res){
  res.header('Content-Type', 'application/javascript');
  res.render('social/worker.js.ejs', { user: req.user, wsUrl: config.get("public_ws_url"), layout: false });
};
