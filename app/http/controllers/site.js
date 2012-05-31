/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
createRedisClient = require('../../../lib/redis'),

logger = require('../../../lib/logger'),
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

exports.signout = function(req, res){
  if (req.user){
    var redis = createRedisClient();
    redis.publish('user.signout', req.user.id.toString(), function(err){
    if (err)
      logger.error(err);
    });
  }
  req.logout();
  res.redirect('/');
};
