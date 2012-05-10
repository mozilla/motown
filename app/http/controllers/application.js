/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

exports.authenticate = function(req, res, next){
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

exports.allowCorsRequests = function(req, resp){
  resp.header('Access-Control-Allow-Origin', '*');
  resp.send('');
};
