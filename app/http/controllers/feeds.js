/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const
config     = require('../../../lib/configuration'),
mysql      = require('mysql').createClient(config.get('mysql')),
Url        = require('url'),
FeedParser = require('feedparser'),
logger     = require('../../../lib/logger');


/* 
 * Get for index
 */
exports.index = {
  get: function(req, res){
    mysql.query(
      "SELECT title, url, verified FROM feeds WHERE user_id = ?",
      [req.user.id],
      function(err, rows){
        res.render('feeds/index', { user: req.user, feeds: rows });
      }
    );
  }
};

exports.feed = {
  post: function(req, res){
    res.header('Content-Type', 'application/json');
    
    var parts = Url.parse(req.body.url);
    var feed = {url: req.body.url, title: null, verified: false};
    
    mysql.query(
      "DELETE FROM feeds WHERE url = ? AND user_id = ?",
      [req.body.previousUrl, req.user.id],
      function(err){
        if (err)
          logger.error("Error deleting old URL: " + err);
        else
          logger.debug("Deleted old url.");


      }
    );

    function saveFeed(){
      mysql.query(
        "REPLACE INTO feeds (url, title, verified, user_id) VALUES (?, ?, ?, ?)",
        [feed.url, feed.title, feed.verified, req.user.id],
        function(err, rows){
          if (err)
            logger.error(err);
          res.send(JSON.stringify(feed));
        }
      );
    }

    if (~['http:', 'https:'].indexOf(parts.protocol)){
      var parser = new FeedParser();

      //HACKHACK: Overwriting the parser's error handler
      parser.handleError = function(e, scope){
        logger.debug("Got an error parsing feed: " + e);
        saveFeed();
      }
  
      parser.parseUrl(feed.url, function(error, meta, articles){
        if (meta.title){
          feed.title = meta.title;
          feed.verified = true;
        }
        logger.debug('Feed all good.');
        saveFeed();
      });
    }
    else{
      logger.debug('Feed is not http or https. It is: ' + parts.protocol);
      if (feed.url == ''){
        res.send(JSON.stringify(feed));
      }
      else{
        saveFeed();
      }
    }
  },
  'delete': function(req, res){
    res.header('Content-Type', 'application/json');
    mysql.query(
      'DELETE FROM feeds WHERE url = ? AND user_id = ?',
      [req.body.url, req.user.id],
      function(err, rows){
        if (err){
          logger.error(err);
          res.send('"ERROR"', {status: 500});
        }
        else{
          res.send('"OK"');
        }
      }
    )
  }
}