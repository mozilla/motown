/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../../../lib/configuration');


/*
 * GET home page.
 */
exports.index = function(req, res){
  res.render('site/index', { user: req.user });
};


// POST /auth/browserid
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  BrowserID authentication will verify the assertion obtained from
//   the browser via the JavaScript API.
exports.authenticate = function(req, res) {
  res.redirect('/');
};
exports.logout = function(req, res){
  req.logout();
  res.redirect('/');
};
