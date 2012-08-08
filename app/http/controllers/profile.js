/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config = require('../../../lib/configuration'),
uuid   = require('node-uuid'),
logger = require('../../../lib/logger'),
mysql  = require('mysql').createClient(config.get('mysql')),
Redis  = require('../../../lib/redis');

/* 
 * Get for index
 */
exports.index = {
  get: function(req, res){
    res.render('profile/index', { user: req.user });
  },
  put: function(req, res){
    // Only allow the saving of nick and realName
    req.user.nick = req.body.user.nick;
    req.user.realName = req.body.user.realName;
    req.user.save(function(err){
      if (err){
        logger.error("Error saving user in profile.js:" + err);
        res.send('"ERROR"', {status: 500});
      }
      else{
        res.send('"OK"');
      }
    });
  }
};

/*
 * POST 
 */
exports.nick = {
  post: function(req, resp){
    // Look up the other details from the nick.
    var responseQueue = "irc-resp:" + uuid.v1();
    var redis = Redis.new();
    redis.lpush("irc:whois", JSON.stringify([req.body.user.nick, responseQueue]));
    resp.header('Content-Type', 'application/json');

    // Wait on reponse queue for 10 secs(max)
    redis.brpop(responseQueue, 2, function(err, data){
      redis.quit();

      req.user.nick = req.body.user.nick;

      if (data) {
        var whois = JSON.parse(data[1]);
        
        req.user.realName = whois.realname;
      
        resp.send(JSON.stringify({realName: req.user.realName, networks: whois.channels}));

      }
      else {
        resp.send(JSON.stringify({realName: '', networks: [], error: "No response received."}));
      }

      req.user.save(function(err){
        if (err)
          logger.error(err);
      });
      
    });
  }
};
