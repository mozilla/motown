/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
redis  = require('../../../lib/redis'),
uuid   = require('node-uuid'),
logger = require('../../../lib/logger'),
crypto = require('crypto'),
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
    redis.pub.publish('user.signout', req.user.id.toString(), function(err){
      if (err)
        logger.error(err);
    });
  }
  req.logout();
  res.redirect('/');
};


exports.driver = function(req, res){
  var storyId = null;

  if ('story' in req.body){
    storyId = req.user.email + ":" + uuid.v1()
    var hash = crypto.createHash('md5').update(req.user.email).digest("hex");

    var story = {
      id: storyId,
      people: req.user.email,
      title: req.body.story.title,
      href: req.body.story.url,
      pubdate: new Date(),
      image: {url: "http://www.gravatar.com/avatar/" + hash + "?s=30"}
    };

    redis.io.lpush("serializer:stories", JSON.stringify({'userIds': [req.user.id], 'story': story}), function (err, reply) {
      if (err)
        logger.error(err);
    });
  }
  res.render('site/driver', {user: req.user, lastId: storyId});
}